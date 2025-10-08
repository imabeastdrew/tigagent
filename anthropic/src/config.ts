import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { 
  AgentConfig, 
  ToolDefinition, 
  ToolPermissions, 
  DatabasePermissions 
} from './types';

/**
 * Anthropic Client Configuration
 */
export function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  return new Anthropic({
    apiKey,
  });
}

/**
 * Model Configuration
 * Updated to use Claude 4 models (2025 release)
 */
export const MODEL_CONFIG = {
  contextAnalyzerModel: 'claude-3-5-haiku-20241022', // Fast analyzer
  multiStagePlannerModel: 'claude-sonnet-4-20250514', // Balanced planner
  contextualSynthesizerModel: 'claude-sonnet-4-5-20250929', // Best synthesizer
};

/**
 * Agent Configurations
 */
export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  contextAnalyzer: {
    model: 'claude-3-5-haiku-20241022',
    maxTokens: 4000,
    temperature: 0.3,
    systemPrompt: `You are a context analyzer for developer queries. Your role is to:

1. Identify the primary intent and domain of the user's query
2. Discover related contextual information across different domains
3. Identify temporal, semantic, and causal relationships
4. Prioritize contextual intents (High/Medium/Low)
5. Choose appropriate connection strategies

When analyzing queries:
- Look for temporal relationships (what happened around the same time?)
- Identify semantic relationships (related concepts, functions, files)
- Find causal relationships (what led to this, what resulted?)
- Discover collaborative relationships (who else was involved?)
- Follow data chains (Diffs → Interactions → Conversations)

Available domains: commit, interaction, conversation, diff, user, project

Output your analysis as structured JSON matching the ContextAnalysis interface.`,
    allowedTools: ['analyze_patterns'],
  },
  
  planner: {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4000,
    temperature: 0.2,
    systemPrompt: `You are a query planner for database operations. Your role is to:

1. Convert conceptual entities to database entities
2. Create coordinated, complementary query plans
3. Define synthesis strategies
4. Ensure all plans use the same project_id filter

Entity Mapping Guide:
- "timeline function" → interaction_diffs (code changes), interactions (discussions)
- "page.tsx" → interaction_diffs (file changes), commits (commit messages)
- "file" → interaction_diffs
- "conversation" → interactions, conversations
- "commit" → commits
- "user/author" → users
- "discussion/chat" → interactions, conversations

Database Schema:
- conversations: id, composer_id, title, created_at, project_id, platform
- interactions: id, conversation_id, prompt_text, response_text, prompt_ts, model, author
- interaction_diffs: id, interaction_id, file_path, diff_chunks, created_at
- commits: id, hash, message, committed_at, created_at, project_id, branch, author
- commit_interactions: commit_id, interaction_id
- users: id, github_username, full_name, email
- projects: id, github_repo_id, repo_owner, repo_name

Planning Rules:
- All plans must use the same project_id filter
- Time windows should be coordinated
- Joins should be consistent across plans
- Column selections should be complementary

Output your plan as structured JSON matching the MultiStageQueryPlan interface.`,
    allowedTools: ['validate_query'],
  },
  
  synthesizer: {
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4000,
    temperature: 0.7,
    systemPrompt: `You are a query answering result synthesizer. Your role is to:

1. Read the user's query carefully
2. Use the provided data to answer their question directly
3. If a question about conversations, be more specific about the exchanges between user and AI.
3. Follow their formatting instructions exactly (e.g., "5 sentences" means exactly 5 sentences)
4. Be concise and focused - only answer what was asked
5. Do not add extra sections or structure unless specifically requested

Key principles:
- If they ask for a summary, be brief and concise
- If they ask for details, be comprehensive
- If they specify a number of sentences/items, provide exactly that number
- If they specify a format (bullets, paragraphs, lists), use that format
- Use information from both primary and contextual data to provide complete answers
- Be direct and natural - answer like you're talking to a developer colleague`,
    allowedTools: ['analyze_patterns'],
  },
};

/**
 * Tool Permissions Configuration
 */
export const TOOL_PERMISSIONS: ToolPermissions = {
  allowedTools: ['execute_safe_query', 'analyze_patterns', 'validate_query'],
  disallowedTools: ['WebFetch', 'WebSearch'],
  permissionMode: 'acceptEdits',
};

/**
 * Database Security Configuration
 */
export const DATABASE_PERMISSIONS: DatabasePermissions = {
  allowed_operations: ['SELECT'],
  max_rows: 200,
  required_project_scope: true,
  restricted_columns: ['users.email', 'users.auth_user_id'],
  dangerous_keywords: ['DROP', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE'],
};

/**
 * Tool-Specific Permissions
 */
export const TOOL_SPECIFIC_PERMISSIONS = {
  execute_safe_query: {
    require_validation: true,
    max_execution_time: 30000,
    require_project_scope: true,
  },
  analyze_patterns: {
    allow_cross_domain: true,
    max_data_size: 10000,
  },
  validate_query: {
    require_ontology_check: true,
    allow_custom_filters: false,
  },
};

/**
 * Database Connection Configuration
 */
export function createDatabasePool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  return new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

/**
 * System Prompt Presets
 */
export const SYSTEM_PROMPTS = {
  contextAnalyzer: {
    type: 'preset' as const,
    preset: 'claude_code' as const,
    customInstructions: 'Focus on context discovery and relationship analysis for developer queries.',
  },
  planner: {
    type: 'preset' as const,
    preset: 'claude_code' as const,
    customInstructions: 'Focus on query planning and entity mapping for database operations.',
  },
  synthesizer: {
    type: 'preset' as const,
    preset: 'claude_code' as const,
    customInstructions: 'Focus on narrative synthesis and connection highlighting for developer insights.',
  },
};

/**
 * Query Options for Different Agent Types
 */
export const QUERY_OPTIONS = {
  contextAnalysis: {
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 4000,
    temperature: 0.3,
  },
  planning: {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    temperature: 0.2,
  },
  synthesis: {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    temperature: 0.7,
  },
};

/**
 * Session Configuration
 */
export const SESSION_CONFIG = {
  maxConversationHistory: 10, // Keep last 10 interactions
  sessionTimeoutMs: 3600000, // 1 hour
  enableSessionPersistence: true,
};

/**
 * Retry Configuration
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Performance Configuration
 */
export const PERFORMANCE_CONFIG = {
  parallelExecutionEnabled: true,
  maxConcurrentQueries: 5,
  queryTimeoutMs: 30000,
};

