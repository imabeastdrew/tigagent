import Anthropic from '@anthropic-ai/sdk';
import { ContextAnalysis, ContextualIntent, MultiStageQueryPlan, QueryPlan } from '../types';
import { AGENT_CONFIGS } from '../config';
import { mapConceptualEntity } from '../ontology';

/**
 * Multi-Stage Planner Agent
 * Creates coordinated query plans for primary and contextual queries
 */
export class MultiStagePlannerAgent {
  private client: Anthropic;

  constructor(client: Anthropic) {
    this.client = client;
  }

  /**
   * Create a multi-stage query plan from context analysis
   */
  async plan(contextAnalysis: ContextAnalysis, projectId: string): Promise<MultiStageQueryPlan> {
    try {
      // Plan primary query
      const primaryPlan = await this.planSingleIntent(
        contextAnalysis.primaryIntent,
        projectId,
        'primary'
      );

      // Plan contextual queries in parallel
      const contextualPlanPromises = contextAnalysis.contextualIntents.map(intent =>
        this.planSingleIntent(intent, projectId, 'contextual')
      );

      const contextualPlans = await Promise.all(contextualPlanPromises);

      // Create synthesis strategy
      const synthesisStrategy = this.createSynthesisStrategy(contextAnalysis);

      return {
        primaryPlan,
        contextualPlans: contextualPlans.filter(plan => plan !== null) as QueryPlan[],
        synthesisStrategy,
        explanation: `Created multi-stage plan with ${contextualPlans.length} contextual queries`,
      };
    } catch (error) {
      console.error('Planning error:', error);
      
      // Return fallback plan
      return this.getFallbackPlan(contextAnalysis, projectId);
    }
  }

