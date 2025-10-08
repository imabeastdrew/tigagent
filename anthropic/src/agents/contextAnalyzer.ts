import Anthropic from '@anthropic-ai/sdk';
import { ContextAnalysis, WorkflowInput } from '../types';
import { AGENT_CONFIGS, QUERY_OPTIONS } from '../config';

/**
 * Context Analyzer Agent
 * Analyzes user queries to identify primary intent and discover related contextual information
 */
export class ContextAnalyzerAgent {
  private client: Anthropic;

  constructor(client: Anthropic) {
    this.client = client;
  }

  /**
   * Analyze a query to discover contexts and relationships
   */
  async analyze(input: WorkflowInput): Promise<ContextAnalysis> {
    const config = AGENT_CONFIGS.contextAnalyzer;

    try {
      const prompt = this.buildPrompt(input.query);

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

      // Parse the JSON response
      const analysis = this.parseResponse(content.text);

      return analysis;
    } catch (error) {
      console.error('Context analysis error:', error);
      
      // Return a fallback analysis
      return this.getFallbackAnalysis(input.query);
    }
  }

  /**
   * Build the prompt for context analysis
   */
  private buildPrompt(query: string): string {
    return `Analyze this developer query and identify the primary intent and related contextual information.

User Query: "${query}"

Please analyze this query and return a JSON response with the following structure:

{
  "primaryIntent": {
    "domain": "commit|interaction|conversation|diff|user|project",
    "query": "Clear description of the primary intent",
    "entities": ["list", "of", "relevant", "entities"]
  },
  "contextualIntents": [
    {
      "domain": "commit|interaction|conversation|diff|user|project",
      "query": "Description of related contextual query",
      "connectionType": "temporal|semantic|commit|file|author",
      "entities": ["list", "of", "relevant", "entities"],
      "priority": 1|2|3
    }
  ],
  "connectionStrategy": {
    "type": "time_based|commit_based|semantic|file_based|author_based",
    "parameters": {
      "key": "value pairs for connection parameters"
    }
  },
  "explanation": "Brief explanation of the analysis"
}

Context Discovery Guidelines:
1. Identify the PRIMARY domain and intent (what the user directly asked for)
2. Discover CONTEXTUAL intents (related information that provides context):
   - Temporal: What happened around the same time?
   - Semantic: Related concepts, functions, files?
   - Causal: What led to this, what resulted from it?
   - Collaborative: Who else was involved?
   - Data Chain: Follow Diffs → Interactions → Conversations

3. Assign priorities:
   - Priority 1 (High): Directly related, essential for understanding
   - Priority 2 (Medium): Related, provides valuable context
   - Priority 3 (Low): Loosely related, nice to have

4. Choose connection strategy based on the query type

Return ONLY the JSON response, no additional text.`;
  }

  /**
   * Parse the Claude response into ContextAnalysis
   */
  private parseResponse(text: string): ContextAnalysis {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate the structure
      if (!parsed.primaryIntent || !parsed.contextualIntents || !parsed.connectionStrategy) {
        throw new Error('Invalid response structure');
      }

      return parsed as ContextAnalysis;
    } catch (error) {
      console.error('Error parsing context analysis response:', error);
      throw error;
    }
  }

  /**
   * Get a fallback analysis when the agent fails
   */
  private getFallbackAnalysis(query: string): ContextAnalysis {
    const lowerQuery = query.toLowerCase();

    // Determine primary domain based on keywords
    let domain = 'interaction';
    if (lowerQuery.includes('commit')) domain = 'commit';
    else if (lowerQuery.includes('conversation') || lowerQuery.includes('chat')) domain = 'conversation';
    else if (lowerQuery.includes('diff') || lowerQuery.includes('change')) domain = 'diff';
    else if (lowerQuery.includes('user') || lowerQuery.includes('author')) domain = 'user';

    return {
      primaryIntent: {
        domain,
        query: `Find ${domain} data related to: ${query}`,
        entities: this.extractSimpleEntities(query),
      },
      contextualIntents: [
        {
          domain: domain === 'commit' ? 'interaction' : 'commit',
          query: `Find related ${domain === 'commit' ? 'interactions' : 'commits'}`,
          connectionType: 'temporal',
          entities: [],
          priority: 2,
        },
      ],
      connectionStrategy: {
        type: 'time_based',
        parameters: {
          timeWindow: '30 days',
        },
      },
      explanation: 'Fallback analysis due to parsing error',
    };
  }

  /**
   * Extract simple entities from query
   */
  private extractSimpleEntities(query: string): string[] {
    const entities: string[] = [];
    const lowerQuery = query.toLowerCase();

    // Look for file names
    const fileMatch = query.match(/[\w-]+\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|h)/gi);
    if (fileMatch) {
      entities.push(...fileMatch);
    }

    // Look for common entity types
    if (lowerQuery.includes('commit')) entities.push('commits');
    if (lowerQuery.includes('conversation') || lowerQuery.includes('chat')) entities.push('conversations');
    if (lowerQuery.includes('interaction')) entities.push('interactions');
    if (lowerQuery.includes('diff') || lowerQuery.includes('change')) entities.push('interaction_diffs');

    return entities;
  }

  /**
   * Analyze with session context (for follow-up queries)
   */
  async analyzeWithContext(
    input: WorkflowInput,
    previousAnalyses: ContextAnalysis[]
  ): Promise<ContextAnalysis> {
    // For now, just use the regular analysis
    // In the future, we can use session context to refine the analysis
    return this.analyze(input);
  }
}

/**
 * Create a context analyzer instance
 */
export function createContextAnalyzer(client: Anthropic): ContextAnalyzerAgent {
  return new ContextAnalyzerAgent(client);
}

