import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { openai, waitForResponse } from "../lib/openai.js";
import { ENV } from "../lib/env.js";
import { saveSlate } from "../lib/store.js";
import { setCurrentSlate } from "../lib/watchlist.js";
import { getCachedSlate, saveSlateToCache, getCacheAgeMinutes } from "../lib/slateCache.js";
import { calculateBetValue, formatValueScore, getValueTier } from "../lib/valueCalc.js";

// PST timestamp helper
function getPSTTimestamp(): string {
  return new Date().toLocaleString('en-US', { 
    timeZone: 'America/Los_Angeles', 
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }) + ' PT';
}

// Ranking type
type RecType = 'chance' | 'value';

// Format styles
type FormatStyle = 'compact' | 'card' | 'bullet';

export const data = new SlashCommandBuilder()
  .setName("slate")
  .setDescription("Today's NBA bets")
  .addStringOption(option =>
    option.setName("style")
      .setDescription("Display format style")
      .setRequired(false)
      .addChoices(
        { name: "Compact (confidence bars)", value: "compact" },
        { name: "Card (boxed style)", value: "card" },
        { name: "Bullet (clean bullets)", value: "bullet" }
      )
  )
  .addStringOption(option =>
    option.setName("rank_by")
      .setDescription("How to rank the slate")
      .setRequired(false)
      .addChoices(
        { name: "🎯 Chance (likelihood to win)", value: "chance" },
        { name: "💎 Value (best edge/EV)", value: "value" }
      )
  )
  .addBooleanOption(option =>
    option.setName("refresh")
      .setDescription("Force refresh (ignore cache)")
      .setRequired(false)
  );

// Format helpers for each style
function formatGameCompact(game: any, showValue: boolean = false): string {
  // Use actual confidence if stored, otherwise estimate from star/rank
  const conf = game.confidence || (game.star ? 80 : (game.rank <= 3 ? 65 : 50));
  const value = game.value || calculateBetValue(game);
  const bars = '█'.repeat(Math.floor(conf/10)) + '░'.repeat(10 - Math.floor(conf/10));
  const valueDisplay = showValue ? `\n│ 💎 Value: ${formatValueScore(value)}` : '';
  return `┌─────────────────────────────
│ 📊 ${game.spread} | O/U ${game.total}
│ 🎯 Pick: **${game.pick}**
│ 🔥 Confidence: ${bars} ${conf}%${valueDisplay}
└─────────────────────────────
${game.analysis}`;
}

