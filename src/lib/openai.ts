import OpenAI from "openai";
import { ENV } from "./env.js";

export const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

// Progress callback type
type ProgressCallback = (message: string, elapsed: number) => Promise<void>;

// Helper to wait for response completion with timeout and progress updates
export async function waitForResponse(
  responseId: string, 
  timeout = 90000,
  onProgress?: ProgressCallback
) {
  console.log('[OPENAI] ⏳ Waiting for response:', responseId);
  const start = Date.now();
  let iterations = 0;
  let lastProgressUpdate = 0;
  
  const progressMessages = [
    "🔍 Searching for today's games...",
    "📊 Fetching current lines...",
    "🧠 Analyzing matchups...",
    "📈 Checking trends & injuries...",
    "✍️ Generating picks...",
    "⏳ Almost done...",
  ];
  
  while (Date.now() - start < timeout) {
    iterations++;
    const elapsed = (Date.now() - start) / 1000;
    
    try {
      const response = await openai.responses.retrieve(responseId);
      console.log(`[OPENAI] Iteration ${iterations} (${elapsed.toFixed(1)}s): Status = ${response.status}`);
      
      // Send progress update every 3 seconds
      if (onProgress && elapsed - lastProgressUpdate >= 3) {
        const msgIndex = Math.min(Math.floor(elapsed / 5), progressMessages.length - 1);
        await onProgress(progressMessages[msgIndex], elapsed);
        lastProgressUpdate = elapsed;
      }
      
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
