import { Pool } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { WorkflowInput } from './types';
import { ContextAnalyzerAgent, createContextAnalyzer } from './agents/contextAnalyzer';
import { MultiStagePlannerAgent, createMultiStagePlanner } from './agents/multiStagePlanner';
import { ContextualSynthesizerAgent, createContextualSynthesizer } from './agents/contextualSynthesizer';
import { ParallelExecutor, createParallelExecutor } from './parallelExecutor';
import { AGENT_CONFIGS } from './config';

/**
 * Memory storage for Claude's memory tool
 * Stores user memories client-side
 */
interface Memory {
  name: string;
  content: string;
  timestamp: Date;
}

/**
 * Contextual Workflow
 * Orchestrates the advanced contextual workflow for TigAgent
 * Now supports optional memory feature for stateful synthesis
 */
export class ContextualWorkflow {
  private client: Anthropic;
  private pool: Pool;
  private contextAnalyzer: ContextAnalyzerAgent;
  private multiStagePlanner: MultiStagePlannerAgent;
  private contextualSynthesizer: ContextualSynthesizerAgent;
  private memoryStorage: Map<string, Map<string, Memory>>; // sessionId -> (name -> Memory)

  constructor(client: Anthropic, pool: Pool) {
    this.client = client;
    this.pool = pool;
    
    // Initialize agents
    this.contextAnalyzer = createContextAnalyzer(client);
    this.multiStagePlanner = createMultiStagePlanner(client);
    this.contextualSynthesizer = createContextualSynthesizer(client);
    
    // Initialize memory storage
    this.memoryStorage = new Map();
  }

  /**
   * Run the complete contextual workflow
   * @param input - The workflow input
   * @param sessionId - Optional session ID for stateful synthesis with memory
   */
  async run(input: WorkflowInput, sessionId?: string): Promise<any> {
    const logPrefix = sessionId ? `[Workflow:${sessionId}]` : '[Workflow]';
    console.log(`\n${logPrefix} Starting contextual workflow for query: "${input.query}"`);
    if (sessionId) {
      console.log(`${logPrefix} Memory feature enabled for session`);
    }
    const workflowStartTime = Date.now();

    try {
      // Step 1: Context Analysis (Stateless)
      console.log(`${logPrefix} Step 1/4: Analyzing context...`);
      const contextAnalysisStart = Date.now();
      const contextAnalysis = await this.contextAnalyzer.analyze(input);
      console.log(`${logPrefix} Context analysis completed in ${Date.now() - contextAnalysisStart}ms`);

      // Step 2: Multi-Stage Planning (Stateless)
      console.log(`${logPrefix} Step 2/4: Creating multi-stage query plan...`);
      const planningStart = Date.now();
      const multiStagePlan = await this.multiStagePlanner.plan(contextAnalysis, input.projectId);
      console.log(`${logPrefix} Planning completed in ${Date.now() - planningStart}ms`);

      // Step 3: Parallel Execution (No AI)
      console.log(`${logPrefix} Step 3/4: Executing queries in parallel...`);
      const executionStart = Date.now();
      const executor = createParallelExecutor(this.pool, input.projectId);
      const results = await executor.executeMultiStagePlan(multiStagePlan);
      console.log(`${logPrefix} Execution completed in ${Date.now() - executionStart}ms`);

      if (results.errors.length > 0) {
        console.warn(`${logPrefix} Errors encountered: ${results.errors.length}`);
      }

      // Step 4: Synthesis (Stateful if sessionId provided)
      console.log(`${logPrefix} Step 4/4: Synthesizing results${sessionId ? ' with memory' : ''}...`);
      const synthesisStart = Date.now();
      
      const response = sessionId
        ? await this.synthesizeWithMemory(results, multiStagePlan, input.query, sessionId)
        : await this.contextualSynthesizer.synthesize(results, multiStagePlan, input.query);
        
      console.log(`${logPrefix} Synthesis completed in ${Date.now() - synthesisStart}ms`);

      const totalTime = Date.now() - workflowStartTime;
      console.log(`${logPrefix} Total workflow time: ${totalTime}ms`);

      // Return comprehensive result object
      return {
        synthesis: response,
        context: contextAnalysis,
        primaryResults: results.primaryResult,
        contextualResults: results.contextualResults,
        errors: results.errors,
        executionTime: totalTime,
        sessionId: sessionId || null,
      };
    } catch (error) {
      console.error(`${logPrefix} Error in contextual workflow:`, error);
      return this.handleWorkflowError(error, input.query);
    }
  }