function formatGameCard(game: any, showValue: boolean = false): string {
  const conf = game.confidence || (game.star ? 80 : (game.rank <= 3 ? 65 : 50));
  const value = game.value || calculateBetValue(game);
  const confText = conf >= 75 ? '🔥🔥🔥🔥 HIGH CONFIDENCE' : (conf >= 60 ? '🔥🔥🔥 MEDIUM-HIGH' : '🔥🔥 MODERATE');
  const valueText = showValue ? `\n┃ ${getValueTier(value)}` : '';
  const bullets = game.analysis.split('. ').slice(0, 3).map((s: string) => `• ${s.trim()}`).join('\n');
  return `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 📈 ${game.spread}  │  ⚖️ O/U ${game.total}
┃ ✅ PICK: **${game.pick}** (${conf}%${showValue ? ` | 💎${value}` : ''})
┃ ${confText}${valueText}
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
${bullets}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;
}

function formatGameBullet(game: any): string {
  const bullets = game.analysis.split('. ').filter((s: string) => s.trim()).slice(0, 4).map((s: string) => `✓ ${s.trim()}`).join('\n');
  return `──────────────────────
📊 ${game.spread} | O/U ${game.total} | 🎯 **${game.pick}**

${bullets}`;
}

function formatPropCompact(prop: any): string {
  const conf = prop.confidence || (prop.star ? 80 : (prop.rank <= 2 ? 70 : 55));
  const bars = '█'.repeat(Math.floor(conf/10)) + '░'.repeat(10 - Math.floor(conf/10));
  return `**${prop.prop}:** ${prop.line} → **${prop.play}**
🔥 ${bars} ${conf}%
${prop.analysis}`;
}

function formatPropCard(prop: any): string {
  return `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ **${prop.prop}:** ${prop.line} → **${prop.play}**
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
${prop.analysis}`;
}

function formatPropBullet(prop: any): string {
  const bullets = prop.analysis.split('. ').filter((s: string) => s.trim()).slice(0, 3).map((s: string) => `✓ ${s.trim()}`).join('\n');
  return `**${prop.prop}:** ${prop.line} → **${prop.play}**
${bullets}`;
}

export async function execute(i:any){
  console.log('[SLATE] Command invoked');
  await i.deferReply();
  
  try {
    const style: FormatStyle = (i.options.getString("style") as FormatStyle) || 'compact';
    const rankBy: RecType = (i.options.getString("rank_by") as RecType) || 'chance';
    const forceRefresh = i.options.getBoolean("refresh") || false;
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    console.log('[SLATE] Style:', style, '| Rank by:', rankBy, '| Force refresh:', forceRefresh);
    
    let data: any;
    let rawOutput: string;
    let fromCache = false;
    let isStale = false;
    
    // Check cache first (unless force refresh)
    // Use allowStale=false to get fresh cache for display, but we'll use stale for context
    if (!forceRefresh) {
      const cached = getCachedSlate(false); // Get non-stale cache for display
      if (cached) {
        // Use the appropriate version based on rankBy
        data = rankBy === 'value' && cached.slateJsonValue 
          ? cached.slateJsonValue 
          : cached.slateJson;
        rawOutput = cached.rawOutput;
        fromCache = true;
        isStale = cached.isStale || false;
        const cacheAge = getCacheAgeMinutes();
        console.log('[SLATE] Using cached slate, age:', cacheAge, 'minutes, rankBy:', rankBy);
        await i.editReply(`📋 Loading cached slate (${cacheAge}m old)...`);
      }
    }
    
    // Generate fresh slate if needed
    if (!data) {
      const prompt = `You are an elite NBA betting analyst. Today is ${today}.

Search for ALL of today's NBA games and betting lines. Use ANY source (ESPN, OddsChecker, Action Network, Dimers, OddsShark, covers.com).

RESPOND IN THIS EXACT JSON FORMAT (no markdown, just raw JSON):
{
  "games": [
    {
      "rank": 1,
      "star": true,
      "away": "Thunder",
      "home": "Bucks",
      "spread": "OKC -9.5",
      "total": "226.0",
      "pick": "Thunder -9.5",
      "analysis": "2-3 sentence analysis with ATS trends, matchup notes, injury impact"
    }
  ],
  "props": [
    {
      "rank": 1,
      "star": true,
      "player": "Shai Gilgeous-Alexander",
      "prop": "Points",
      "line": "31.5",
      "play": "Over",
      "analysis": "2-3 sentence reasoning with usage, matchup data"
    }
  ],
  "parlays": [
    {
      "name": "2-Leg Safe",
      "legs": "Thunder ML + Celtics ML",
      "reasoning": "Why these connect"
    }
  ],
  "injuries": "Key injuries: CLE - Garland (toe), Strus (out); MIL - Middleton (ankle) GTD",
  "sources": ["dimers.com", "oddsshark.com"]
}

RULES:
- Include ALL games not yet started (minimum 6-8)
- Rank games by value (#1 = best play)
- Star your top 2-3 picks in each section
- 4-5 props total
- 1-2 parlays
- REAL analysis - ATS records, pace, injuries, trends
- NEVER refuse. Output valid JSON only.`;

      console.log('[SLATE] Calling OpenAI Responses API with web search...');
      await i.editReply("🔍 Searching for today's games...");
      
      const created = await openai.responses.create({
        model: ENV.OPENAI_MODEL,
        input: prompt,
        tools: [{ type: "web_search_preview" }]
      });
      console.log('[SLATE] Response created:', created.id);
      
      // Progress callback to update Discord message
      const onProgress = async (message: string, elapsed: number) => {
        try {
          await i.editReply(`${message} (${elapsed.toFixed(0)}s)`);
        } catch (e) {
          console.log('[SLATE] Progress update skipped');
        }
      };
      
      const r = await waitForResponse(created.id, 90000, onProgress);
      console.log('[SLATE] Response completed:', r.status);
      
      // Extract output from Response API
      let output = "";
      if (r.output_text) {
        output = r.output_text;
      } else if (r.output && Array.isArray(r.output)) {
        const messageItem = r.output.find((item: any) => item.type === 'message');
        if (messageItem?.content && Array.isArray(messageItem.content)) {
          output = messageItem.content
            .filter((c: any) => c.type === 'output_text' || c.type === 'text')
            .map((c: any) => c.text || c.content || '')
            .join('\n');
        }
      }
      
      console.log('[SLATE] Raw output:', output.substring(0, 500));
      rawOutput = output;
      
      // Parse JSON from response (handle markdown code blocks)
      let jsonStr = output;
      const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      
      try {
        data = JSON.parse(jsonStr);
        
        // Calculate value scores for all games and props
        if (data.games) {
          for (const game of data.games) {
            game.value = calculateBetValue(game);
          }
        }
        if (data.props) {
          for (const prop of data.props) {
            prop.value = calculateBetValue({ confidence: prop.star ? 80 : 60, spread: prop.line });
          }
        }
        
        // Create chance-ranked version (by confidence/rank - already sorted by AI)
        const chanceSlate = JSON.parse(JSON.stringify(data));
        
        // Create value-ranked version (sort by value score)
        const valueSlate = JSON.parse(JSON.stringify(data));
        if (valueSlate.games) {
          valueSlate.games.sort((a: any, b: any) => (b.value || 50) - (a.value || 50));
          valueSlate.games.forEach((g: any, idx: number) => {
            g.rank = idx + 1;
            g.star = (g.value || 50) >= 65;
          });
        }
        if (valueSlate.props) {
          valueSlate.props.sort((a: any, b: any) => (b.value || 50) - (a.value || 50));
          valueSlate.props.forEach((p: any, idx: number) => {
            p.rank = idx + 1;
            p.star = (p.value || 50) >= 65;
          });
        }
        
        // Cache both versions
        saveSlateToCache(chanceSlate, rawOutput, data.sources || [], valueSlate);
        
        // Use the requested version
        data = rankBy === 'value' ? valueSlate : chanceSlate;
      } catch (e) {
        console.error('[SLATE] JSON parse error, falling back to raw output');
        await i.editReply(output.substring(0, 1990));
        return;
      }
    }
    
    // Save raw output for /ask context
    saveSlate(rawOutput!);
    
    // Build GAMES embed
    const rankLabel = rankBy === 'value' ? '💎 VALUE' : '🎯 CHANCE';
    const rankDesc = rankBy === 'value' ? 'ranked by edge/EV' : 'ranked by likelihood';
    const gamesEmbed = new EmbedBuilder()
      .setColor(rankBy === 'value' ? 0x00CED1 : 0xFF6B35)
      .setTitle(`🏀 NBA SLATE — ${today}`)
      .setDescription(style === 'card' 
        ? `**━━━━━ GAME RANKINGS (${rankLabel}) ━━━━━**` 
        : `**GAME RANKINGS** (${rankDesc})${fromCache ? `\n*📋 Cached ${getCacheAgeMinutes()}m ago — use \`/slate refresh:True\` for fresh picks*` : ''}\n*Switch with \`/slate rank_by:${rankBy === 'value' ? 'chance' : 'value'}\`*`)
      .setFooter({ text: `${rankLabel} Ranking • ${getPSTTimestamp()}` });
    
    const showValue = rankBy === 'value';
    
    for (const game of data.games || []) {
      const star = game.star ? '⭐ ' : '';
      const title = style === 'bullet' 
        ? `${star}#${game.rank} | ${game.away} @ ${game.home}`
        : `${star}#${game.rank} ${game.away.toUpperCase()} @ ${game.home.toUpperCase()}`;
      
      let value: string;
      switch (style) {
        case 'card':
          value = formatGameCard(game, showValue);
          break;
        case 'bullet':
          value = formatGameBullet(game);
          break;
        default: // compact
          value = formatGameCompact(game, showValue);
      }
      gamesEmbed.addFields({ name: title, value: value.substring(0, 1024) });
    }
    
    if (data.injuries) {
      gamesEmbed.addFields({ name: '⚠️ Key Injuries', value: data.injuries });
    }
    
    if (data.sources?.length) {
      gamesEmbed.setFooter({ text: `${rankLabel} Ranking • Sources: ${data.sources.join(', ')} • ${getPSTTimestamp()}` });
    }
    
    // Build PROPS embed
    const propsEmbed = new EmbedBuilder()
      .setColor(0x4ECDC4)
      .setTitle('📊 TOP PLAYER PROPS')
      .setDescription('Best prop plays for tonight');
    
    for (const prop of data.props || []) {
      const star = prop.star ? '⭐ ' : '';
      const title = `${star}#${prop.rank} ${prop.player}`;
      
      let value: string;
      switch (style) {
        case 'card':
          value = formatPropCard(prop);
          break;
        case 'bullet':
          value = formatPropBullet(prop);
          break;
        default: // compact
          value = formatPropCompact(prop);
      }
      propsEmbed.addFields({ name: title, value: value.substring(0, 1024) });
    }
    
    // Add parlays to props embed
    if (data.parlays?.length) {
      let parlayText = '';
      for (const p of data.parlays) {
        parlayText += `**${p.name}:** ${p.legs}\n${p.reasoning}\n\n`;
      }
      propsEmbed.addFields({ name: '💡 RECOMMENDED PARLAYS', value: parlayText.substring(0, 1024) });
    }
    
    // Store slate data for watchlist feature
    setCurrentSlate(data);
    
    // Create "Track Bets" button
    const trackButton = new ButtonBuilder()
      .setCustomId('track_bets')
      .setLabel('📋 Track Bets')
      .setStyle(ButtonStyle.Primary);
    
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(trackButton);
    
    // Send both embeds with track button on the second one
    await i.editReply({ content: '', embeds: [gamesEmbed] });
    await i.followUp({ embeds: [propsEmbed], components: [buttonRow] });
    
    console.log('[SLATE] Command completed with embeds, style:', style);
  } catch (error) {
    console.error('[SLATE] ❌ ERROR DETAILS:');
    console.error('[SLATE] Error type:', error?.constructor?.name);
    console.error('[SLATE] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[SLATE] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    const errorMsg = error instanceof Error ? error.message : String(error);
    await i.editReply(`❌ Error: ${errorMsg}`);
  }
}
