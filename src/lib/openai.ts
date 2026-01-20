import OpenAI from "openai";
import { ENV } from "./env.js";

export const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

// Helper to wait for response completion with timeout
export async function waitForResponse(responseId: string, timeout = 60000) {
  console.log('[OPENAI] Waiting for response:', responseId);
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    const response = await openai.responses.retrieve(responseId);
    console.log('[OPENAI] Status:', response.status);
    
    if (response.status === 'completed') {
      console.log('[OPENAI] Response completed');
      return response;
    }
    
    if (response.status === 'failed' || response.status === 'cancelled') {
      throw new Error(`Response ${response.status}: ${JSON.stringify(response.error)}`);\n    }
    
    // Wait 500ms before polling again
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error('Response timeout after ' + (timeout/1000) + 's');
}
