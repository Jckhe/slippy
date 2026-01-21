import { SlashCommandBuilder } from "discord.js";
import { openai, waitForResponse } from "../lib/openai.js";
import { ENV } from "../lib/env.js";
import { getSlateContext } from "../lib/store.js";

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
    
    // Include today's slate context if available
    const slateContext = getSlateContext();
    const fullPrompt = `You are an NBA betting assistant. Answer the user's question concisely.${slateContext}\n\nUSER QUESTION: ${q}`;
    console.log('[ASK] Has slate context:', slateContext.length > 0);
    
    console.log('[ASK] Calling OpenAI Responses API...');
    const created = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      input: fullPrompt
    });
    console.log('[ASK] Response created:', created.id);
    
    const r = await waitForResponse(created.id);
    console.log('[ASK] Response completed:', r.status);
    console.log('[ASK] Full response:', JSON.stringify(r).substring(0, 500));
    
    // Extract output from Response API - try multiple possible structures
    let output = "No response";
    
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
    
    console.log('[ASK] Extracted output length:', output.length);
    console.log('[ASK] Output preview:', output.substring(0, 200));
    
    // Discord has 2000 char limit - truncate if needed
    if (output.length > 1990) {
      output = output.substring(0, 1990) + "\n...";
      console.log('[ASK] Truncated to 1990 chars');
    }
    
    await i.editReply(output);
    console.log('[ASK] Command completed');
  } catch (error) {
    console.error('[ASK] ❌ ERROR DETAILS:');
    console.error('[ASK] Error type:', error?.constructor?.name);
    console.error('[ASK] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[ASK] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    if (error && typeof error === 'object') {
      console.error('[ASK] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    await i.editReply(`❌ Error: ${errorMsg}`);
  }
}
