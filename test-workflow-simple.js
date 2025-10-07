import { runWorkflow } from './dist/workflow.js';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('Testing workflow with: "Show me recent commits"');
    const result = await runWorkflow({
      input_as_text: "Show me recent commits",
      project_id: "bfd5c464-bd03-4748-8ea1-c79b38a155ce"
    }, pool);
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

test();
