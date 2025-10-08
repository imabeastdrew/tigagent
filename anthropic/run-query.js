/**
 * TigAgent - Run Custom Query
 * 
 * Usage:
 *   node run-query.js "your query here"
 *   node run-query.js "your query here" --session=user-123
 *   node run-query.js "your query here" --session=user-123 --project=YOUR_PROJECT_ID
 */

require('dotenv').config({ path: '../.env' });

const args = process.argv.slice(2);

// Parse arguments
const query = args.find(arg => !arg.startsWith('--')) || 'Show me recent activity';
const sessionArg = args.find(arg => arg.startsWith('--session='));
const projectArg = args.find(arg => arg.startsWith('--project='));

const sessionId = sessionArg ? sessionArg.split('=')[1] : null;
const projectId = projectArg ? projectArg.split('=')[1] : process.env.TEST_PROJECT_ID || 'f0b01975-0226-41d5-b124-802147e02e23';

async function runQuery() {
  console.log('🚀 TigAgent Query Runner\n');
  console.log('='.repeat(80));
  console.log('Query:', query);
  console.log('Project ID:', projectId);
  console.log('Session:', sessionId || 'None (stateless)');
  console.log('='.repeat(80) + '\n');

  try {
    const { createContextualWorkflow } = require('./dist/workflow');
    const Anthropic = require('@anthropic-ai/sdk').default;
    const { Pool } = require('pg');

    // Initialize
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const workflow = createContextualWorkflow(client, pool);

    const startTime = Date.now();

    // Run query with or without session
    const result = sessionId
      ? await workflow.run({ query, projectId }, sessionId)
      : await workflow.run({ query, projectId });

    const elapsed = Date.now() - startTime;

    // Display results
    console.log('✅ Query completed in', elapsed + 'ms\n');
    console.log('='.repeat(80));
    console.log('RESPONSE');
    console.log('='.repeat(80));
    console.log(result.synthesis);
    console.log('='.repeat(80));

    // Show stats
    console.log('\n📊 Stats:');
    console.log('  - Primary results:', result.primaryResults.rowCount, 'rows');
    console.log('  - Contextual queries:', result.contextualResults.length);
    console.log('  - Execution time:', result.executionTime + 'ms');
    if (result.errors.length > 0) {
      console.log('  - Errors:', result.errors.length);
    }

    // Show session info if using memory
    if (sessionId) {
      console.log('\n🧠 Memory:');
      const memories = workflow.getSessionMemories(sessionId);
      if (memories && memories.size > 0) {
        console.log(`  - Stored memories: ${memories.size}`);
        memories.forEach((memory, name) => {
          console.log(`    • ${name}: "${memory.content.substring(0, 50)}..."`);
        });
      } else {
        console.log('  - No memories stored yet');
      }
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Show usage if --help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
TigAgent Query Runner

Usage:
  node run-query.js "your query here" [options]

Options:
  --session=<id>   Use session ID for stateful queries with memory
  --project=<id>   Override project ID (default: TEST_PROJECT_ID env var)
  --help, -h       Show this help message

Examples:
  # Simple query (stateless)
  node run-query.js "Show me recent commits"

  # With memory (stateful)
  node run-query.js "Show recent commits in 3 bullet points" --session=user-drew

  # Follow-up query (remembers preferences)
  node run-query.js "What about conversations?" --session=user-drew

  # Specific project
  node run-query.js "Show activity" --project=1071785897

Environment Variables:
  ANTHROPIC_API_KEY  - Required: Your Anthropic API key
  DATABASE_URL       - Required: PostgreSQL connection string
  TEST_PROJECT_ID    - Optional: Default project ID (default: 1071785897)
`);
  process.exit(0);
}

runQuery();

