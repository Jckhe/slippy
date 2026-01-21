import { SlashCommandBuilder } from "discord.js";
import { openai, waitForResponse } from "../lib/openai.js";
import { ENV } from "../lib/env.js";

export const data = new SlashCommandBuilder()
  .setName("slate")
  .setDescription("Today's NBA bets");

export async function execute(i:any){
  console.log('[SLATE] Command invoked');
  await i.deferReply();
  
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
    const prompt = `You are an expert NBA betting analyst. Today is ${today}.

TASK: Search for today's NBA games and current betting lines from DraftKings and FanDuel. Then provide your best picks.

OUTPUT FORMAT (use this EXACT table format):

**🏀 NBA SLATE — ${today}**

| Game | Spread | Total | Best Bet | Conf |
|------|--------|-------|----------|------|
| TEAM @ TEAM | DK/FD lines | O/U | Your pick | H/M/L |

**📊 TOP PROPS**
| Player | Prop | Line | Play | Why |
|--------|------|------|------|-----|
| Name | stat | number | O/U | 1 sentence |

**💡 PARLAY SUGGESTION**
• Leg 1 + Leg 2 (2-leg safer)

RULES:
- Use REAL current lines you find from searching
- 3-5 game bets, 2-3 props
- Keep total response under 1800 chars
- Include injury notes if relevant
- Be specific with numbers (e.g., "-4.5 -110")`;

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
