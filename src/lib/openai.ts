import OpenAI from "openai";
import { ENV } from "./env.js";

export const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

// Helper to wait for response completion with timeout
export async function waitForResponse(responseId: string, timeout = 60000) {
  console.log('[OPENAI] ⏳ Waiting for response:', responseId);
  const start = Date.now();
  let iterations = 0;
  
  while (Date.now() - start < timeout) {
    iterations++;
    try {
      const response = await openai.responses.retrieve(responseId);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[OPENAI] Iteration ${iterations} (${elapsed}s): Status = ${response.status}`);
      
      if (response.status === 'completed') {
        console.log('[OPENAI] ✅ Response completed successfully');
        console.log('[OPENAI] Output preview:', JSON.stringify(response).substring(0, 200));
        return response;
      }
      
      if (response.status === 'failed' || response.status === 'cancelled') {
        console.error('[OPENAI] ❌ Response failed/cancelled');
        console.error('[OPENAI] Error details:', JSON.stringify(response.error, null, 2));
        throw new Error(`Response ${response.status}: ${JSON.stringify(response.error)}`);
      }
      
      // Wait 500ms before polling again
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('[OPENAI] ❌ Error during polling:', error);
      throw error;
    }
  }
  
  console.error('[OPENAI] ❌ Timeout after', (timeout/1000) + 's', 'and', iterations, 'iterations');
  throw new Error('Response timeout after ' + (timeout/1000) + 's');
}
