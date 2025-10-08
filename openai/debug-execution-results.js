import { runContextualWorkflow } from './dist/workflow.js';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });

async function debugExecutionResults(projectId, query) {
  console.log(`Debugging execution results for project: ${projectId}`);
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
    
    console.log('Final Result:');
    console.log(result);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

// Test with a simple query
const projectId = process.argv[2] || 'f0b01975-0226-41d5-b124-802147e02e23';
const query = process.argv[3] || 'show me changes to page.tsx';

debugExecutionResults(projectId, query);