  /**
   * Synthesize with memory tool
   * Claude will automatically check its memory first before anything else
   */
  private async synthesizeWithMemory(
    results: any,
    plan: any,
    query: string,
    sessionId: string
  ): Promise<string> {
    const config = AGENT_CONFIGS.synthesizer;
    
    // Ensure session storage exists
    if (!this.memoryStorage.has(sessionId)) {
      this.memoryStorage.set(sessionId, new Map());
    }
    const sessionMemories = this.memoryStorage.get(sessionId)!;

    // Build prompt with data (limit to prevent token overflow)
    const primaryData = JSON.stringify(results.primaryResult.data.slice(0, 20), null, 2);
    const contextualData = results.contextualResults.map((r: any) => ({
      domain: r.domain,
      rowCount: r.rowCount,
      data: r.data.slice(0, 5),
    }));

    const prompt = `Answer this query using the provided data:

USER QUERY: "${query}"

PRIMARY DATA:
${primaryData}

CONTEXTUAL DATA:
${JSON.stringify(contextualData, null, 2)}

Remember: You have access to memory. Check what you remember about this user's preferences first, then answer accordingly.`;

    try {
      // Call Claude with memory tool using beta API
      const response = await (this.client as any).beta.messages.create({
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
        tools: [
          {
            type: 'memory_20250818',
            name: 'memory',
          },
        ],
        betas: ['context-management-2025-06-27'],
      });

      // Handle tool use loop - Claude may make multiple tool calls
      const messages: any[] = [
        {
          role: 'user',
          content: prompt,
        },
      ];

      let currentResponse = response;
      let loopCount = 0;
      const MAX_LOOPS = 10;

      while (currentResponse.stop_reason === 'tool_use' && loopCount < MAX_LOOPS) {
        loopCount++;
        console.log(`[Memory:${sessionId}] Tool use loop ${loopCount}, stop_reason: ${currentResponse.stop_reason}`);

        // Add assistant's tool use to messages
        messages.push({
          role: 'assistant',
          content: currentResponse.content,
        });

        // Process all tool uses and collect tool_results
        const toolResults: any[] = [];
        for (const block of currentResponse.content) {
          if (block.type === 'tool_use') {
            const command = (block.input as any).command;
            const path = (block.input as any).path || '';
            const content = (block.input as any).content;
            
            console.log(`[Memory:${sessionId}] Tool: ${block.name}, command: ${command}, path: ${path}`);
            
            let toolResult: any;
            if (command === 'view') {
              // View memory
              const memories = Array.from(sessionMemories.values());
              toolResult = memories.length > 0 ? JSON.stringify(memories, null, 2) : 'No memories stored yet.';
            } else if (command === 'write' || command === 'create') {
              // Write/create memory
              const memoryName = path.replace('/memories/', '') || `memory_${Date.now()}`;
              sessionMemories.set(memoryName, {
                name: memoryName,
                content: content || '',
                timestamp: new Date(),
              });
              console.log(`[Memory:${sessionId}] Stored memory: ${memoryName}`);
              toolResult = `Memory stored successfully at ${path || memoryName}`;
            } else if (command === 'delete') {
              // Delete memory
              const memoryName = path.replace('/memories/', '');
              sessionMemories.delete(memoryName);
              toolResult = `Memory deleted at ${path}`;
            } else {
              toolResult = `Unknown command: ${command}`;
            }
            
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: toolResult,
            });
          }
        }

        // Add tool_results to messages
        messages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue conversation
        currentResponse = await (this.client as any).beta.messages.create({
          model: config.model,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          system: config.systemPrompt,
          messages: messages,
          tools: [
            {
              type: 'memory_20250818',
              name: 'memory',
            },
          ],
          betas: ['context-management-2025-06-27'],
        });
      }

