import Anthropic from '@anthropic-ai/sdk';
import { MultiStageQueryResults, MultiStageQueryPlan } from '../types';
import { AGENT_CONFIGS } from '../config';

/**
 * Contextual Synthesizer Agent
 * Synthesizes results from multiple coordinated queries into unified, contextual response
 */
export class ContextualSynthesizerAgent {
  private client: Anthropic;

  constructor(client: Anthropic) {
    this.client = client;
  }

  /**
   * Synthesize query results into a rich, contextual response
   */
  async synthesize(
    results: MultiStageQueryResults,
    plan: MultiStageQueryPlan,
    originalQuery: string
  ): Promise<string> {
    const config = AGENT_CONFIGS.synthesizer;

    try {
      const prompt = this.buildSynthesisPrompt(results, plan, originalQuery);

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

      return content.text;
    } catch (error) {
      console.error('Synthesis error:', error);
      
      // Return a basic synthesis
      return this.getBasicSynthesis(results, originalQuery);
    }
  }

  /**
   * Build the synthesis prompt
   */
  private buildSynthesisPrompt(
    results: MultiStageQueryResults,
    plan: MultiStageQueryPlan,
    originalQuery: string
  ): string {
    const primaryData = JSON.stringify(results.primaryResult.data, null, 2);
    const contextualData = results.contextualResults.map((r, i) => ({
      domain: r.domain,
      intent: r.intent,
      rowCount: r.rowCount,
      data: r.data.slice(0, 10), // Include first 10 rows as sample
    }));

    return `Answer the following user query using ONLY the data provided below.

USER QUERY: "${originalQuery}"

PRIMARY DATA:
Domain: ${results.primaryResult.domain}
Intent: ${results.primaryResult.intent}
Row Count: ${results.primaryResult.rowCount}
${primaryData}

ADDITIONAL CONTEXT:
${JSON.stringify(contextualData, null, 2)}

INSTRUCTIONS:
- Answer the user's query directly and concisely
- Use ONLY the information from the data above
- Follow the user's formatting instructions exactly (e.g., if they ask for "5 sentences", provide exactly 5 sentences)
- If they ask for a summary, be concise
- If they ask for details, be comprehensive
- If they specify a format (bullet points, paragraphs, numbered list), use that format
- Do not add extra sections or structure unless the user requested it
- Focus on answering what was asked, nothing more

Answer the query now:`;
  }

  /**
   * Get a basic synthesis when the agent fails
   */
  private getBasicSynthesis(results: MultiStageQueryResults, originalQuery: string): string {
    const sections: string[] = [];

    sections.push(`# Query Results\n`);
    sections.push(`Query: "${originalQuery}"\n`);

    // Primary results
    sections.push(`## Primary Results\n`);
    sections.push(`Domain: ${results.primaryResult.domain}`);
    sections.push(`Found ${results.primaryResult.rowCount} results\n`);

    if (results.primaryResult.error) {
      sections.push(`**Error**: ${results.primaryResult.error}\n`);
    } else if (results.primaryResult.rowCount === 0) {
      sections.push(`No data found for this query.\n`);
    } else {
      sections.push(`Sample data:`);
      sections.push(`\`\`\`json`);
      sections.push(JSON.stringify(results.primaryResult.data.slice(0, 3), null, 2));
      sections.push(`\`\`\`\n`);
    }

    // Contextual results
    if (results.contextualResults.length > 0) {
      sections.push(`## Related Context\n`);

      for (const contextual of results.contextualResults) {
        sections.push(`### ${contextual.domain}`);
        sections.push(`Found ${contextual.rowCount} related ${contextual.domain} records\n`);
      }
    }

    // Execution stats
    sections.push(`## Execution Statistics\n`);
    sections.push(`- Total execution time: ${results.totalExecutionTime}ms`);
    sections.push(`- Primary query time: ${results.primaryResult.executionTime}ms`);
    
    if (results.errors.length > 0) {
      sections.push(`\n**Errors encountered**: ${results.errors.length}`);
      results.errors.forEach((error, i) => {
        sections.push(`${i + 1}. ${error}`);
      });
    }

    return sections.join('\n');
  }

  /**
   * Synthesize with streaming for large results
   */
  async synthesizeStreaming(
    results: MultiStageQueryResults,
    plan: MultiStageQueryPlan,
    originalQuery: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const config = AGENT_CONFIGS.synthesizer;

    try {
      const prompt = this.buildSynthesisPrompt(results, plan, originalQuery);

      const stream = await this.client.messages.create({
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
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          onChunk(event.delta.text);
        }
      }
    } catch (error) {
      console.error('Streaming synthesis error:', error);
      onChunk(this.getBasicSynthesis(results, originalQuery));
    }
  }

  /**
   * Create a narrative synthesis (story-based)
   */
  async synthesizeNarrative(
    results: MultiStageQueryResults,
    plan: MultiStageQueryPlan,
    originalQuery: string
  ): Promise<string> {
    // Similar to synthesize but with emphasis on storytelling
    const config = AGENT_CONFIGS.synthesizer;

    const narrativePrompt = `Create a narrative that tells the story of: "${originalQuery}"

Use the following data to construct a compelling narrative:

Primary Results: ${JSON.stringify(results.primaryResult.data, null, 2)}

Contextual Results: ${JSON.stringify(results.contextualResults, null, 2)}

Tell a story that:
- Has a beginning (what was the situation?)
- A middle (what happened, what actions were taken?)
- An end (what was the outcome?)
- Highlights key players and their contributions
- Shows cause and effect relationships
- Provides insights into the development process

Be engaging and insightful.`;

    try {
      const response = await this.client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: 0.8, // Higher temperature for more creative narrative
        system: config.systemPrompt,
        messages: [
          {
            role: 'user',
            content: narrativePrompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response from Claude');
      }

      return content.text;
    } catch (error) {
      console.error('Narrative synthesis error:', error);
      return this.getBasicSynthesis(results, originalQuery);
    }
  }

  /**
   * Create a timeline synthesis (chronological)
   */
  async synthesizeTimeline(
    results: MultiStageQueryResults,
    plan: MultiStageQueryPlan,
    originalQuery: string
  ): Promise<string> {
    const config = AGENT_CONFIGS.synthesizer;

    const timelinePrompt = `Create a chronological timeline for: "${originalQuery}"

Use the following data to construct a timeline:

Primary Results: ${JSON.stringify(results.primaryResult.data, null, 2)}

Contextual Results: ${JSON.stringify(results.contextualResults, null, 2)}

Create a timeline that:
- Orders events chronologically
- Shows parallel activities
- Highlights key milestones
- Connects related events across time
- Shows cause and effect relationships
- Identifies patterns over time

Format as a clear, easy-to-follow timeline.`;

    try {
      const response = await this.client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        system: config.systemPrompt,
        messages: [
          {
            role: 'user',
            content: timelinePrompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response from Claude');
      }

      return content.text;
    } catch (error) {
      console.error('Timeline synthesis error:', error);
      return this.getBasicSynthesis(results, originalQuery);
    }
  }
}

/**
 * Create a contextual synthesizer instance
 */
export function createContextualSynthesizer(client: Anthropic): ContextualSynthesizerAgent {
  return new ContextualSynthesizerAgent(client);
}

