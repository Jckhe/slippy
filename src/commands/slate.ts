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
    
    const output = r.output_text || r.output?.[0]?.content || "No slate";
    console.log('[SLATE] Replying with output length:', output.length);
    await i.editReply(output);
    console.log('[SLATE] Command completed');
  } catch (error) {
    console.error('[SLATE] Error:', error);
    await i.editReply(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
