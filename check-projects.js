import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function checkProjects() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('Available projects in database:');
    console.log('─'.repeat(50));
    
    const result = await pool.query(`
      SELECT id, repo_owner, repo_name, created_at 
      FROM projects 
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${result.rows.length} projects:`);
    result.rows.forEach((project, index) => {
      console.log(`${index + 1}. ID: ${project.id}`);
      console.log(`   Repo: ${project.repo_owner}/${project.repo_name || 'N/A'}`);
      console.log(`   Created: ${project.created_at}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkProjects();
