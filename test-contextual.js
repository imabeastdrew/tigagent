import { runContextualWorkflow } from './dist/workflow.js';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testContextualWorkflow(projectId, query) {
  console.log(`Testing contextual workflow for project: ${projectId}`);
  console.log(`Query: "${query}"`);
  console.log('─'.repeat(60));
  
  // Create database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const result = await runContextualWorkflow({
      input_as_text: query,
      project_id: projectId
    }, pool);
    
    console.log('Result:');
    console.log(result);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

// Test the contextual workflow
const projectId = process.argv[2];
const query = process.argv[3];

if (!projectId || !query) {
  console.log('Usage: node test-contextual.js <projectId> "<query>"');
  console.log('Example: node test-contextual.js f0b01975-0226-41d5-b124-802147e02e23 "give me context about timeline function from page.tsx"');
  process.exit(1);
}

testContextualWorkflow(projectId, query);
