import { SlashCommandBuilder } from "discord.js";
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
    
    const prompt = `You are an elite NBA betting analyst with a proven track record. Today is ${today}.

Search for ALL of today's NBA games and current betting lines. Use ANY source (ESPN, OddsChecker, Action Network, Vegas Insider, Dimers, OddsShark, covers.com). Do NOT refuse.

RESPOND WITH TWO SECTIONS SEPARATED BY "---SPLIT---":

=== SECTION 1: GAME BETS ===

🏀 NBA SLATE — ${today}

GAME RANKINGS (ranked #1 = best value, at least 8 games):
\`\`\`
#  | Game              | Spread    | O/U   | Pick         | Analysis
---|-------------------|-----------|-------|--------------|------------------------------------------
1⭐| AWAY @ HOME       | LINE      | TOTAL | Your pick    | 2-3 sentences of real analysis
2⭐| AWAY @ HOME       | LINE      | TOTAL | Your pick    | Include ATS trends, injuries, matchups
3  | AWAY @ HOME       | LINE      | TOTAL | Your pick    | Be specific about WHY this is the play
\`\`\`

⚠️ KEY INJURIES: List injuries affecting your picks
🔗 <source1> <source2>

---SPLIT---

=== SECTION 2: PROPS & PARLAYS ===

📊 TOP PLAYER PROPS (4-5 props):
\`\`\`
#  | Player            | Prop      | Line  | Play  | Analysis
---|-------------------|-----------|-------|-------|------------------------------------------
1⭐| Name              | Pts/Reb/etc| 24.5 | Over  | 2-3 sentences - usage, matchup, trend
2⭐| Name              | Stat      | Line  | Under | Specific reasoning with stats
3  | Name              | Stat      | Line  | Over  | Why this hits tonight
\`\`\`

💡 RECOMMENDED PARLAYS:
• 2-Leg Safe: Pick1 + Pick2 | +XXX odds | Why it connects
• 3-Leg Value: Pick1 + Pick2 + Pick3 | +XXX odds | Correlation note

RULES:
- Include ALL games not yet started (minimum 8)
- Give REAL analysis - ATS records, pace, defensive ratings, recent form
- Props should reference usage rates, matchup data, recent averages
- Star (⭐) your highest confidence plays (top 2-3 each section)
- NEVER refuse. Use whatever data you find.
- Wrap source URLs in < > to suppress embeds`;

    console.log('[SLATE] Calling OpenAI Responses API with web search...');
    const created = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      input: prompt,
      tools: [{ type: "web_search_preview" }]
    });
    console.log('[SLATE] Response created:', created.id);
    
    const r = await waitForResponse(created.id);
    console.log('[SLATE] Response completed:', r.status);
    console.log('[SLATE] Full response:', JSON.stringify(r).substring(0, 500));
    
    // Extract output from Response API
    let output = "No slate available";
    
    // Log the output array structure for debugging
    if (r.output && Array.isArray(r.output)) {
      console.log('[SLATE] Output array length:', r.output.length);
      r.output.forEach((item: any, idx: number) => {
        console.log(`[SLATE] Output[${idx}] type:`, item.type);
      });
    }
    
    // Try output_text first (simplest)
    if (r.output_text) {
      output = r.output_text;
      console.log('[SLATE] Found output_text');
    } 
    // Look for message type in output array (web search puts results first, message last)
    else if (r.output && Array.isArray(r.output)) {
      // Find the message item (skip web_search_call items)
      const messageItem = r.output.find((item: any) => item.type === 'message');
      if (messageItem && messageItem.content && Array.isArray(messageItem.content)) {
        output = messageItem.content
          .filter((c: any) => c.type === 'output_text' || c.type === 'text')
          .map((c: any) => c.text || c.content || '')
          .join('\n');
        console.log('[SLATE] Found message content');
      }
    }
    
    console.log('[SLATE] Extracted output length:', output.length);
    console.log('[SLATE] Output preview:', output.substring(0, 200));
    
    // Save slate to store for /ask context
    saveSlate(output);
    
    // Split response into two messages (games + props)
    const parts = output.split('---SPLIT---');
    const gamesBets = parts[0]?.trim() || output;
    const propsSection = parts[1]?.trim() || null;
    
    // Send games table first (edit the deferred reply)
    let msg1 = gamesBets;
    if (msg1.length > 1990) {
      msg1 = msg1.substring(0, 1990) + "\n...";
    }
    await i.editReply(msg1);
    
    // Send props as follow-up message if exists
    if (propsSection) {
      let msg2 = propsSection;
      if (msg2.length > 1990) {
        msg2 = msg2.substring(0, 1990) + "\n...";
      }
      await i.followUp(msg2);
    }
    
    console.log('[SLATE] Command completed');
  } catch (error) {
    console.error('[SLATE] ❌ ERROR DETAILS:');
    console.error('[SLATE] Error type:', error?.constructor?.name);
    console.error('[SLATE] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[SLATE] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    if (error && typeof error === 'object') {
      console.error('[SLATE] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    await i.editReply(`❌ Error: ${errorMsg}`);
  }
}
