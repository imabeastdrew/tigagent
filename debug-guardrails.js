import { runGuardrails } from "@openai/guardrails";
import { client, guardrailsConfig, guardrailsContext } from "./dist/config.js";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Debug script specifically for guardrails request body
 */
async function debugGuardrailsRequest() {
  console.log('🔍 Capturing Guardrails Request Body...\n');

  // Store original methods that might be used
  const originalCreate = client.moderations.create;
  const originalPost = client.moderations._client.post;
  
  // Override moderation create to capture request
  client.moderations.create = async (params) => {
    console.log('\n' + '='.repeat(80));
    console.log('🛡️ GUARDRAILS MODERATION REQUEST INTERCEPTED');
    console.log('='.repeat(80));
    console.log('Parameters sent to moderation.create:');
    console.log(JSON.stringify(params, null, 2));
    console.log('='.repeat(80));
    
    // Call original method
    return await originalCreate.call(client.moderations, params);
  };

  // Override the underlying HTTP client post method
  if (client.moderations._client && client.moderations._client.post) {
    client.moderations._client.post = async (path, options) => {
      console.log('\n' + '='.repeat(80));
      console.log('🌐 GUARDRAILS HTTP POST INTERCEPTED');
      console.log('='.repeat(80));
      console.log('Path:', path);
      console.log('Options:', JSON.stringify(options, null, 2));
      console.log('='.repeat(80));
      
      // Call original method
      return await originalPost.call(client.moderations._client, path, options);
    };
  }

  const testInput = "Show me recent commits";

  console.log('Testing Guardrails Request...');
  console.log('Input:', testInput);
  console.log('Config:', JSON.stringify(guardrailsConfig, null, 2));
  
  try {
    const result = await runGuardrails(testInput, guardrailsConfig, guardrailsContext);
    console.log('✅ Guardrails succeeded:', result);
  } catch (error) {
    console.log('❌ Guardrails failed:', error.message);
    
    // Try to extract more details from the error
    if (error.request) {
      console.log('\n--- ERROR REQUEST DETAILS ---');
      console.log(JSON.stringify(error.request, null, 2));
    }
    
    if (error.response) {
      console.log('\n--- ERROR RESPONSE DETAILS ---');
      console.log(JSON.stringify(error.response, null, 2));
    }
  }

  // Restore original methods
  client.moderations.create = originalCreate;
  if (client.moderations._client && client.moderations._client.post) {
    client.moderations._client.post = originalPost;
  }
  
  console.log('\n🎉 Guardrails debugging complete!');
}

// Run the debug
debugGuardrailsRequest().catch(console.error);
