import { SlashCommandBuilder } from "discord.js";
import { openai, waitForResponse } from "../lib/openai.js";
import { ENV } from "../lib/env.js";

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask anything")
  .addStringOption(o => o.setName("question").setDescription("Question").setRequired(true));

export async function execute(i:any){
  console.log('[ASK] Command invoked');
  await i.deferReply();
  
  try {
    const q = i.options.getString("question", true);
    console.log('[ASK] Question:', q);
    
    console.log('[ASK] Calling OpenAI Responses API...');
    const created = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      input: q
    });
    console.log('[ASK] Response created:', created.id);
    
    const r = await waitForResponse(created.id);
    console.log('[ASK] Response completed:', r.status);
    
    const output = r.output_text || r.output?.[0]?.content || "No response";
    console.log('[ASK] Replying with output length:', output.length);
    await i.editReply(output);
    console.log('[ASK] Command completed');
  } catch (error) {
    console.error('[ASK] Error:', error);
    await i.editReply(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
