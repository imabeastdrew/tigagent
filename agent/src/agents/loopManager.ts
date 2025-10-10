import { ExplorationStream } from '../s2/client';
import { SearchRequest } from '../types';
import { DiscoveryService } from './discoveryService';
import { spawnJudges } from './judge';
import { spawnWorkerPool } from './worker';

/**
 * Loop Manager - Orchestrates iterative discovery cycles
 * 
 * Manages the feedback loop:
 * 1. Discovery searches
 * 2. Judges score results  
 * 3. Workers investigate and find leads
 * 4. Workers request new searches
 * 5. Repeat until convergence
 */
export class LoopManager {
  private maxIterations: number = 5;
  private maxWorkers: number = 5;
  private currentIteration: number = 0;
  
  constructor(
    private query: string,
    private projectId: string,
    private stream: ExplorationStream
  ) {}
  
  /**
   * Run the complete iterative loop
   */
  async run(): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('ITERATIVE EXPLORATION LOOP');
    console.log('='.repeat(80));
    console.log(`Query: "${this.query}"`);
    console.log(`Max iterations: ${this.maxIterations}`);
    console.log(`Max workers: ${this.maxWorkers}`);
    console.log('='.repeat(80) + '\n');
    
    const discovery = new DiscoveryService(this.projectId, this.stream);
    
    // ITERATION 0: Initial search
    await this.runIteration(0, discovery, [{
      query: this.query,
      iteration: 0,
      source: 'user_query',
      lead_type: 'initial'
    }]);
    
    // ITERATIONS 1-N: Follow leads until convergence
    for (this.currentIteration = 1; this.currentIteration < this.maxIterations; this.currentIteration++) {
      // Check for pending search requests from workers
      const searchRequests = await this.getPendingSearchRequests();
      
      if (searchRequests.length === 0) {
        console.log(`\n[LoopManager] Iteration ${this.currentIteration}: No more search requests - exploration converged\n`);
        break;
      }
      
      console.log(`\n[LoopManager] Iteration ${this.currentIteration}: Processing ${searchRequests.length} search requests\n`);
      
      // Run iteration with discovered leads
      await this.runIteration(this.currentIteration, discovery, searchRequests);
    }
    
    if (this.currentIteration >= this.maxIterations) {
      console.log(`\n[LoopManager] Reached max iterations (${this.maxIterations})\n`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('EXPLORATION LOOP COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total iterations: ${this.currentIteration}`);
    console.log('='.repeat(80) + '\n');
  }
  
  /**
   * Run a single iteration: Search → Judge → Investigate
   */
  private async runIteration(
    iteration: number,
    discovery: DiscoveryService,
    searchRequests: SearchRequest[]
  ): Promise<void> {
    console.log(`┌─ ITERATION ${iteration} ─────────────────────────────────────┐`);
    
    // STEP 1: Discovery searches
    console.log(`│ [1] Discovery: Running ${searchRequests.length} search(es)...`);
    const searchStart = Date.now();
    
    const allResults = [];
    for (const request of searchRequests) {
      const results = await discovery.handleSearchRequest(request);
      allResults.push(...results);
    }
    
    const searchTime = Date.now() - searchStart;
    console.log(`│     Found ${allResults.length} new interactions (${(searchTime / 1000).toFixed(1)}s)`);
    
    if (allResults.length === 0) {
      console.log(`└─────────────────────────────────────────────────────────────┘`);
      return;
    }
    
    // STEP 2: Spawn judges
    console.log(`│ [2] Judges: Spawning judges for ${allResults.length} interactions...`);
    const judgeStart = Date.now();
    
    await spawnJudges(allResults, iteration, this.query, this.stream);
    
    const judgeTime = Date.now() - judgeStart;
    console.log(`│     Judging complete (${(judgeTime / 1000).toFixed(1)}s)`);
    
    // STEP 3: Check queue size
    const queueSize = await this.getQueueSize();
    console.log(`│     Investigation queue: ${queueSize} items`);
    
    if (queueSize === 0) {
      console.log(`└─────────────────────────────────────────────────────────────┘`);
      return;
    }
    
    // STEP 4: Spawn workers
    const workerCount = Math.min(queueSize, this.maxWorkers);
    console.log(`│ [3] Workers: Spawning ${workerCount} investigator(s)...`);
    const workerStart = Date.now();
    
    await spawnWorkerPool(workerCount, this.query, this.stream);
    
    const workerTime = Date.now() - workerStart;
    console.log(`│     Investigation complete (${(workerTime / 1000).toFixed(1)}s)`);
    
    const totalTime = Date.now() - searchStart;
    console.log(`└─ Iteration ${iteration} complete (${(totalTime / 1000).toFixed(1)}s total) ─┘`);
  }
  
  /**
   * Get pending search requests from workers
   */
  private async getPendingSearchRequests(): Promise<SearchRequest[]> {
    const events = await this.stream.read();
    
    // Find search requests that haven't been fulfilled
    const searchRequestEvents = events.filter(e => 
      e.agent.startsWith('worker_') && 
      e.action === 'request_search'
    );
    
    // Check which ones have been fulfilled (have a corresponding search_complete)
    const fulfilledSources = new Set(
      events
        .filter(e => e.action === 'search_complete')
        .map(e => e.output.source)
    );
    
    const pendingRequests = searchRequestEvents
      .filter(e => !fulfilledSources.has(e.event_id!))
      .map(e => ({
        query: e.output.query,
        iteration: this.currentIteration + 1,
        source: e.event_id!,
        lead_type: e.output.lead_type,
        context: e.output.reason,
        filters: e.output.filters
      } as SearchRequest));
    
    return pendingRequests;
  }
  
  /**
   * Get current size of investigation queue
   */
  private async getQueueSize(): Promise<number> {
    const events = await this.stream.read();
    
    const queueEvents = events.filter(e => e.action === 'add_to_queue');
    const claimedEvents = events.filter(e => e.action === 'claim_work');
    const claimedIds = new Set(claimedEvents.map(e => e.output.interaction_id));
    
    const unclaimedCount = queueEvents.filter(e => 
      !claimedIds.has(e.output.interaction_id)
    ).length;
    
    return unclaimedCount;
  }
  
  /**
   * Check if exploration has converged (no more work to do)
   */
  async hasConverged(): Promise<boolean> {
    const pendingSearches = await this.getPendingSearchRequests();
    const queueSize = await this.getQueueSize();
    
    return pendingSearches.length === 0 && queueSize === 0;
  }
  
  /**
   * Get statistics about the exploration
   */
  async getStats(): Promise<{
    iterations: number;
    total_interactions_found: number;
    total_findings: number;
    total_leads_discovered: number;
  }> {
    const events = await this.stream.read();
    
    const searchEvents = events.filter(e => e.action === 'search_complete');
    const findingEvents = events.filter(e => e.action === 'finding');
    const leadEvents = events.filter(e => e.action === 'request_search');
    
    const totalInteractions = searchEvents.reduce(
      (sum, e) => sum + (e.output.results_found || 0), 
      0
    );
    
    return {
      iterations: this.currentIteration,
      total_interactions_found: totalInteractions,
      total_findings: findingEvents.length,
      total_leads_discovered: leadEvents.length
    };
  }
}

