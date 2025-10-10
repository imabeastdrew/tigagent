import { ExplorationStream } from '../s2/client';
import { WorkItem, Interaction, InvestigationResult, Finding, Lead, SearchRequest } from '../types';
import { createAnthropicClient, AGENT_MODELS } from '../config';
import { executeSqlQuery } from '../tools/sql';

/**
 * Worker/Investigator Agent - Processes threads and extracts findings + leads
 * 
 * - Claims work from queue
 * - Processes conversation threads interaction-by-interaction
 * - Extracts findings (decisions, problems, solutions)
 * - Discovers leads (commits, entities, people to search for)
 * - Writes findings immediately for synthesis
 * - Requests new searches from Discovery
 */
export class WorkerAgent {
  private workerId: number;
  private stream: ExplorationStream;
  private query: string;
  private lastEventId: string | null = null;
  private requestedSearches: Set<string> = new Set(); // Track requested searches to avoid duplicates
  
  constructor(workerId: number, query: string, stream: ExplorationStream) {
    this.workerId = workerId;
    this.query = query;
    this.stream = stream;
  }
  
  /**
   * Run the worker loop - claim work, process, repeat until queue empty
   */
  async run(): Promise<void> {
    console.log(`[Worker ${this.workerId}] Starting`);
    
    while (true) {
      const workItem = await this.claimWorkFromQueue();
      if (!workItem) {
        console.log(`[Worker ${this.workerId}] Queue empty, stopping`);
        break;
      }
      
      try {
        await this.processWorkItem(workItem);
      } catch (error) {
        console.error(`[Worker ${this.workerId}] Error processing work item:`, error);
        
        await this.stream.append({
          agent: `worker_${this.workerId}`,
          phase: 'investigation',
          action: 'error',
          output: {
            error: error instanceof Error ? error.message : String(error),
            work_item: workItem
          }
        });
      }
    }
    
    console.log(`[Worker ${this.workerId}] Complete`);
  }
  
  /**
   * Claim work from the investigation queue
   */
  private async claimWorkFromQueue(): Promise<WorkItem | null> {
    const events = await this.stream.read();
    
    // Find all queue events
    const queueEvents = events.filter(e => e.action === 'add_to_queue');
    
    if (queueEvents.length === 0) {
      return null;
    }
    
    // Find all claimed interaction IDs AND conversation IDs
    const claimedEvents = events.filter(e => e.action === 'claim_work');
    const claimedInteractionIds = new Set(claimedEvents.map(e => e.output.interaction_id));
    const claimedConversationIds = new Set(claimedEvents.map(e => e.output.conversation_id));
    
    // Filter to unclaimed work (check BOTH interaction AND conversation)
    const unclaimedQueue = queueEvents.filter(e => {
      const workItem = e.output as WorkItem;
      return !claimedInteractionIds.has(workItem.interaction_id) &&
             !claimedConversationIds.has(workItem.conversation_id);
    });
    
    if (unclaimedQueue.length === 0) {
      return null;
    }
    
    // Sort by priority (highest first)
    unclaimedQueue.sort((a, b) => b.output.priority - a.output.priority);
    
    // Claim the highest priority item
    const workEvent = unclaimedQueue[0];
    const workItem = workEvent.output as WorkItem;
    
    console.log(`[Worker ${this.workerId}] Claimed work: interaction ${workItem.interaction_id.slice(0, 8)}... in conversation ${workItem.conversation_id.slice(0, 8)}... (priority: ${workItem.priority})`);
    
    // Mark as claimed by writing claim event (includes both IDs)
    await this.stream.append({
      agent: `worker_${this.workerId}`,
      phase: 'investigation',
      action: 'claim_work',
      output: {
        interaction_id: workItem.interaction_id,
        conversation_id: workItem.conversation_id,
        priority: workItem.priority
      },
      references: [workEvent.event_id!]
    });
    
    return workItem;
  }
  
