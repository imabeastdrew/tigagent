import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { WorkflowInput } from './types';
import { createAnthropicClient, createDatabasePool } from './config';
import { ContextualWorkflow, createContextualWorkflow, runContextualWorkflow } from './workflow';
import { testConnection } from './executor';

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });

/**
 * TigAgent - Anthropic Implementation
 * Main entry point for the TigAgent using Anthropic's Claude API
 */

/**
 * Initialize TigAgent
 */
export async function initializeTigAgent(): Promise<{
  client: Anthropic;
  pool: Pool;
  workflow: ContextualWorkflow;
}> {
  console.log('[TigAgent] Initializing TigAgent with Anthropic Claude...');

  try {
    // Initialize Anthropic client
    const client = createAnthropicClient();
    console.log('[TigAgent] Anthropic client initialized');

    // Initialize database pool
    const pool = createDatabasePool();
    console.log('[TigAgent] Database pool created');

    // Test database connection
    const isConnected = await testConnection(pool);
    if (!isConnected) {
      throw new Error('Database connection test failed');
    }
    console.log('[TigAgent] Database connection verified');

    // Create workflow
    const workflow = createContextualWorkflow(client, pool);
    console.log('[TigAgent] Contextual workflow ready');

    return { client, pool, workflow };
  } catch (error) {
    console.error('[TigAgent] Initialization error:', error);
    throw error;
  }
}

/**
 * Run TigAgent with a query
 */
export async function runTigAgent(input: WorkflowInput): Promise<string> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[TigAgent] Processing query: "${input.query}"`);
  console.log(`[TigAgent] Project ID: ${input.projectId}`);
  console.log(`${'='.repeat(80)}\n`);

  let client: Anthropic | null = null;
  let pool: Pool | null = null;

  try {
    // Initialize
    const initialized = await initializeTigAgent();
    client = initialized.client;
    pool = initialized.pool;

    // Run contextual workflow
    const result = await initialized.workflow.run(input);

    console.log(`\n${'='.repeat(80)}`);
    console.log('[TigAgent] Query processing completed successfully');
    console.log(`${'='.repeat(80)}\n`);

    return result;
  } catch (error) {
    console.error('[TigAgent] Error running TigAgent:', error);
    
    throw error;
  } finally {
    // Cleanup
    if (pool) {
      await pool.end();
      console.log('[TigAgent] Database pool closed');
    }
  }
}

/**
 * Run TigAgent with streaming
 */
export async function runTigAgentStreaming(
  input: WorkflowInput,
  onChunk: (chunk: string) => void
): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[TigAgent] Processing query (streaming): "${input.query}"`);
  console.log(`[TigAgent] Project ID: ${input.projectId}`);
  console.log(`${'='.repeat(80)}\n`);

  let pool: Pool | null = null;

  try {
    // Initialize
    const initialized = await initializeTigAgent();
    pool = initialized.pool;

    // Run streaming workflow
    await initialized.workflow.runStreaming(input, onChunk);

    console.log(`\n${'='.repeat(80)}`);
    console.log('[TigAgent] Streaming completed successfully');
    console.log(`${'='.repeat(80)}\n`);
  } catch (error) {
    console.error('[TigAgent] Error running streaming TigAgent:', error);
    throw error;
  } finally {
    // Cleanup
    if (pool) {
      await pool.end();
      console.log('[TigAgent] Database pool closed');
    }
  }
}

/**
 * Run TigAgent with progress tracking
 */