      // Extract final text response
      let responseText = '';
      for (const block of currentResponse.content) {
        if (block.type === 'text') {
          responseText += block.text;
        }
      }

      console.log(`[Memory:${sessionId}] Session has ${sessionMemories.size} memories stored`);
      console.log(`[Memory:${sessionId}] Final response: ${responseText.substring(0, 100)}...`);
      return responseText || 'No response generated.';
    } catch (error) {
      console.error(`[Memory:${sessionId}] Error in memory synthesis:`, error);
      // Fallback to regular synthesis
      return await this.contextualSynthesizer.synthesize(results, plan, query);
    }
  }

  /**
   * Get memories for a session
   */
  getSessionMemories(sessionId: string): Map<string, Memory> | null {
    return this.memoryStorage.get(sessionId) || null;
  }

  /**
   * Clear memories for a session
   */
  clearSessionMemories(sessionId: string): void {
    this.memoryStorage.delete(sessionId);
    console.log(`[Memory:${sessionId}] Cleared all memories`);
  }

  /**
   * Run workflow with streaming synthesis
   */
  async runStreaming(
    input: WorkflowInput,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log(`\n[Workflow] Starting streaming contextual workflow for query: "${input.query}"`);

    try {
      // Step 1: Context Analysis
      console.log('[Workflow] Step 1/4: Analyzing context...');
      const contextAnalysis = await this.contextAnalyzer.analyze(input);

      // Step 2: Multi-Stage Planning
      console.log('[Workflow] Step 2/4: Creating multi-stage query plan...');
      const multiStagePlan = await this.multiStagePlanner.plan(contextAnalysis, input.projectId);

      // Step 3: Parallel Execution
      console.log('[Workflow] Step 3/4: Executing queries in parallel...');
      const executor = createParallelExecutor(this.pool, input.projectId);
      const results = await executor.executeMultiStagePlan(multiStagePlan);

      // Step 4: Contextual Synthesis (Streaming)
      console.log('[Workflow] Step 4/4: Synthesizing results (streaming)...');
      await this.contextualSynthesizer.synthesizeStreaming(
        results,
        multiStagePlan,
        input.query,
        onChunk
      );
    } catch (error) {
      console.error('[Workflow] Error in streaming workflow:', error);
      onChunk(this.handleWorkflowError(error, input.query));
    }
  }

  /**
   * Run workflow with progress tracking
   */
  async runWithProgress(
    input: WorkflowInput,
    onProgress: (stage: string, progress: number) => void
  ): Promise<string> {
    console.log(`\n[Workflow] Starting workflow with progress tracking for query: "${input.query}"`);

    try {
      // Step 1: Context Analysis (0-25%)
      onProgress('Analyzing context', 0);
      const contextAnalysis = await this.contextAnalyzer.analyze(input);
      onProgress('Context analysis complete', 25);

      // Step 2: Multi-Stage Planning (25-50%)
      onProgress('Planning queries', 25);
      const multiStagePlan = await this.multiStagePlanner.plan(contextAnalysis, input.projectId);
      onProgress('Query planning complete', 50);

      // Step 3: Parallel Execution (50-75%)
      onProgress('Executing queries', 50);
      const executor = createParallelExecutor(this.pool, input.projectId);
      const results = await executor.executeMultiStagePlan(multiStagePlan);
      onProgress('Query execution complete', 75);

      // Step 4: Contextual Synthesis (75-100%)
      onProgress('Synthesizing results', 75);
      const response = await this.contextualSynthesizer.synthesize(
        results,
        multiStagePlan,
        input.query
      );
      onProgress('Synthesis complete', 100);

      return response;
    } catch (error) {
      console.error('[Workflow] Error in workflow with progress:', error);
      return this.handleWorkflowError(error, input.query);
    }
  }

  /**
   * Run narrative workflow (story-based synthesis)
   */
  async runNarrative(input: WorkflowInput): Promise<string> {
    console.log(`\n[Workflow] Starting narrative workflow for query: "${input.query}"`);

    try {
      // Execute standard workflow steps
      const contextAnalysis = await this.contextAnalyzer.analyze(input);
      const multiStagePlan = await this.multiStagePlanner.plan(contextAnalysis, input.projectId);
      const executor = createParallelExecutor(this.pool, input.projectId);
      const results = await executor.executeMultiStagePlan(multiStagePlan);

      // Use narrative synthesis
      const response = await this.contextualSynthesizer.synthesizeNarrative(
        results,
        multiStagePlan,
        input.query
      );

      return response;
    } catch (error) {
      console.error('[Workflow] Error in narrative workflow:', error);
      return this.handleWorkflowError(error, input.query);
    }
  }

  /**
   * Run timeline workflow (chronological synthesis)
   */
  async runTimeline(input: WorkflowInput): Promise<string> {
    console.log(`\n[Workflow] Starting timeline workflow for query: "${input.query}"`);

    try {
      // Execute standard workflow steps
      const contextAnalysis = await this.contextAnalyzer.analyze(input);
      const multiStagePlan = await this.multiStagePlanner.plan(contextAnalysis, input.projectId);
      const executor = createParallelExecutor(this.pool, input.projectId);
      const results = await executor.executeMultiStagePlan(multiStagePlan);

      // Use timeline synthesis
      const response = await this.contextualSynthesizer.synthesizeTimeline(
        results,
        multiStagePlan,
        input.query
      );

      return response;
    } catch (error) {
      console.error('[Workflow] Error in timeline workflow:', error);
      return this.handleWorkflowError(error, input.query);
    }
  }

  /**
   * Handle workflow errors
   */
  private handleWorkflowError(error: any, query: string): any {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const errorSynthesis = `# Error Processing Query

I encountered an error while processing your query: "${query}"

**Error Details:**
${errorMessage}

**What happened:**
The workflow failed during execution. This could be due to:
- Database connection issues
- Invalid query parameters
- API rate limits
- Unexpected data format

**Next steps:**
1. Check that your project ID is valid
2. Verify database connectivity
3. Try simplifying your query
4. Check the logs for more details

If the problem persists, please contact support with the error details above.`;

    return {
      synthesis: errorSynthesis,
      context: null,
      primaryResults: { rows: [], rowCount: 0 },
      contextualResults: [],
      errors: [errorMessage],
      executionTime: 0,
    };
  }

  /**
   * Get workflow statistics
   */
  getStats(): any {
    return {
      client: this.client ? 'initialized' : 'not initialized',
      pool: this.pool ? 'initialized' : 'not initialized',
      agents: {
        contextAnalyzer: this.contextAnalyzer ? 'ready' : 'not ready',
        multiStagePlanner: this.multiStagePlanner ? 'ready' : 'not ready',
        contextualSynthesizer: this.contextualSynthesizer ? 'ready' : 'not ready',
      },
    };
  }
}

/**
 * Create a contextual workflow instance
 */
export function createContextualWorkflow(client: Anthropic, pool: Pool): ContextualWorkflow {
  return new ContextualWorkflow(client, pool);
}

/**
 * Run contextual workflow (convenience function)
 */
export async function runContextualWorkflow(
  input: WorkflowInput,
  client: Anthropic,
  pool: Pool
): Promise<string> {
  const workflow = new ContextualWorkflow(client, pool);
  return workflow.run(input);
}

