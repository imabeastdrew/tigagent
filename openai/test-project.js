import { runWorkflow } from './dist/workflow.js';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });

async function testProject(projectId, query) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log(`Testing project: ${projectId}`);
    console.log(`Query: "${query}"`);
    console.log('─'.repeat(60));
    
    const result = await runWorkflow({
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

// Get project ID from command line argument
const projectId = process.argv[2];
const query = process.argv[3] || "Show me recent commits";

if (!projectId) {
  console.log('Usage: node test-project.js <project-id> [query]');
  console.log('');
  console.log('Examples:');
  console.log('node test-project.js eb7cd8f0-8789-410f-bf83-c8aeb6188834');
  console.log('node test-project.js eb7cd8f0-8789-410f-bf83-c8aeb6188834 "Who made the most commits?"');
  console.log('node test-project.js 188582e6-4fa3-4373-ab94-ae6079c34e6e "Show me interactions about authentication"');
  process.exit(1);
}

testProject(projectId, query);
