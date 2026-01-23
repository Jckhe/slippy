import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { openai, waitForResponse } from "../lib/openai.js";

// PST timestamp helper
function getPSTTimestamp(): string {
  return new Date().toLocaleString('en-US', { 
    timeZone: 'America/Los_Angeles', 
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }) + ' PT';
}
import { ENV } from "../lib/env.js";
import { getCachedSlate, saveSlateToCache } from "../lib/slateCache.js";
import { searchOddsForBet, formatOddsForPrompt } from "../lib/odds.js";
import { calculateBetValue, formatValueScore, getValueTier } from "../lib/valueCalc.js";

// In-memory cache for analyzed bets (keyed by normalized bet string)
interface AnalysisCache {
  data: any;
  timestamp: number;
  date: string; // PST date string to invalidate on new day
}
const analysisCache = new Map<string, AnalysisCache>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

function normalizeKey(bet: string): string {
  return bet.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getCachedAnalysis(bet: string): any | null {
  const key = normalizeKey(bet);
  const cached = analysisCache.get(key);
  if (!cached) return null;
  
  const todayPST = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
  const age = Date.now() - cached.timestamp;
  
  // Invalidate if different day or expired
  if (cached.date !== todayPST || age > CACHE_TTL_MS) {
    analysisCache.delete(key);
    return null;
  }
  
  console.log(`[ANALYZE] Using cached analysis for "${bet}" (${Math.round(age/60000)}m old)`);
  return cached.data;
}

function setCachedAnalysis(bet: string, data: any): void {
  const key = normalizeKey(bet);
  const todayPST = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
  analysisCache.set(key, { data, timestamp: Date.now(), date: todayPST });
  console.log(`[ANALYZE] Cached analysis for "${bet}"`);
}

// Export for slate to check existing analyses
export function getAnalysisFromCache(bet: string): any | null {
  return getCachedAnalysis(bet);
}

export const data = new SlashCommandBuilder()
  .setName("analyze")
  .setDescription("Analyze a specific bet and rank it against today's slate")
  .addStringOption(option =>
    option.setName("bet")
      .setDescription("The bet to analyze (e.g., 'Lakers -3.5', 'LeBron over 25.5 points')")
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option.setName("slate")
      .setDescription("Add this bet to the slate if analysis is favorable")
      .setRequired(false)
  );

export async function execute(i: any) {
  const betInput = i.options.getString("bet", true);
  const addToSlate = i.options.getBoolean("slate") || false;
  console.log('[ANALYZE] Analyzing bet:', betInput, '| Add to slate:', addToSlate);
  
  await i.deferReply();
  
  try {
    const today = new Date().toLocaleDateString('en-US', { 
      timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
    });
    
    // Check if we have a cached analysis for this bet
    const cachedAnalysis = getCachedAnalysis(betInput);
    let data: any = cachedAnalysis;
    let fromCache = !!cachedAnalysis;
    
    // Get cached slate for context
    const cachedSlate = getCachedSlate();
    
    // Only fetch and analyze if not cached
    if (!data) {
      const slateContext = cachedSlate 
        ? `Current slate has ${cachedSlate.slateJson?.games?.length || 0} games ranked. Top picks: ${
            cachedSlate.slateJson?.games?.slice(0, 3).map((g: any) => `${g.away}@${g.home}: ${g.pick}`).join(', ') || 'None'
          }`
        : 'No cached slate available.';
      
      // Fetch live odds data from The Odds API
      await i.editReply("📡 Fetching live odds data...");
      let oddsContext = '';
      try {
        const oddsData = await searchOddsForBet(betInput);
        oddsContext = formatOddsForPrompt(oddsData);
        console.log('[ANALYZE] Got odds data:', oddsData.found ? 'YES' : 'NO');
      } catch (e) {
        console.log('[ANALYZE] Could not fetch odds:', e);
        oddsContext = 'Could not fetch live odds from The Odds API.';
      }
      
      const prompt = `You are an elite NBA betting analyst. Today is ${today}.

USER WANTS TO ANALYZE THIS BET: "${betInput}"

${slateContext}

${oddsContext}

Search for ADDITIONAL current information about this bet including:
- Team/player recent performance (last 5-10 games)
- Injury news and lineup updates
- ATS/Over-Under trends
- Head-to-head history if applicable
- Any relevant news or factors

IMPORTANT: Use the LIVE ODDS DATA provided above as the primary source for current lines. Supplement with web search for trends and news.

RESPOND IN THIS EXACT JSON FORMAT:
{
  "bet_type": "game" | "prop",
  "game": "Away @ Home",
  "pick": "The specific pick (e.g., Lakers -3.5, LeBron Over 25.5 pts)",
  "current_line": "Current line from the odds data above",
  "confidence": 50-90,
  "ranking_vs_slate": "Where this bet ranks vs today's slate (e.g., '#2 - better than 5 of 7 plays')",
  "analysis": "3-4 sentences with ATS trends, matchup analysis, injury impact, and reasoning",
  "key_factors": ["Factor 1", "Factor 2", "Factor 3"],
  "recommendation": "PLAY" | "LEAN" | "FADE" | "PASS",
  "sources": ["source1.com", "source2.com"]
}

If the bet doesn't exist or the game isn't today, respond with:
{
  "error": "Explanation of why this bet can't be analyzed"
}`;

      await i.editReply("🔍 Analyzing bet...");
      
      const created = await openai.responses.create({
        model: ENV.OPENAI_MODEL,
        input: prompt,
        tools: [{ type: "web_search_preview" }]
      });
      
      const onProgress = async (message: string, elapsed: number) => {
        try {
          await i.editReply(`${message} (${elapsed.toFixed(0)}s)`);
        } catch (e) {}
      };
      
      const r = await waitForResponse(created.id, 60000, onProgress);
      
      // Extract output
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
      
      // Parse JSON
      let jsonStr = output;
      const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      
      try {
        data = JSON.parse(jsonStr);
      } catch (e) {
        await i.editReply(`❌ Failed to parse analysis. Raw: ${output.substring(0, 500)}`);
        return;
      }
      
      // Handle error response
      if (data.error) {
        await i.editReply(`❌ ${data.error}`);
        return;
      }
      
      // Cache the successful analysis
      setCachedAnalysis(betInput, data);
    } else {
      // Using cached analysis
      await i.editReply("📋 Using cached analysis...");
    }
    
    // Build embed
    const recColors: Record<string, number> = {
      'PLAY': 0x00FF00,
      'LEAN': 0xFFFF00,
      'FADE': 0xFF6600,
      'PASS': 0xFF0000
    };
    
    const recEmojis: Record<string, string> = {
      'PLAY': '✅',
      'LEAN': '🟡',
      'FADE': '🟠',
      'PASS': '🔴'
    };
    
    const confBars = '█'.repeat(Math.floor(data.confidence / 10)) + 
                     '░'.repeat(10 - Math.floor(data.confidence / 10));
    
    const embed = new EmbedBuilder()
      .setColor(recColors[data.recommendation] || 0x9B59B6)
      .setTitle(`🔬 Bet Analysis: ${data.pick}`)
      .setDescription(`**${data.game}**`)
      .addFields(
        { 
          name: '📊 Current Line', 
          value: data.current_line || 'N/A', 
          inline: true 
        },
        { 
          name: '🎯 Confidence', 
          value: `${confBars} ${data.confidence}%`, 
          inline: true 
        },
        { 
          name: `${recEmojis[data.recommendation]} Recommendation`, 
          value: `**${data.recommendation}**`, 
          inline: true 
        },
        { 
          name: '📈 Slate Ranking', 
          value: data.ranking_vs_slate || 'N/A', 
          inline: false 
        },
        { 
          name: '📝 Analysis', 
          value: data.analysis?.substring(0, 1024) || 'N/A', 
          inline: false 
        },
        { 
          name: '🔑 Key Factors', 
          value: data.key_factors?.map((f: string) => `• ${f}`).join('\n') || 'N/A', 
          inline: false 
        }
      )
      .setFooter({ text: `${fromCache ? '📋 Cached • ' : ''}Sources: ${data.sources?.join(', ') || 'Web search'} • ${getPSTTimestamp()}` });
    
    // Add to slate if requested and analysis is favorable
    if (addToSlate && cachedSlate && (data.recommendation === 'PLAY' || data.recommendation === 'LEAN')) {
      // Check if already in slate
      const existingGame = cachedSlate.slateJson?.games?.find(
        (g: any) => g.pick?.toLowerCase() === data.pick?.toLowerCase() ||
                    (g.away?.toLowerCase().includes(data.game?.toLowerCase()?.split('@')[0]?.trim()) &&
                     g.home?.toLowerCase().includes(data.game?.toLowerCase()?.split('@')[1]?.trim()))
      );
      
      if (!existingGame && data.bet_type === 'game') {
        // Create new game entry with confidence for sorting
        const newGame = {
          rank: 0, // Will be set after sorting
          star: data.confidence >= 75,
          confidence: data.confidence, // Store confidence for sorting
          away: data.game.split('@')[0]?.trim() || data.game.split('vs')[0]?.trim(),
          home: data.game.split('@')[1]?.trim() || data.game.split('vs')[1]?.trim(),
          spread: data.current_line,
          total: 'N/A',
          pick: data.pick,
          analysis: data.analysis
        };
        
        cachedSlate.slateJson.games = cachedSlate.slateJson.games || [];
        cachedSlate.slateJson.games.push(newGame);
        
        // Re-rank all games by confidence (highest first)
        cachedSlate.slateJson.games.sort((a: any, b: any) => {
          const confA = a.confidence || (a.star ? 80 : 60); // Estimate confidence if not set
          const confB = b.confidence || (b.star ? 80 : 60);
          return confB - confA;
        });
        
        // Update ranks after sorting
        cachedSlate.slateJson.games.forEach((g: any, idx: number) => {
          g.rank = idx + 1;
          g.star = (g.confidence || (g.star ? 80 : 60)) >= 75;
        });
        
        // Find the new rank of our added game
        const addedGameRank = cachedSlate.slateJson.games.findIndex(
          (g: any) => g.pick === newGame.pick && g.away === newGame.away
        ) + 1;
        
        saveSlateToCache(cachedSlate.slateJson, cachedSlate.rawOutput, cachedSlate.sources);
        
        embed.addFields({
          name: '📋 Added to Slate',
          value: `This bet has been added and ranked **#${addedGameRank}** of ${cachedSlate.slateJson.games.length} plays based on ${data.confidence}% confidence.`,
          inline: false
        });
        
        console.log('[ANALYZE] Added to slate at rank', addedGameRank);
      } else if (existingGame) {
        embed.addFields({
          name: '📋 Already in Slate',
          value: `This game is already in the slate at rank **#${existingGame.rank}**.`,
          inline: false
        });
      }
    } else if (addToSlate && !cachedSlate) {
      embed.addFields({
        name: '⚠️ No Slate',
        value: `Run \`/slate\` first to generate today's slate before adding bets.`,
        inline: false
      });
    } else if (addToSlate && data.recommendation !== 'PLAY' && data.recommendation !== 'LEAN') {
      embed.addFields({
        name: '⚠️ Not Added',
        value: `Bet not added to slate — recommendation is **${data.recommendation}** (only PLAY/LEAN bets are added).`,
        inline: false
      });
    }
    
    await i.editReply({ content: '', embeds: [embed] });
    console.log('[ANALYZE] Analysis complete:', data.recommendation);
    
  } catch (error) {
    console.error('[ANALYZE] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await i.editReply(`❌ Error analyzing bet: ${msg}`);
  }
}
