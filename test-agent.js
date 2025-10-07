import { runTigAgent, closeConnections } from './dist/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test script for TigAgent functionality
 */
async function testAgent() {
  console.log('🤖 Testing TigAgent Functionality...\n');

  // Check if we have the required environment variables
  if (!process.env.OPENAI_API_KEY || !process.env.DATABASE_URL) {
    console.error('❌ Missing required environment variables');
    console.log('Please make sure your .env file contains:');
    console.log('- OPENAI_API_KEY=your_openai_api_key_here');
    console.log('- DATABASE_URL=postgresql://username:password@localhost:5432/database');
    return;
  }

  // Test queries to try
  const testQueries = [
    {
      input: "Show me recent commits",
      project_id: "test-project-123"
    },
    {
      input: "How many interactions do we have?",
      project_id: "test-project-123"
    },
    {
      input: "What projects are available?",
      project_id: "test-project-123"
    }
  ];

  console.log('Testing with sample queries...\n');

  for (let i = 0; i < testQueries.length; i++) {
    const query = testQueries[i];
    console.log(`Test ${i + 1}: "${query.input}"`);
    console.log('─'.repeat(50));
    
    try {
      const startTime = Date.now();
      const result = await runTigAgent(query);
      const endTime = Date.now();
      
      console.log(`✅ Success! (${endTime - startTime}ms)`);
      console.log(`Answer: ${result}`);
      console.log('');
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      console.log('');
    }
  }

  // Clean up connections
  await closeConnections();
  console.log('🔌 Database connections closed');
  console.log('\n🎉 Agent testing completed!');
}

// Run the test
testAgent().catch(console.error);
