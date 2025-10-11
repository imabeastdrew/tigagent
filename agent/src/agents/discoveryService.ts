import { ExplorationStream } from '../s2/client';
import { SearchRequest, Interaction } from '../types';
import { semanticSearch } from '../tools/semantic';
import { executeSqlQuery } from '../tools/sql';

/**
 * Discovery Service - Search engine that responds to search requests
 * 
 * Handles:
 * - Initial semantic searches
 * - Targeted searches from worker leads
 * - Deduplication of results
 * - Dynamic judge spawning
 */
export class DiscoveryService {
  private processedInteractionIds: Set<string> = new Set();
  
  constructor(
    private projectId: string,
    private stream: ExplorationStream
  ) {}

  /**
   * Handle a search request from initial query or worker lead
   */
  async handleSearchRequest(request: SearchRequest): Promise<Interaction[]> {
    console.log(`[Discovery] Iteration ${request.iteration}: ${request.lead_type} search for "${request.query}"`);
    
    let results: any[];
    
    // Route to appropriate search based on lead type
    switch (request.lead_type) {
      case 'initial':
        results = await this.initialSearch(request.query);
        break;
        
      case 'commit_reference':
        results = await this.searchByCommit(request);
        break;
        
      case 'entity_reference':
        results = await this.searchByEntity(request);
        break;
        
      case 'person_reference':
        results = await this.searchByPerson(request);
        break;
        
      case 'date_reference':
        results = await this.searchByDate(request);
        break;
        
      case 'file_reference':
        results = await this.searchByFile(request);
        break;
        
      case 'conversation_reference':
        results = await this.searchByConversation(request);
        break;
        
      default:
        results = await semanticSearch(request.query, this.projectId, 20);
    }
    
    // Filter out already-seen interactions
    const newResults = results.filter(r => !this.processedInteractionIds.has(r.id));
    newResults.forEach(r => this.processedInteractionIds.add(r.id));
    
    const duplicates = results.length - newResults.length;
    console.log(`[Discovery] Found ${newResults.length} NEW interactions (${duplicates} already seen)`);
    
    // Write search results to stream
    const storageKey = await this.stream.put(
      `search_iter${request.iteration}_${Date.now()}`, 
      newResults
    );
    
    await this.stream.append({
      agent: 'discovery',
      phase: 'search',
      action: 'search_complete',
      output: {
        iteration: request.iteration,
        source: request.source,
        query: request.query,
        lead_type: request.lead_type,
        results_found: newResults.length,
        duplicates_filtered: duplicates,
        interaction_ids: newResults.map(r => r.id)
      },
      storage: {
        results: storageKey
      },
      references: request.source !== 'user_query' ? [request.source] : undefined
    });
    
    return newResults;
  }
  
  /**
   * Initial broad semantic search
   */
  private async initialSearch(query: string): Promise<any[]> {
    return await semanticSearch(query, this.projectId, 10);
  }
  
  /**
   * Search for interactions related to a specific commit
   */
  private async searchByCommit(request: SearchRequest): Promise<any[]> {
    if (!request.filters?.commit_hash) {
      // Fallback to semantic search for commit references
      return await semanticSearch(request.query, this.projectId, 10);
    }
    
    const results = await executeSqlQuery(
      `
      SELECT DISTINCT
        i.id,
        i.conversation_id,
        i.prompt_text,
        i.response_text,
        i.author,
        i.prompt_ts,
        c2.title as conversation_title,
        c2.platform,
        0.9 as similarity
      FROM commit_interactions ci
      JOIN commits c ON ci.commit_id = c.id
      JOIN interactions i ON ci.interaction_id = i.id
      JOIN conversations c2 ON i.conversation_id = c2.id
      WHERE c.hash = $1 AND c2.project_id = $2
      `,
      [request.filters.commit_hash, this.projectId]
    );
    
    return results;
  }
  
  /**
   * Search for interactions about a specific entity/concept
   */
  private async searchByEntity(request: SearchRequest): Promise<any[]> {
    // Use semantic search for entity mentions
    return await semanticSearch(request.query, this.projectId, 15);
  }
  
  /**
   * Search for interactions by a specific person
   */
  private async searchByPerson(request: SearchRequest): Promise<any[]> {
    if (!request.filters?.author) {
      return await semanticSearch(request.query, this.projectId, 10);
    }
    
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
        c.platform,
        0.8 as similarity
      FROM interactions i
      JOIN conversations c ON i.conversation_id = c.id
      WHERE i.author = $1 AND c.project_id = $2
      ORDER BY i.prompt_ts DESC
      LIMIT 15
      `,
      [request.filters.author, this.projectId]
    );
    
    return results;
  }
  
  /**
   * Search for interactions around a specific date
   */
  private async searchByDate(request: SearchRequest): Promise<any[]> {
    if (!request.filters?.date) {
      return await semanticSearch(request.query, this.projectId, 10);
    }
    
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
        c.platform,
        0.7 as similarity
      FROM interactions i
      JOIN conversations c ON i.conversation_id = c.id
      WHERE DATE(i.prompt_ts) = $1 AND c.project_id = $2
      ORDER BY i.prompt_ts
      `,
      [request.filters.date, this.projectId]
    );
    
    return results;
  }
  
  /**
   * Search for interactions that modified a specific file
   */
  private async searchByFile(request: SearchRequest): Promise<any[]> {
    if (!request.filters?.file_path) {
      return await semanticSearch(request.query, this.projectId, 10);
    }
    
    const results = await executeSqlQuery(
      `
      SELECT DISTINCT
        i.id,
        i.conversation_id,
        i.prompt_text,
        i.response_text,
        i.author,
        i.prompt_ts,
        c.title as conversation_title,
        c.platform,
        0.85 as similarity
      FROM interaction_diffs id2
      JOIN interactions i ON id2.interaction_id = i.id
      JOIN conversations c ON i.conversation_id = c.id
      WHERE id2.file_path = $1 AND c.project_id = $2
      ORDER BY i.prompt_ts DESC
      LIMIT 15
      `,
      [request.filters.file_path, this.projectId]
    );
    
    return results;
  }
  
  /**
   * Search within a specific conversation
   */
  private async searchByConversation(request: SearchRequest): Promise<any[]> {
    // Extract conversation ID from query or use semantic search
    return await semanticSearch(request.query, this.projectId, 10);
  }
  
  /**
   * Get list of already-processed interaction IDs
   */
  getProcessedIds(): string[] {
    return Array.from(this.processedInteractionIds);
  }
  
  /**
   * Reset processed IDs (for testing)
   */
  reset(): void {
    this.processedInteractionIds.clear();
  }
}