export async function runTigAgentWithProgress(
  input: WorkflowInput,
  onProgress: (stage: string, progress: number) => void
): Promise<string> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[TigAgent] Processing query (with progress): "${input.query}"`);
  console.log(`[TigAgent] Project ID: ${input.projectId}`);
  console.log(`${'='.repeat(80)}\n`);

  let pool: Pool | null = null;

  try {
    // Initialize
    const initialized = await initializeTigAgent();
    pool = initialized.pool;

    // Run workflow with progress
    const result = await initialized.workflow.runWithProgress(input, onProgress);

    console.log(`\n${'='.repeat(80)}`);
    console.log('[TigAgent] Query processing with progress completed successfully');
    console.log(`${'='.repeat(80)}\n`);

    return result;
  } catch (error) {
    console.error('[TigAgent] Error running TigAgent with progress:', error);
    throw error;
  } finally {
    // Cleanup
    if (pool) {
      await pool.end();
      console.log('[TigAgent] Database pool closed');
    }
  }
}

/**
 * Run TigAgent with narrative synthesis
 */
export async function runTigAgentNarrative(input: WorkflowInput): Promise<string> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[TigAgent] Processing query (narrative mode): "${input.query}"`);
  console.log(`[TigAgent] Project ID: ${input.projectId}`);
  console.log(`${'='.repeat(80)}\n`);

  let pool: Pool | null = null;

  try {
    // Initialize
    const initialized = await initializeTigAgent();
    pool = initialized.pool;

    // Run narrative workflow
    const result = await initialized.workflow.runNarrative(input);

    console.log(`\n${'='.repeat(80)}`);
    console.log('[TigAgent] Narrative query processing completed successfully');
    console.log(`${'='.repeat(80)}\n`);

    return result;
  } catch (error) {
    console.error('[TigAgent] Error running narrative TigAgent:', error);
    throw error;
  } finally {
    // Cleanup
    if (pool) {
      await pool.end();
      console.log('[TigAgent] Database pool closed');
    }
  }
}

/**
 * Run TigAgent with timeline synthesis
 */
export async function runTigAgentTimeline(input: WorkflowInput): Promise<string> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[TigAgent] Processing query (timeline mode): "${input.query}"`);
  console.log(`[TigAgent] Project ID: ${input.projectId}`);
  console.log(`${'='.repeat(80)}\n`);

  let pool: Pool | null = null;

  try {
    // Initialize
    const initialized = await initializeTigAgent();
    pool = initialized.pool;

    // Run timeline workflow
    const result = await initialized.workflow.runTimeline(input);

    console.log(`\n${'='.repeat(80)}`);
    console.log('[TigAgent] Timeline query processing completed successfully');
    console.log(`${'='.repeat(80)}\n`);

    return result;
  } catch (error) {
    console.error('[TigAgent] Error running timeline TigAgent:', error);
    throw error;
  } finally {
    // Cleanup
    if (pool) {
      await pool.end();
      console.log('[TigAgent] Database pool closed');
    }
  }
}

/**
 * Validate TigAgent setup
 */
export async function validateSetup(): Promise<boolean> {
  console.log('[TigAgent] Validating setup...');

  try {
    // Check environment variables
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[TigAgent] Missing ANTHROPIC_API_KEY environment variable');
      return false;
    }

    if (!process.env.DATABASE_URL) {
      console.error('[TigAgent] Missing DATABASE_URL environment variable');
      return false;
    }

    // Test Anthropic client
    const client = createAnthropicClient();
    console.log('[TigAgent] ✓ Anthropic client created successfully');

    // Test database connection
    const pool = createDatabasePool();
    const isConnected = await testConnection(pool);
    await pool.end();

    if (!isConnected) {
      console.error('[TigAgent] Database connection test failed');
      return false;
    }

    console.log('[TigAgent] ✓ Database connection successful');
    console.log('[TigAgent] ✓ Setup validation passed');

    return true;
  } catch (error) {
    console.error('[TigAgent] Setup validation failed:', error);
    return false;
  }
}

// Export types and utilities
export * from './types';
export * from './config';
export * from './ontology';
export * from './validator';
export * from './executor';
export * from './workflow';
export * from './parallelExecutor';
export * from './agents/contextAnalyzer';
export * from './agents/multiStagePlanner';
export * from './agents/contextualSynthesizer';
// Stateful features now integrated into main workflow
// Use: workflow.run(input, sessionId) for memory-enabled synthesis

// Export main functions
export default {
  runTigAgent,
  runTigAgentStreaming,
  runTigAgentWithProgress,
  runTigAgentNarrative,
  runTigAgentTimeline,
  initializeTigAgent,
  validateSetup,
};

