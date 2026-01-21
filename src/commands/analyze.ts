import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { openai, waitForResponse } from "../lib/openai.js";
import { ENV } from "../lib/env.js";
import { getCachedSlate, saveSlateToCache } from "../lib/slateCache.js";

export const data = new SlashCommandBuilder()
  .setName("analyze")
  .setDescription("Analyze a specific bet and rank it against today's slate")
  .addStringOption(option =>
    option.setName("bet")
      .setDescription("The bet to analyze (e.g., 'Lakers -3.5', 'LeBron over 25.5 points')")
      .setRequired(true)
  );

export async function execute(i: any) {
  const betInput = i.options.getString("bet", true);
  console.log('[ANALYZE] Analyzing bet:', betInput);
  
  await i.deferReply();
  
  try {
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
    });
    
    // Get cached slate for context
    const cachedSlate = getCachedSlate();
    const slateContext = cachedSlate 
      ? `Current slate has ${cachedSlate.slateJson?.games?.length || 0} games ranked. Top picks: ${
          cachedSlate.slateJson?.games?.slice(0, 3).map((g: any) => `${g.away}@${g.home}: ${g.pick}`).join(', ') || 'None'
        }`
      : 'No cached slate available.';
    
    const prompt = `You are an elite NBA betting analyst. Today is ${today}.

USER WANTS TO ANALYZE THIS BET: "${betInput}"

${slateContext}

Search for current information about this bet including:
- Current line/odds from major sportsbooks
- Team/player recent performance
- Injury news
- ATS/Over-Under trends
- Head-to-head history if applicable

RESPOND IN THIS EXACT JSON FORMAT:
{
  "bet_type": "game" | "prop",
  "game": "Away @ Home",
  "pick": "The specific pick (e.g., Lakers -3.5, LeBron Over 25.5 pts)",
  "current_line": "Current line from books",
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
    
    let data: any;
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
      .setFooter({ text: `Sources: ${data.sources?.join(', ') || 'Web search'}` })
      .setTimestamp();
    
    // If this is a good play and we have a cached slate, offer to add it
    if (cachedSlate && (data.recommendation === 'PLAY' || data.recommendation === 'LEAN')) {
      // Add to cached slate if not already there
      const existingGame = cachedSlate.slateJson?.games?.find(
        (g: any) => g.game?.toLowerCase().includes(data.game?.toLowerCase()?.split('@')[0]?.trim())
      );
      
      if (!existingGame && data.bet_type === 'game') {
        // Add to slate
        const newGame = {
          rank: (cachedSlate.slateJson?.games?.length || 0) + 1,
          star: data.confidence >= 75,
          away: data.game.split('@')[0]?.trim() || data.game.split('vs')[0]?.trim(),
          home: data.game.split('@')[1]?.trim() || data.game.split('vs')[1]?.trim(),
          spread: data.current_line,
          total: 'N/A',
          pick: data.pick,
          analysis: data.analysis
        };
        
        cachedSlate.slateJson.games = cachedSlate.slateJson.games || [];
        cachedSlate.slateJson.games.push(newGame);
        
        // Re-sort by a simple heuristic (confidence-based)
        // In real implementation you'd want smarter ranking
        saveSlateToCache(cachedSlate.slateJson, cachedSlate.rawOutput, cachedSlate.sources);
        
        embed.addFields({
          name: '📋 Added to Slate',
          value: `This bet has been added to today's cached slate as #${newGame.rank}`,
          inline: false
        });
      }
    }
    
    await i.editReply({ content: '', embeds: [embed] });
    console.log('[ANALYZE] Analysis complete:', data.recommendation);
    
  } catch (error) {
    console.error('[ANALYZE] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await i.editReply(`❌ Error analyzing bet: ${msg}`);
  }
}
