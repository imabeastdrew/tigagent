import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Simplified config for Agent v2 - only what we actually need
 */

/**
 * Import shared database connection from anthropic directory
 */
let dbPool: Pool | null = null;

export function getDb(): Pool {
  if (!dbPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    dbPool = new Pool({ connectionString });
  }
  return dbPool;
}

/**
 * Create Anthropic client
 */
export function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

/**
 * Model configurations - only what Agent v2 uses
 */
export const AGENT_MODELS = {
  synthesis: 'claude-sonnet-4-5-20250929',         // Sonnet 4.5 for best reasoning
};
