import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { openai, waitForResponse } from "../lib/openai.js";
import { ENV } from "../lib/env.js";
import { saveSlate } from "../lib/store.js";

export const data = new SlashCommandBuilder()
  .setName("slate")
  .setDescription("Today's NBA bets");

export async function execute(i:any){
  console.log('[SLATE] Command invoked');
  await i.deferReply();
  
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
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
      .setDescription('**GAME RANKINGS** (ranked by value)')
      .setTimestamp();
    
    for (const game of data.games || []) {
      const star = game.star ? '⭐ ' : '';
      const title = `${star}#${game.rank} ${game.away} @ ${game.home}`;
      const value = `**Line:** ${game.spread} | **O/U:** ${game.total}\n**Pick:** ${game.pick}\n${game.analysis}`;
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
      const value = `**${prop.prop}:** ${prop.line} → **${prop.play}**\n${prop.analysis}`;
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
    
    // Send both embeds
    await i.editReply({ content: '', embeds: [gamesEmbed] });
    await i.followUp({ embeds: [propsEmbed] });
    
    console.log('[SLATE] Command completed with embeds');
  } catch (error) {
    console.error('[SLATE] ❌ ERROR DETAILS:');
    console.error('[SLATE] Error type:', error?.constructor?.name);
    console.error('[SLATE] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[SLATE] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    const errorMsg = error instanceof Error ? error.message : String(error);
    await i.editReply(`❌ Error: ${errorMsg}`);
  }
}
