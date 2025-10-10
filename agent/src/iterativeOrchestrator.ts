import { createExplorationStream, ExplorationStream } from './s2/client';
import { ExplorationResult } from './types';
import { LoopManager } from './agents/loopManager';
import { IncrementalSynthesisAgent } from './agents/incrementalSynthesis';

/**
 * Iterative Exploration Orchestrator
 * 
 * Coordinates the new iterative multi-agent architecture:
 * 1. Start Synthesis (runs continuously, watching for findings)
 * 2. Start Loop Manager (Discovery → Judges → Workers, iteratively)
 * 3. Synthesis finalizes answer when loop completes
 */
export async function exploreIterative(
  query: string,
  projectId?: string
): Promise<ExplorationResult> {
  // Use TEST_PROJECT_ID from env if not provided
  const actualProjectId = projectId || process.env.TEST_PROJECT_ID;
  
  if (!actualProjectId) {
    throw new Error('Project ID is required. Set TEST_PROJECT_ID environment variable or pass projectId parameter.');
  }
  
  // Create S2 stream for this exploration session
  const sessionId = `explore-iter-${Date.now()}`;
  const stream = createExplorationStream(sessionId);

  console.log('\n' + '='.repeat(80));
  console.log(`ITERATIVE EXPLORATION SYSTEM`);
  console.log('='.repeat(80));
  console.log(`Query: "${query}"`);
  console.log(`Project ID: ${actualProjectId}`);
  console.log(`Session: ${sessionId}`);
  console.log('='.repeat(80) + '\n');

  const startTime = Date.now();

  try {
    // Start Synthesis Agent (runs in background, watches for findings)
    const synthesis = new IncrementalSynthesisAgent(query, stream);
    await synthesis.start();
    
    // Create update interval for synthesis (check every 2 seconds)
    const synthesisUpdateInterval = setInterval(async () => {
      try {
        await synthesis.checkForUpdates();
      } catch (error) {
        console.error('[Synthesis] Error during update:', error);
      }
    }, 2000);
    
    // Run Loop Manager (Discovery → Judges → Workers, iteratively)
    const loopManager = new LoopManager(query, actualProjectId, stream);
    await loopManager.run();
    
    // Stop synthesis updates
    clearInterval(synthesisUpdateInterval);
    
    // Final update check
    await synthesis.checkForUpdates();
    
    // Finalize answer
    const brief = await synthesis.finalize();
    
    // Get statistics
    const stats = await loopManager.getStats();
    
    // Summary
    const totalTime = Date.now() - startTime;
    console.log('\n' + '='.repeat(80));
    console.log('EXPLORATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`Iterations: ${stats.iterations}`);
    console.log(`Interactions found: ${stats.total_interactions_found}`);
    console.log(`Findings extracted: ${stats.total_findings}`);
    console.log(`Leads discovered: ${stats.total_leads_discovered}`);
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
    const totalTime = Date.now() - startTime;
    console.error('\n✗ EXPLORATION FAILED');
    console.error('='.repeat(80));
    console.error('Error:', error);
    console.error(`Time before failure: ${(totalTime / 1000).toFixed(1)}s`);
    console.error('='.repeat(80) + '\n');
    throw error;
  }
}

/**
 * Get exploration session details (for debugging/audit)
 */
export async function getIterativeExplorationSession(sessionId: string): Promise<ExplorationResult | null> {
  try {
    const stream = createExplorationStream(sessionId);
    const auditTrail = await stream.read();
    
    // Find synthesis finalize event with final answer
    const synthesisEvent = auditTrail.find(
      e => e.agent === 'synthesis' && e.action === 'finalized'
    );
    
    if (!synthesisEvent || !synthesisEvent.storage?.answer) {
      return null;
    }

    const brief = await stream.get(synthesisEvent.storage.answer);

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