  /**
   * Plan a single intent (primary or contextual)
   */
  private async planSingleIntent(
    intent: any,
    projectId: string,
    planType: 'primary' | 'contextual'
  ): Promise<QueryPlan> {
    const config = AGENT_CONFIGS.planner;

    try {
      const prompt = this.buildPlanningPrompt(intent, projectId, planType);

      const response = await this.client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        system: config.systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract the text content from the response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response from Claude');
      }

      // Parse the query plan
      const plan = this.parsePlanResponse(content.text, intent);

      return plan;
    } catch (error) {
      console.error('Single intent planning error:', error);
      
      // Return a basic plan
      return this.getBasicPlan(intent, projectId);
    }
  }

  /**
   * Build the planning prompt
   */
  private buildPlanningPrompt(
    intent: any,
    projectId: string,
    planType: 'primary' | 'contextual'
  ): string {
    const entityMapping = intent.entities
      .map((e: string) => mapConceptualEntity(e))
      .flat()
      .filter((e: string) => e);

    // Get suggested tables based on domain
    const suggestedTables = this.getSuggestedTablesForDomain(intent.domain);
    
    return `Create a database query plan for the following intent.

INTENT DETAILS:
- Domain: ${intent.domain}
- Query: ${intent.query}
- Available Tables: ${suggestedTables.join(', ')}
- Project ID: ${projectId}

AVAILABLE DATABASE TABLES:
1. conversations (fields: id, title, created_at, project_id)
2. interactions (fields: id, conversation_id, prompt_text, response_text, prompt_ts, author)
3. interaction_diffs (fields: id, interaction_id, file_path, diff_chunks, created_at)
4. commits (fields: id, hash, message, committed_at, created_at, project_id, author, branch)
5. users (fields: id, github_username, full_name)

TASK: Extract specific filters from the query and return ONLY valid JSON (no markdown, no backticks):

{
  "domain": "${intent.domain}",
  "intent": "${intent.query}",
  "entities": ["table1", "table2"],
  "filters": {
    "author": "exact name if mentioned (e.g., 'Henry', 'henryquillin')",
    "date": "YYYY-MM-DD if specific date mentioned (e.g., '2025-10-03')",
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } if range mentioned,
    "fileName": "file name if mentioned (e.g., 'page.tsx')",
    "branch": "branch name if mentioned",
    "searchText": "text to search for in messages/comments",
    "limit": number if user wants specific count (e.g., "top 5" = 5)
  },
  "explanation": "Brief plan description"
}

FILTER EXTRACTION RULES:
- If query mentions a person's name → set "author"
- If query mentions "october 3rd", "Oct 3" → set "date" as "2025-10-03" (use current year ${new Date().getFullYear()})
- If query mentions "last week" → set "dateRange" with start 7 days ago
- If query mentions "recent" → set "dateRange" with start 30 days ago  
- If query mentions a file name → set "fileName"
- If query mentions "main branch", "feature/x" → set "branch"
- If query says "top 5", "first 10" → set "limit"
- OMIT filter fields that aren't mentioned in the query
- IMPORTANT: If no year is specified in a date, assume the current year (${new Date().getFullYear()})

ENTITY RULES:
1. entities array MUST contain ONLY actual table names from the list above
2. Choose tables that match the domain: ${intent.domain}
3. For domain "conversation": use ["conversations"] or ["conversations", "interactions"]
4. For domain "interaction": use ["interactions"] or ["interactions", "interaction_diffs"]
5. For domain "commit": use ["commits"]
6. For domain "diff": use ["interaction_diffs"]

RESPOND NOW WITH JSON ONLY:`;
  }

  /**
   * Get suggested tables for a domain
   */
  private getSuggestedTablesForDomain(domain: string): string[] {
    const domainMap: Record<string, string[]> = {
      conversation: ['conversations', 'interactions'],
      interaction: ['interactions', 'interaction_diffs'],
      commit: ['commits'],
      diff: ['interaction_diffs'],
      user: ['users'],
      project: ['projects'],
    };
    return domainMap[domain] || ['interactions'];
  }

  /**
   * Parse the planning response
   */
  private parsePlanResponse(text: string, intent: any): QueryPlan {
    try {
      // Clean the text - remove markdown, extra spaces, control characters
      let cleaned = text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
        .trim();
      
      // Try to extract JSON from the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const jsonText = jsonMatch[0];
      const parsed = JSON.parse(jsonText);

      // Validate entities are actual table names
      const validTables = ['conversations', 'interactions', 'interaction_diffs', 'commits', 'users', 'projects'];
      let entities = parsed.entities || this.getDefaultEntities(intent);
      
      // Filter out invalid table names
      entities = entities.filter((e: string) => validTables.includes(e));
      
      if (entities.length === 0) {
        entities = this.getDefaultEntities(intent);
      }

      // Extract and clean filters
      const filters = parsed.filters ? this.cleanFilters(parsed.filters) : undefined;

      return {
        domain: parsed.domain || intent.domain,
        intent: parsed.intent || intent.query,
        entities,
        filters,
        priority: intent.priority,
      };
    } catch (error) {
      console.error('Error parsing plan response:', error);
      return this.getBasicPlan(intent, '');
    }
  }

  /**
   * Clean and validate filters from parsed response
   */
  private cleanFilters(filters: any): any {
    const cleaned: any = {};
    
    // Only include non-empty filters
    if (filters.author && typeof filters.author === 'string') {
      cleaned.author = filters.author.trim();
    }
    if (filters.date && typeof filters.date === 'string') {
      cleaned.date = filters.date.trim();
    }
    if (filters.dateRange && typeof filters.dateRange === 'object') {
      cleaned.dateRange = filters.dateRange;
    }
    if (filters.fileName && typeof filters.fileName === 'string') {
      cleaned.fileName = filters.fileName.trim();
    }
    if (filters.branch && typeof filters.branch === 'string') {
      cleaned.branch = filters.branch.trim();
    }
    if (filters.commitHash && typeof filters.commitHash === 'string') {
      cleaned.commitHash = filters.commitHash.trim();
    }
    if (filters.searchText && typeof filters.searchText === 'string') {
      cleaned.searchText = filters.searchText.trim();
    }
    if (filters.limit && typeof filters.limit === 'number') {
      cleaned.limit = Math.min(filters.limit, 200); // Cap at 200
    }
    
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  /**
   * Get default entities for an intent
   */
  private getDefaultEntities(intent: any): string[] {
    const domainToTables: Record<string, string[]> = {
      commit: ['commits'],
      interaction: ['interactions'],
      conversation: ['conversations', 'interactions'],
      diff: ['interaction_diffs'],
      user: ['users'],
      project: ['projects'],
    };

    return domainToTables[intent.domain] || ['interactions'];
  }

  /**
   * Get a basic plan when the agent fails
   */
  private getBasicPlan(intent: any, projectId: string): QueryPlan {
    const entities = this.getDefaultEntities(intent);

    return {
      domain: intent.domain,
      intent: intent.query,
      entities,
      priority: intent.priority || 1,
    };
  }

  /**
   * Create synthesis strategy based on context analysis
   */
  private createSynthesisStrategy(contextAnalysis: ContextAnalysis): any {
    const strategy = contextAnalysis.connectionStrategy;

    return {
      combineResults: true,
      highlightConnections: true,
      temporalOrdering: strategy.type === 'time_based',
      showContextualData: contextAnalysis.contextualIntents.length > 0,
    };
  }

  /**
   * Get fallback plan when planning fails
   */
  private getFallbackPlan(
    contextAnalysis: ContextAnalysis,
    projectId: string
  ): MultiStageQueryPlan {
    const primaryPlan = this.getBasicPlan(contextAnalysis.primaryIntent, projectId);

    const contextualPlans = contextAnalysis.contextualIntents.map(intent =>
      this.getBasicPlan(intent, projectId)
    );

    return {
      primaryPlan,
      contextualPlans,
      synthesisStrategy: {
        combineResults: true,
        highlightConnections: false,
        temporalOrdering: false,
        showContextualData: true,
      },
      explanation: 'Fallback plan due to planning error',
    };
  }
}

/**
 * Create a multi-stage planner instance
 */
export function createMultiStagePlanner(client: Anthropic): MultiStagePlannerAgent {
  return new MultiStagePlannerAgent(client);
}

/**
 * Plan multiple intents in parallel
 */
export async function planInParallel(
  planner: MultiStagePlannerAgent,
  intents: ContextualIntent[],
  projectId: string
): Promise<QueryPlan[]> {
  const planPromises = intents.map(intent =>
    planner['planSingleIntent'](intent, projectId, 'contextual')
  );

  const plans = await Promise.all(planPromises);
  return plans.filter(plan => plan !== null) as QueryPlan[];
}

