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
    const prompt = `You are an expert NBA bettor. Analyze today's NBA games and provide:

1. Best 3-5 game bets (spreads, ML, totals) with:
   - Current lines from major books (DraftKings, FanDuel)
   - Your recommended bet
   - Confidence level (High/Medium/Low)
   - Key reasoning (1-2 sentences)

2. Top 2-3 player props with:
   - Player, prop, line
   - Recommended play
   - Brief rationale

Format as a clean, scannable list. Keep it under 1800 characters total. Focus on value plays with real analysis.`;

    console.log('[SLATE] Calling OpenAI Responses API...');
    const created = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      input: prompt
    });
    console.log('[SLATE] Response created:', created.id);
    
    const r = await waitForResponse(created.id);
    console.log('[SLATE] Response completed:', r.status);
    console.log('[SLATE] Full response:', JSON.stringify(r).substring(0, 500));
    
    // Extract output from Response API
    let output = "No slate available";
    
    // Try different possible response structures
    if (r.output_text) {
      output = r.output_text;
    } else if (r.output && Array.isArray(r.output) && r.output.length > 0) {
      const firstOutput = r.output[0];
      if (typeof firstOutput === 'string') {
        output = firstOutput;
      } else if (firstOutput.text) {
        output = firstOutput.text;
      } else if (firstOutput.content) {
        if (typeof firstOutput.content === 'string') {
          output = firstOutput.content;
        } else if (Array.isArray(firstOutput.content)) {
          output = firstOutput.content.map((c: any) => c.text || c.content || '').join('\n');
        }
      }
    } else if (r.text) {
      output = r.text;
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