  /**
   * Process a work item - get thread and investigate
   */
  private async processWorkItem(workItem: WorkItem): Promise<void> {
    console.log(`[Worker ${this.workerId}] Processing conversation ${workItem.conversation_id}`);
    
    // Get full conversation thread
    const thread = await this.getFullThread(workItem.conversation_id);
    console.log(`[Worker ${this.workerId}] Retrieved thread with ${thread.length} interactions`);
    
    // Get context from other investigators
    const otherFindings = await this.getOtherFindings();
    
    // Process each interaction in the thread
    for (let i = 0; i < thread.length; i++) {
      const interaction = thread[i];
      
      console.log(`[Worker ${this.workerId}] Analyzing interaction ${i + 1}/${thread.length}`);
      
      // Analyze this interaction
      const result = await this.analyzeInteraction(
        interaction,
        thread.slice(0, i), // Previous interactions for context
        otherFindings
      );
      
      // Write findings immediately
      for (const finding of result.findings) {
        await this.stream.append({
          agent: `worker_${this.workerId}`,
          phase: 'investigation',
          action: 'finding',
          output: finding
        });
      }
      
      // Filter and limit leads before requesting searches
      const validLeads = this.filterAndLimitLeads(result.leads);
      
      // Request searches for valid leads only
      for (const lead of validLeads) {
        await this.requestSearch(lead);
      }
      
      // Update last event ID for incremental reading
      const events = await this.stream.read();
      this.lastEventId = events[events.length - 1].event_id || null;
    }
    
    console.log(`[Worker ${this.workerId}] Completed investigation of conversation ${workItem.conversation_id}`);
  }
  
  /**
   * Get full conversation thread from database
   */
  private async getFullThread(conversationId: string): Promise<Interaction[]> {
    const results = await executeSqlQuery(
      `
      SELECT
        i.id,
        i.conversation_id,
        i.prompt_text,
        i.response_text,
        i.author,
        i.prompt_ts,
        c.title as conversation_title,
        c.platform
      FROM interactions i
      JOIN conversations c ON i.conversation_id = c.id
      WHERE i.conversation_id = $1
      ORDER BY i.prompt_ts ASC
      `,
      [conversationId]
    );
    
    return results;
  }
  
  /**
   * Get findings from other investigators (for context)
   */
  private async getOtherFindings(): Promise<Finding[]> {
    const events = await this.stream.read({ since_id: this.lastEventId || undefined });
    
    const findings = events
      .filter(e => e.agent.startsWith('worker_') && e.action === 'finding')
      .map(e => e.output as Finding);
    
    return findings;
  }
  
  /**
   * Filter and limit leads to prevent search explosion
   */
  private filterAndLimitLeads(leads: Lead[]): Lead[] {
    const MAX_LEADS_PER_INTERACTION = 2;
    
    // Filter out leads we've already requested
    const newLeads = leads.filter(lead => {
      const searchKey = `${lead.type}:${lead.search_query}`;
      return !this.requestedSearches.has(searchKey);
    });
    
    // Only keep high priority leads
    const highPriorityLeads = newLeads.filter(lead => lead.priority === 'high');
    
    // Limit to max per interaction
    const limitedLeads = highPriorityLeads.slice(0, MAX_LEADS_PER_INTERACTION);
    
    // Track that we've requested these
    limitedLeads.forEach(lead => {
      const searchKey = `${lead.type}:${lead.search_query}`;
      this.requestedSearches.add(searchKey);
    });
    
    if (leads.length > limitedLeads.length) {
      console.log(`[Worker ${this.workerId}] Filtered leads: ${leads.length} → ${limitedLeads.length} (removed duplicates/low-priority)`);
    }
    
    return limitedLeads;
  }
  
