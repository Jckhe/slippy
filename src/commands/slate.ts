import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { openai, waitForResponse } from "../lib/openai.js";
import { ENV } from "../lib/env.js";
import { saveSlate } from "../lib/store.js";
import { setCurrentSlate } from "../lib/watchlist.js";

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
  );

// Format helpers for each style
function formatGameCompact(game: any): string {
  const conf = game.star ? 80 : (game.rank <= 3 ? 65 : 50);
  const bars = '█'.repeat(Math.floor(conf/10)) + '░'.repeat(10 - Math.floor(conf/10));
  return `┌─────────────────────────────
│ 📊 ${game.spread} | O/U ${game.total}
│ 🎯 Pick: **${game.pick}**
│ 🔥 Confidence: ${bars} ${conf}%
└─────────────────────────────
${game.analysis}`;
}

function formatGameCard(game: any): string {
  const confText = game.star ? '🔥🔥🔥🔥 HIGH CONFIDENCE' : (game.rank <= 3 ? '🔥🔥🔥 MEDIUM-HIGH' : '🔥🔥 MODERATE');
  const bullets = game.analysis.split('. ').slice(0, 3).map((s: string) => `• ${s.trim()}`).join('\n');
  return `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 📈 ${game.spread}  │  ⚖️ O/U ${game.total}
┃ ✅ PICK: **${game.pick}**
┃ ${confText}
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
  const conf = prop.star ? 80 : (prop.rank <= 2 ? 70 : 55);
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
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    console.log('[SLATE] Style:', style);
    
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
    
    // Save raw output for /ask context
    saveSlate(output);
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = output;
    const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    let data: any;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[SLATE] JSON parse error, falling back to raw output');
      await i.editReply(output.substring(0, 1990));
      return;
    }
    
    // Build GAMES embed
    const gamesEmbed = new EmbedBuilder()
      .setColor(0xFF6B35)
      .setTitle(`🏀 NBA SLATE — ${today}`)
      .setDescription(style === 'card' ? '**━━━━━ GAME RANKINGS ━━━━━**' : '**GAME RANKINGS** (ranked by value)')
      .setTimestamp();
    
    for (const game of data.games || []) {
      const star = game.star ? '⭐ ' : '';
      const title = style === 'bullet' 
        ? `${star}#${game.rank} | ${game.away} @ ${game.home}`
        : `${star}#${game.rank} ${game.away.toUpperCase()} @ ${game.home.toUpperCase()}`;
      
      let value: string;
      switch (style) {
        case 'card':
          value = formatGameCard(game);
          break;
        case 'bullet':
          value = formatGameBullet(game);
          break;
        default: // compact
          value = formatGameCompact(game);
      }
      gamesEmbed.addFields({ name: title, value: value.substring(0, 1024) });
    }
    
    if (data.injuries) {
      gamesEmbed.addFields({ name: '⚠️ Key Injuries', value: data.injuries });
    }
    
    if (data.sources?.length) {
      gamesEmbed.setFooter({ text: `Sources: ${data.sources.join(', ')}` });
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
