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
    
    const prompt = `You are an expert NBA betting analyst. Today is ${today}.

Search for ALL of today's NBA games and betting lines. Use ANY source (ESPN, OddsChecker, Action Network, Vegas Insider, Dimers, OddsShark). Do NOT refuse.

RESPOND IN THIS EXACT FORMAT:

🏀 NBA SLATE — ${today}

FULL GAME RANKINGS (all games not yet started, ranked by best value):
#1 ⭐ AWAY @ HOME | Line | O/U | Best Bet: PICK | Why: 1 sentence
#2 ⭐ AWAY @ HOME | Line | O/U | Best Bet: PICK | Why: 1 sentence
#3 AWAY @ HOME | Line | O/U | Best Bet: PICK | Why: 1 sentence
#4 AWAY @ HOME | Line | O/U | Best Bet: PICK | Why: 1 sentence
(continue for ALL games today, stars on top 2-3 plays)

📊 TOP PROPS (2-3):
• Player | Prop Line | Play: O/U | Why

💡 PARLAY: Leg1 + Leg2

⚠️ KEY INJURIES: Brief list

🔗 Sources: <URL1> <URL2>

RULES:
- List EVERY NBA game today (skip games already started)
- Rank ALL games from best to worst value (1 = best play)
- Include spread AND total for each game
- Star (⭐) your top 2-3 confidence plays
- NEVER refuse. Use whatever lines you find.
- Wrap URLs in < > to suppress embeds`;

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
    
    // Discord has 2000 char limit - truncate if needed
    if (output.length > 1990) {
      output = output.substring(0, 1990) + "\n...";
      console.log('[SLATE] Truncated to 1990 chars');
    }
    
    await i.editReply(output);
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