  /**
   * Analyze a single interaction - extract findings and leads
   */
  private async analyzeInteraction(
    interaction: Interaction,
    threadContext: Interaction[],
    otherFindings: Finding[]
  ): Promise<InvestigationResult> {
    const client = createAnthropicClient();
    
    // Prepare context summaries
    const contextSummary = threadContext.length > 0
      ? threadContext.map(i => 
          `[${i.author} at ${i.prompt_ts}]: ${i.prompt_text.slice(0, 100)}...`
        ).join('\n')
      : 'This is the first interaction in the thread';
    
    const otherFindingsSummary = otherFindings.length > 0
      ? otherFindings.slice(-5).map(f => `- ${f.summary}`).join('\n')
      : 'No findings yet from other investigators';
    
    const response = await client.messages.create({
      model: AGENT_MODELS.worker,
      max_tokens: 3000,
      system: `You are investigating a conversation to extract findings and discover new leads.`,
      messages: [{
        role: 'user',
        content: `ORIGINAL QUERY: "${this.query}"

CONTEXT FROM OTHER INVESTIGATORS:
${otherFindingsSummary}

THREAD CONTEXT (previous interactions in this conversation):
${contextSummary}

CURRENT INTERACTION TO ANALYZE:
Author: ${interaction.author}
Timestamp: ${interaction.prompt_ts}

User Message:
${interaction.prompt_text}

Assistant Response:
${interaction.response_text}

---

YOUR TASKS:

1. EXTRACT FINDINGS - What information here helps answer the query?
   Types: decision, problem, solution, technical_detail, context
   
2. IDENTIFY CRITICAL LEADS - BE VERY SELECTIVE
   
   ONLY create a lead if ALL of these are true:
   - It is CRITICAL to answering the original query (not just mentioned)
   - Without it, we cannot fully answer a key aspect of the query
   - Other investigators haven't already found this information
   - High confidence (>80%) it will provide essential context
   
   LIMITS:
   - Maximum 2 leads per interaction
   - Only priority: "high" (no medium/low)
   - Must justify: "Without this, we cannot answer: [specific aspect]"
   
   EXAMPLES OF GOOD LEADS:
   ✓ Query asks "what did Matthew fix?" → Matthew's commit is mentioned → CRITICAL
   ✓ Query asks "how was bug solved?" → Solution code file referenced → CRITICAL
   
   EXAMPLES OF BAD LEADS (DO NOT CREATE):
   ✗ File mentioned tangentially → Not critical
   ✗ Date mentioned but not central to query → Not critical
   ✗ Entity explained in this interaction → Already have info
   ✗ Person mentioned but their work not queried → Not relevant

3. ASSESS COMPLETENESS - Can we answer the query with current findings?

RESPOND IN JSON (no markdown):
{
  "findings": [
    {
      "type": "decision|problem|solution|technical_detail|context",
      "summary": "One sentence summary",
      "details": "Full explanation with quotes",
      "entities": ["entity1", "entity2"],
      "relevance_to_query": "How this helps answer the query",
      "confidence": 0.8
    }
  ],
  "leads": [
    {
      "type": "commit|entity|person|temporal|file",
      "value": "specific value",
      "search_query": "What to search for",
      "reason": "Why we need this",
      "priority": "high|medium|low"
    }
  ],
  "completeness": {
    "score": 0.7,
    "missing": ["What specific files changed"]
  }
}`
      }]
    });
    
    // Parse response
    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in analysis response');
    }
    
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in analysis response');
    }
    
    const result = JSON.parse(jsonMatch[0]) as InvestigationResult;
    
    // Add metadata to findings
    result.findings = result.findings.map(f => ({
      ...f,
      interaction_id: interaction.id,
      author: interaction.author,
      timestamp: interaction.prompt_ts
    }));
    
    return result;
  }
  
  /**
   * Request a new search from Discovery for a discovered lead
   */
  private async requestSearch(lead: Lead): Promise<void> {
    console.log(`[Worker ${this.workerId}] Requesting search: "${lead.search_query}" (${lead.type})`);
    
    await this.stream.append({
      agent: `worker_${this.workerId}`,
      phase: 'investigation',
      action: 'request_search',
      output: {
        lead_type: this.convertLeadTypeToSearchType(lead.type),
        query: lead.search_query,
        reason: lead.reason,
        priority: lead.priority,
        filters: this.extractFiltersFromLead(lead)
      }
    });
  }
  
  /**
   * Convert lead type to search request lead_type
   */
  private convertLeadTypeToSearchType(leadType: string): string {
    const mapping: Record<string, string> = {
      'commit': 'commit_reference',
      'entity': 'entity_reference',
      'person': 'person_reference',
      'temporal': 'date_reference',
      'file': 'file_reference',
      'conversation': 'conversation_reference'
    };
    return mapping[leadType] || 'entity_reference';
  }
  
  /**
   * Extract filters from lead for targeted search
   */
  private extractFiltersFromLead(lead: Lead): SearchRequest['filters'] {
    switch (lead.type) {
      case 'commit':
        return { commit_hash: lead.value };
      case 'person':
        return { author: lead.value };
      case 'file':
        return { file_path: lead.value };
      case 'temporal':
        return { date: lead.value };
      default:
        return undefined;
    }
  }
}

/**
 * Spawn worker pool to process investigation queue
 */
export async function spawnWorkerPool(
  workerCount: number,
  query: string,
  stream: ExplorationStream
): Promise<void> {
  console.log(`[WorkerPool] Spawning ${workerCount} workers`);
  
  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    const worker = new WorkerAgent(i, query, stream);
    workers.push(worker.run());
    
    // Small delay to stagger worker starts and reduce race conditions
    if (i < workerCount - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Wait for all workers to complete
  await Promise.all(workers);
  
  console.log(`[WorkerPool] All ${workerCount} workers complete`);
}

