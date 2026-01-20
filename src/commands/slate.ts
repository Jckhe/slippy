import { SlashCommandBuilder } from "discord.js";
import { fetchOdds } from "../lib/odds.js";
import { openai, waitForResponse } from "../lib/openai.js";
import { ENV } from "../lib/env.js";

export const data = new SlashCommandBuilder()
  .setName("slate")
  .setDescription("Today's NBA bets");

export async function execute(i:any){
  console.log('[SLATE] Command invoked');
  await i.deferReply();
  
  try {
    console.log('[SLATE] Fetching odds...');
    const odds = await fetchOdds();
    console.log(`[SLATE] Got ${odds?.length || 0} games`);
    
    console.log('[SLATE] Calling OpenAI Responses API...');
    const created = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      input: `Rank best NBA bets + props using this data:\n${JSON.stringify(odds)}`
    });
    console.log('[SLATE] Response created:', created.id);
    
    const r = await waitForResponse(created.id);
    console.log('[SLATE] Response completed:', r.status);
    console.log('[SLATE] Full response object:', JSON.stringify(r, null, 2));
    
    // Extract output - Response API uses 'output' array with text content
    let output = "No slate available";
    if (r.output && Array.isArray(r.output) && r.output.length > 0) {
      // Get first output item's text content
      const firstOutput = r.output[0];
      if (firstOutput.type === 'message') {
        // Extract content from message
        const content = firstOutput.content;
        if (Array.isArray(content) && content.length > 0) {
          output = content.map((c: any) => c.text || c.content || '').join('\n');
        }
      } else if (firstOutput.content) {
        output = String(firstOutput.content);
      } else if (firstOutput.text) {
        output = String(firstOutput.text);
      }
    }
    
    console.log('[SLATE] Extracted output length:', output.length);
    console.log('[SLATE] Output preview:', output.substring(0, 200));
    
    if (!output || output.length < 2) {
      output = "⚠️ Response was empty. Try again or check logs.";
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
