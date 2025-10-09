#!/usr/bin/env node
/**
 * Inspect an exploration stream to see what agents wrote
 * Usage: node inspect-stream.js <session-id>
 */

require('dotenv').config({ path: '../.env' });
const { createExplorationStream } = require('./dist/s2/client');

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: node inspect-stream.js <session-id>');
  console.error('Example: node inspect-stream.js explore-1760027011966');
  process.exit(1);
}

(async () => {
  try {
    console.log('\n' + '='.repeat(80));
    console.log(`STREAM INSPECTION: ${sessionId}`);
    console.log('='.repeat(80) + '\n');

    const stream = createExplorationStream(sessionId);
    const events = await stream.read();

    console.log(`Total events: ${events.length}\n`);

    // Group by agent
    const byAgent = {};
    events.forEach(e => {
      if (!byAgent[e.agent]) byAgent[e.agent] = [];
      byAgent[e.agent].push(e);
    });

    // Show summary
    console.log('EVENTS BY AGENT:');
    console.log('-'.repeat(80));
    Object.keys(byAgent).forEach(agent => {
      console.log(`\n${agent.toUpperCase()} (${byAgent[agent].length} events):`);
      byAgent[agent].forEach(e => {
        console.log(`  - ${e.action}`);
        if (e.storage) {
          console.log(`    Storage keys: ${Object.keys(e.storage).join(', ')}`);
        }
        if (e.output) {
          // Show output summary
          if (e.output.counts) {
            console.log(`    Counts:`, JSON.stringify(e.output.counts));
          } else if (typeof e.output === 'object') {
            const keys = Object.keys(e.output).slice(0, 5);
            console.log(`    Output keys: ${keys.join(', ')}${keys.length > 5 ? '...' : ''}`);
          }
        }
      });
    });

    // Show stored data sizes
    console.log('\n\nSTORED DATA:');
    console.log('-'.repeat(80));
    for (const event of events) {
      if (event.storage) {
        for (const [key, storageKey] of Object.entries(event.storage)) {
          try {
            const data = await stream.get(storageKey);
            const sizeKB = (JSON.stringify(data).length / 1024).toFixed(1);
            console.log(`${event.agent}/${key}: ${sizeKB} KB`);
          } catch (err) {
            console.log(`${event.agent}/${key}: ERROR - ${err.message}`);
          }
        }
      }
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n✗ ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
})();

