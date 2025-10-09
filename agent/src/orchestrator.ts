import { createExplorationStream, ExplorationStream } from './s2/client';
import { ExplorationResult } from './types';
import { discoveryAgent } from './agents/discovery';
import { threadFollowingAgent } from './agents/threadFollowing';
import { knowledgeMiningAgent } from './agents/knowledgeMining';
import { temporalContextAgent } from './agents/temporalContext';
import { synthesisAgent } from './agents/synthesis';

/**
 * Main exploration orchestrator
 * 
 * Coordinates multi-agent exploration in 3 phases:
 * 1. Discovery (sequential) - Find seeds
 * 2. Parallel Exploration - Thread Following, Knowledge Mining, Temporal Context
 * 3. Synthesis (sequential) - Create final brief
 */
export async function explore(
  query: string,
  projectId?: string
): Promise<ExplorationResult> {
  // Use TEST_PROJECT_ID from env if not provided
  const actualProjectId = projectId || process.env.TEST_PROJECT_ID;
  
  if (!actualProjectId) {
    throw new Error('Project ID is required. Set TEST_PROJECT_ID environment variable or pass projectId parameter.');
  }
  // Create S2 stream for this exploration session
  const sessionId = `explore-${Date.now()}`;
  const stream = createExplorationStream(sessionId);

  console.log('\n' + '='.repeat(80));
  console.log(`UNIT67 EXPLORATION`);
  console.log('='.repeat(80));
  console.log(`Query: "${query}"`);
  console.log(`Project ID: ${actualProjectId}`);
  console.log(`Session: ${sessionId}`);
  console.log('='.repeat(80) + '\n');

  try {
    // PHASE 1: Discovery (sequential - must find seeds first)
    console.log('PHASE 1: DISCOVERY');
    console.log('-'.repeat(80));
    const discoveryStart = Date.now();
    
    await discoveryAgent(query, stream, actualProjectId);
    
    const discoveryTime = Date.now() - discoveryStart;
    console.log(`✓ Discovery complete (${(discoveryTime / 1000).toFixed(1)}s)\n`);

    // PHASE 2: Parallel Exploration (all agents run simultaneously)
    console.log('PHASE 2: PARALLEL EXPLORATION');
    console.log('-'.repeat(80));
    const parallelStart = Date.now();

    await Promise.all([
      threadFollowingAgent(stream, actualProjectId)
        .then(() => console.log('✓ Thread Following complete'))
        .catch(err => console.error('✗ Thread Following failed:', err.message)),
      
      knowledgeMiningAgent(stream, actualProjectId)
        .then(() => console.log('✓ Knowledge Mining complete'))
        .catch(err => console.error('✗ Knowledge Mining failed:', err.message)),
      
      temporalContextAgent(stream, actualProjectId)
        .then(() => console.log('✓ Temporal Context complete'))
        .catch(err => console.error('✗ Temporal Context failed:', err.message))
    ]);

    const parallelTime = Date.now() - parallelStart;
    console.log(`\n✓ Parallel phase complete (${(parallelTime / 1000).toFixed(1)}s)\n`);

    // PHASE 3: Synthesis (sequential - needs all findings)
    console.log('PHASE 3: SYNTHESIS');
    console.log('-'.repeat(80));
    const synthesisStart = Date.now();
    
    const brief = await synthesisAgent(stream, actualProjectId, query);
    
    const synthesisTime = Date.now() - synthesisStart;
    console.log(`✓ Synthesis complete (${(synthesisTime / 1000).toFixed(1)}s)\n`);

    // Summary
    const totalTime = Date.now() - (discoveryStart - discoveryTime + parallelStart - parallelTime + synthesisStart - synthesisTime);
    console.log('EXPLORATION COMPLETE');
    console.log('-'.repeat(80));
    console.log(`Total time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`  Discovery: ${(discoveryTime / 1000).toFixed(1)}s`);
    console.log(`  Parallel: ${(parallelTime / 1000).toFixed(1)}s`);
    console.log(`  Synthesis: ${(synthesisTime / 1000).toFixed(1)}s`);
    console.log('='.repeat(80) + '\n');

    // Get audit trail
    const auditTrail = await stream.read();

    return {
      brief,
      sessionId,
      streamUrl: `https://s2.dev/streams/${sessionId}`,
      auditTrail
    };

  } catch (error) {
    console.error('\n✗ EXPLORATION FAILED');
    console.error('='.repeat(80));
    console.error('Error:', error);
    console.error('='.repeat(80) + '\n');
    throw error;
  }
}

/**
 * Get exploration session details (for debugging/audit)
 */
export async function getExplorationSession(sessionId: string): Promise<ExplorationResult | null> {
  try {
    const stream = createExplorationStream(sessionId);
    const auditTrail = await stream.read();
    
    // Find synthesis event with final brief
    const synthesisEvent = auditTrail.find(
      e => e.agent === 'synthesis' && e.action === 'create_brief'
    );
    
    if (!synthesisEvent || !synthesisEvent.storage?.brief) {
      return null;
    }

    const brief = await stream.get(synthesisEvent.storage.brief);

    return {
      brief,
      sessionId,
      streamUrl: `https://s2.dev/streams/${sessionId}`,
      auditTrail
    };
  } catch (error) {
    console.error('[GetSession] Error:', error);
    return null;
  }
}

