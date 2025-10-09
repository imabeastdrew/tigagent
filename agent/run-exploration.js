#!/usr/bin/env node

/**
 * Unit67 Exploration CLI
 * 
 * Usage:
 *   node run-exploration.js "your query" [projectId]
 *   node run-exploration.js "Why does authentication timeout work this way?"
 *   node run-exploration.js "Tell me about the timeline function" 1071785897
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { explore } = require('./dist/index');

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Unit67 - Multi-Agent Exploration System

Usage:
  node run-exploration.js "your query" [projectId]

Examples:
  node run-exploration.js "Why does authentication timeout work this way?"
  node run-exploration.js "Tell me about the timeline function"
  node run-exploration.js "What's the context around Henry's commit on Oct 7?"

Options:
  --help, -h    Show this help message

Environment Variables:
  ANTHROPIC_API_KEY   Required - Your Anthropic API key
  DATABASE_URL        Required - PostgreSQL connection string
  TEST_PROJECT_ID     Required - Project UUID (uses this if projectId not provided)
  S2_API_KEY          Optional - S2 stream API key (uses in-memory if not set)
  S2_ENDPOINT         Optional - S2 endpoint (default: https://api.s2.dev)
`);
    process.exit(0);
  }

  const query = args[0];
  const projectId = args[1]; // Optional, will use TEST_PROJECT_ID if not provided

  if (!query) {
    console.error('Error: Query is required');
    console.error('Usage: node run-exploration.js "your query" [projectId]');
    process.exit(1);
  }

  // Validate environment
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set');
    console.error('Get your API key at: https://console.anthropic.com/');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  if (!projectId && !process.env.TEST_PROJECT_ID) {
    console.error('Error: TEST_PROJECT_ID environment variable is not set and no projectId provided');
    console.error('Set TEST_PROJECT_ID in .env or pass projectId as second argument');
    process.exit(1);
  }

  if (process.env.S2_API_KEY && !process.env.S2_BASIN) {
    console.error('Error: S2_BASIN environment variable is not set');
    console.error('Set S2_BASIN in .env (e.g., S2_BASIN=tigagent)');
    process.exit(1);
  }

  try {
    // Run exploration (projectId is optional, will use TEST_PROJECT_ID from env)
    const result = await explore(query, projectId);

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('EXPLORATION BRIEF');
    console.log('='.repeat(80) + '\n');
    console.log(result.brief);
    console.log('\n' + '='.repeat(80));
    console.log('SESSION DETAILS');
    console.log('='.repeat(80));
    console.log(`Session ID: ${result.sessionId}`);
    console.log(`Stream URL: ${result.streamUrl}`);
    console.log(`Events: ${result.auditTrail.length}`);
    console.log('='.repeat(80) + '\n');

    // Optionally show audit trail
    if (process.env.SHOW_AUDIT_TRAIL === 'true') {
      console.log('AUDIT TRAIL:');
      console.log('-'.repeat(80));
      result.auditTrail.forEach((event, idx) => {
        console.log(`${idx + 1}. [${event.agent}] ${event.action}`);
        console.log(`   Phase: ${event.phase}`);
        console.log(`   Output: ${JSON.stringify(event.output, null, 2).substring(0, 200)}...`);
        console.log('');
      });
      console.log('='.repeat(80) + '\n');
    }

  } catch (error) {
    console.error('\n✗ Exploration failed');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

