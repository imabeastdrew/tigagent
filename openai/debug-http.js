import { runGuardrails } from "@openai/guardrails";
import { Runner } from "@openai/agents";
import { client, guardrailsConfig, guardrailsContext } from "./dist/config.js";
import { routerAgent } from "./dist/agents/routerAgent.js";
import dotenv from 'dotenv';

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });

/**
 * Debug script to capture HTTP request bodies by intercepting fetch
 */
async function debugHttpRequests() {
  console.log('🔍 Intercepting HTTP Requests...\n');

  // Store original fetch
  const originalFetch = global.fetch;
  
  // Override fetch to capture request bodies
  global.fetch = async (url, options) => {
    console.log('\n' + '='.repeat(80));
    console.log('🌐 HTTP REQUEST INTERCEPTED');
    console.log('='.repeat(80));
    console.log('URL:', url);
    console.log('Method:', options?.method || 'GET');
    console.log('Headers:', JSON.stringify(options?.headers, null, 2));
    
    if (options?.body) {
      console.log('\n--- REQUEST BODY ---');
      try {
        const bodyObj = JSON.parse(options.body);
        console.log(JSON.stringify(bodyObj, null, 2));
      } catch (e) {
        console.log('Raw body:', options.body);
      }
    }
    
    console.log('='.repeat(80));
    
    // Call original fetch
    const response = await originalFetch(url, options);
    
    console.log('\n--- RESPONSE STATUS ---');
    console.log('Status:', response.status, response.statusText);
    
    return response;
  };

  const testInput = "Show me recent commits";
  const testProjectId = "bfd5c464-bd03-4748-8ea1-c79b38a155ce";

  console.log('Testing Guardrails Request...');
  try {
    await runGuardrails(testInput, guardrailsConfig, guardrailsContext);
  } catch (error) {
    console.log('Guardrails failed as expected:', error.message);
  }

  console.log('\n\nTesting Agent Runner Request...');
  try {
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "tig-agent-sdk-debug",
        workflow_id: "debug-workflow",
        project_id: testProjectId
      }
    });

    const conversationHistory = [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: testInput
          }
        ]
      }
    ];

    await runner.run(routerAgent, conversationHistory);
  } catch (error) {
    console.log('Agent Runner failed as expected:', error.message);
  }

  // Restore original fetch
  global.fetch = originalFetch;
  
  console.log('\n🎉 HTTP Request interception complete!');
}

// Run the debug
debugHttpRequests().catch(console.error);
