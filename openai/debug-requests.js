import { runGuardrails } from "@openai/guardrails";
import { Runner } from "@openai/agents";
import { client, guardrailsConfig, guardrailsContext } from "./dist/config.js";
import { routerAgent } from "./dist/agents/routerAgent.js";
import dotenv from 'dotenv';

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });

/**
 * Debug script to capture the exact request bodies being sent
 */
async function debugRequests() {
  console.log('🔍 Capturing Request Bodies...\n');

  // Test input
  const testInput = "Show me recent commits";
  const testProjectId = "bfd5c464-bd03-4748-8ea1-c79b38a155ce";

  console.log('='.repeat(60));
  console.log('1. CAPTURING GUARDRAILS REQUEST BODY');
  console.log('='.repeat(60));

  try {
    console.log('Calling runGuardrails with:');
    console.log('- Input:', testInput);
    console.log('- Config:', JSON.stringify(guardrailsConfig, null, 2));
    console.log('- Context:', JSON.stringify(guardrailsContext, null, 2));
    console.log('\n--- ACTUAL API REQUEST BODY ---');
    
    // This will fail but we'll see the request body in the error
    const guardrailsResult = await runGuardrails(
      testInput, 
      guardrailsConfig, 
      guardrailsContext
    );
    
    console.log('Guardrails result:', guardrailsResult);
    
  } catch (error) {
    console.log('❌ Guardrails Error (this shows us the request format):');
    console.log('Error message:', error.message);
    console.log('Error details:', JSON.stringify(error, null, 2));
    
    // Try to extract request body from error if available
    if (error.request) {
      console.log('\n--- REQUEST BODY FOUND ---');
      console.log(JSON.stringify(error.request, null, 2));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('2. CAPTURING AGENT RUNNER REQUEST BODY');
  console.log('='.repeat(60));

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

    console.log('Calling runner.run with:');
    console.log('- Agent:', routerAgent);
    console.log('- Conversation History:', JSON.stringify(conversationHistory, null, 2));
    console.log('\n--- ACTUAL API REQUEST BODY ---');

    const routerResult = await runner.run(routerAgent, conversationHistory);
    console.log('Router result:', routerResult);
    
  } catch (error) {
    console.log('❌ Agent Runner Error (this shows us the request format):');
    console.log('Error message:', error.message);
    console.log('Error details:', JSON.stringify(error, null, 2));
    
    // Try to extract request body from error if available
    if (error.request) {
      console.log('\n--- REQUEST BODY FOUND ---');
      console.log(JSON.stringify(error.request, null, 2));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('3. MANUAL API CALLS FOR COMPARISON');
  console.log('='.repeat(60));

  // Let's also try manual API calls to see the correct format
  try {
    console.log('Testing manual moderation API call...');
    const moderationResult = await client.moderations.create({
      input: testInput,
      model: "text-moderation-latest"
    });
    console.log('✅ Manual moderation works:', moderationResult);
  } catch (error) {
    console.log('❌ Manual moderation error:', error.message);
  }

  try {
    console.log('\nTesting manual chat completion API call...');
    const chatResult = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: testInput
        }
      ],
      max_tokens: 100
    });
    console.log('✅ Manual chat completion works:', chatResult.choices[0].message.content);
  } catch (error) {
    console.log('❌ Manual chat completion error:', error.message);
  }
}

// Run the debug
debugRequests().catch(console.error);
