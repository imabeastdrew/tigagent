#!/usr/bin/env node

/**
 * Agent v2 Runner - Test and run the new SQL-driven agent system
 */

const { agentV2, queryWithAgentV2 } = require('./dist/agentv2');
const { ExplorationStream } = require('./dist/src/simpleStream');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node run-agentv2.js "your question here" [project_id]');
    console.log('');
    console.log('Examples:');
    console.log('  node run-agentv2.js "How does authentication work?"');
    console.log('  node run-agentv2.js "Who worked on the login feature?" 123e4567-e89b-12d3-a456-426614174000');
    console.log('  node run-agentv2.js "What files were changed in the last month?"');
    process.exit(1);
  }
  
  const query = args[0];
  const projectId = args[1] || process.env.TEST_PROJECT_ID || 'bfd5c464-bd03-4748-8ea1-c79b38a155ce';
  
  console.log(`🔍 Agent v2 Investigation`);
  console.log(`Query: "${query}"`);
  console.log(`Project ID: ${projectId}`);
  console.log('');
  
  try {
    // Create exploration stream
    const stream = new ExplorationStream();
    
    // Run Agent v2
    const result = await queryWithAgentV2(query, projectId, stream, {
      maxIterations: 3,
      enableSQLDiscovery: true,
      enableTraditionalDiscovery: false,
      debugMode: true
    });
    
    console.log('📊 RESULTS');
    console.log('==========');
    console.log(`Success: ${result.success}`);
    console.log(`Findings: ${result.findings.length}`);
    console.log(`Leads: ${result.leads.length}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log('');
    
    if (result.errors.length > 0) {
      console.log('❌ ERRORS');
      console.log('==========');
      result.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
      console.log('');
    }
    
    console.log('📝 RESPONSE');
    console.log('===========');
    console.log(result.summary);
    console.log('');
    
    // Show SQL results summary
    if (result.sqlResults) {
      console.log('🗄️  SQL DISCOVERY RESULTS');
      console.log('========================');
      console.log(`Interactions: ${result.sqlResults.interactions.length}`);
      console.log(`Conversations: ${result.sqlResults.conversations.length}`);
      console.log(`Commits: ${result.sqlResults.commits.length}`);
      console.log(`Files: ${result.sqlResults.files.length}`);
      console.log(`People: ${result.sqlResults.people.length}`);
      console.log('');
    }
    
    console.log('✅ Investigation complete!');
    
  } catch (error) {
    console.error('❌ Error running Agent v2:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main();
}
