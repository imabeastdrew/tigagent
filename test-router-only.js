import { Runner } from "@openai/agents";
import { routerAgent } from "./dist/agents/routerAgent.js";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test just the router agent to see if our fixes work
 */
async function testRouterOnly() {
  console.log('🧪 Testing Router Agent Only...\n');

  const runner = new Runner({
    traceMetadata: {
      __trace_source__: "tig-agent-sdk-test",
      workflow_id: "router-test",
      project_id: "bfd5c464-bd03-4748-8ea1-c79b38a155ce"
    }
  });

  const testQueries = [
    "Show me recent commits",
    "How many interactions do we have?", 
    "What projects are available?"
  ];

  for (const query of testQueries) {
    console.log(`Testing: "${query}"`);
    console.log('─'.repeat(50));
    
    try {
      const result = await runner.run(routerAgent, query);
      console.log('✅ Router succeeded!');
      console.log('Domain:', result.finalOutput);
      console.log('');
      
    } catch (error) {
      console.log('❌ Router failed:', error.message);
      console.log('');
    }
  }
}

// Run the test
testRouterOnly().catch(console.error);
