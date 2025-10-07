import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test script to verify TigAgent setup
 */
async function testSetup() {
  console.log('🚀 Testing TigAgent Setup...\n');

  // Test 1: Environment Variables
  console.log('1. Checking environment variables...');
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is not set in .env file');
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in .env file');
    return;
  }
  console.log('✅ Environment variables are set\n');

  // Test 2: Database Connection
  console.log('2. Testing database connection...');
  let pool;
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    const client = await pool.connect();
    console.log('✅ Database connection successful');
    
    // Test 3: Check if required tables exist
    console.log('\n3. Checking required tables...');
    const tables = ['commits', 'interactions', 'conversations', 'projects', 'users'];
    const existingTables = [];
    
    for (const table of tables) {
      try {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `, [table]);
        
        if (result.rows[0].exists) {
          existingTables.push(table);
          console.log(`✅ Table '${table}' exists`);
        } else {
          console.log(`⚠️  Table '${table}' does not exist`);
        }
      } catch (error) {
        console.log(`❌ Error checking table '${table}':`, error.message);
      }
    }

    // Test 4: Check sample data
    console.log('\n4. Checking sample data...');
    for (const table of existingTables) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM ${table} LIMIT 1`);
        const count = result.rows[0].count;
        console.log(`📊 Table '${table}' has ${count} rows`);
      } catch (error) {
        console.log(`❌ Error counting rows in '${table}':`, error.message);
      }
    }

    client.release();
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('\n💡 Make sure your DATABASE_URL in .env is correct and the database is accessible');
    return;
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  // Test 5: Import and test the main module
  console.log('\n5. Testing TigAgent module import...');
  try {
    const { runTigAgent } = await import('./dist/index.js');
    console.log('✅ TigAgent module imported successfully');
    
    // Test 6: Basic functionality test (if we have data)
    console.log('\n6. Testing basic agent functionality...');
    console.log('💡 To test the agent, you can run:');
    console.log('   node test-agent.js');
    
  } catch (error) {
    console.error('❌ Failed to import TigAgent module:', error.message);
    console.log('💡 Make sure you have run: npm run build');
    return;
  }

  console.log('\n🎉 Setup test completed!');
  console.log('\nNext steps:');
  console.log('1. Make sure your .env file has the correct OPENAI_API_KEY and DATABASE_URL');
  console.log('2. Run: node test-agent.js (to test the actual agent functionality)');
}

// Run the test
testSetup().catch(console.error);
