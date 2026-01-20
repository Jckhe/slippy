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
    console.log('[ASK] Full response object:', JSON.stringify(r, null, 2));
    
    // Extract output - Response API uses 'output' array with text content
    let output = "No response available";
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
    
    console.log('[ASK] Extracted output length:', output.length);
    console.log('[ASK] Output preview:', output.substring(0, 200));
    
    if (!output || output.length < 2) {
      output = "⚠️ Response was empty. Try again or check logs.";
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
