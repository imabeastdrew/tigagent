#!/usr/bin/env node

/**
 * Iterative Exploration CLI - Test the new architecture
 * 
 * Usage:
 *   node run-iterative.js "your query" [projectId]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { exploreIterative } = require('./dist/iterativeOrchestrator');

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Iterative Exploration System - Test the new multi-agent architecture

Usage:
  node run-iterative.js "your query" [projectId]

Examples:
  node run-iterative.js "What did Matthew work on in October?"
  node run-iterative.js "Explain the auth fix" f0b01975-0226-41d5-b124-802147e02e23

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
    console.error('Usage: node run-iterative.js "your query" [projectId]');
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

  try {
    // Run iterative exploration
    const result = await exploreIterative(query, projectId);

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('EXPLORATION RESULT');
    console.log('='.repeat(80) + '\n');
    console.log(result.brief);
    console.log('\n' + '='.repeat(80));
    console.log('SESSION DETAILS');
    console.log('='.repeat(80));
    console.log(`Session ID: ${result.sessionId}`);
    console.log(`Stream URL: ${result.streamUrl}`);
    console.log(`Events: ${result.auditTrail.length}`);
    console.log('='.repeat(80) + '\n');

    // Optionally show event breakdown
    if (process.env.SHOW_EVENTS === 'true') {
      const eventCounts = {};
      result.auditTrail.forEach(e => {
        const key = `${e.agent}:${e.action}`;
        eventCounts[key] = (eventCounts[key] || 0) + 1;
      });
      
      console.log('EVENT BREAKDOWN:');
      console.log('-'.repeat(80));
      Object.entries(eventCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([key, count]) => {
          console.log(`  ${key}: ${count}`);
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

