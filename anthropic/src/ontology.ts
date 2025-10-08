import { TableSchema, ColumnSchema, ForeignKeySchema } from './types';

/**
 * Database Ontology - Schema definitions for TigAgent
 * Based on the PostgreSQL schema
 */

export const TABLES: Record<string, TableSchema> = {
  projects: {
    name: 'projects',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, description: 'Unique project identifier' },
      { name: 'created_at', type: 'timestamp with time zone', nullable: true, description: 'Project creation timestamp' },
      { name: 'github_repo_id', type: 'bigint', nullable: true, description: 'GitHub repository ID' },
      { name: 'repo_owner', type: 'text', nullable: true, description: 'Repository owner' },
      { name: 'repo_name', type: 'text', nullable: true, description: 'Repository name' },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
  },

  users: {
    name: 'users',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, description: 'Unique user identifier' },
      { name: 'auth_user_id', type: 'uuid', nullable: false, description: 'Authentication user ID' },
      { name: 'github_id', type: 'bigint', nullable: false, description: 'GitHub user ID' },
      { name: 'github_username', type: 'text', nullable: false, description: 'GitHub username' },
      { name: 'full_name', type: 'text', nullable: true, description: 'User full name' },
      { name: 'email', type: 'text', nullable: true, description: 'User email (restricted)' },
      { name: 'company', type: 'text', nullable: true, description: 'User company' },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false, description: 'User creation timestamp' },
      { name: 'updated_at', type: 'timestamp with time zone', nullable: false, description: 'User last update timestamp' },
      { name: 'onboarding_completed', type: 'boolean', nullable: false, description: 'Onboarding status' },
      { name: 'chats_saved', type: 'integer', nullable: false, description: 'Number of chats saved' },
      { name: 'show_tool_bubbles_beta', type: 'boolean', nullable: false, description: 'Tool bubbles beta flag' },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
  },

  conversations: {
    name: 'conversations',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, description: 'Unique conversation identifier' },
      { name: 'composer_id', type: 'text', nullable: true, description: 'Composer session ID' },
      { name: 'title', type: 'text', nullable: true, description: 'Conversation title' },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false, description: 'Conversation creation timestamp' },
      { name: 'project_id', type: 'uuid', nullable: false, description: 'Associated project ID' },
      { name: 'platform', type: 'text', nullable: true, description: 'Platform (cursor, claude_code, unknown)' },
    ],
    primaryKey: ['id'],
    foreignKeys: [
      { column: 'project_id', referencesTable: 'projects', referencesColumn: 'id' },
    ],
  },

  interactions: {
    name: 'interactions',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, description: 'Unique interaction identifier' },
      { name: 'conversation_id', type: 'uuid', nullable: true, description: 'Associated conversation ID' },
      { name: 'prompt_text', type: 'text', nullable: false, description: 'User prompt text' },
      { name: 'response_text', type: 'text', nullable: true, description: 'AI response text' },
      { name: 'prompt_ts', type: 'timestamp with time zone', nullable: true, description: 'Prompt timestamp' },
      { name: 'request_id', type: 'text', nullable: true, description: 'Request identifier' },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false, description: 'Interaction creation timestamp' },
      { name: 'response_bubbles', type: 'jsonb', nullable: true, description: 'Response bubbles data' },
      { name: 'model', type: 'text', nullable: true, description: 'AI model used' },
      { name: 'author', type: 'text', nullable: true, description: 'Interaction author' },
    ],
    primaryKey: ['id'],
    foreignKeys: [
      { column: 'conversation_id', referencesTable: 'conversations', referencesColumn: 'id' },
    ],
  },

  interaction_diffs: {
    name: 'interaction_diffs',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, description: 'Unique diff identifier' },
      { name: 'interaction_id', type: 'uuid', nullable: false, description: 'Associated interaction ID' },
      { name: 'file_path', type: 'text', nullable: false, description: 'File path for the diff' },
      { name: 'diff_chunks', type: 'jsonb', nullable: false, description: 'Diff chunks data' },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false, description: 'Diff creation timestamp' },
    ],
    primaryKey: ['id'],
    foreignKeys: [
      { column: 'interaction_id', referencesTable: 'interactions', referencesColumn: 'id' },
    ],
  },

  commits: {
    name: 'commits',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, description: 'Unique commit identifier' },
      { name: 'hash', type: 'text', nullable: false, description: 'Commit hash' },
      { name: 'message', type: 'text', nullable: true, description: 'Commit message' },
      { name: 'committed_at', type: 'timestamp with time zone', nullable: true, description: 'Commit timestamp' },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false, description: 'Record creation timestamp' },
      { name: 'project_id', type: 'uuid', nullable: false, description: 'Associated project ID' },
      { name: 'branch', type: 'text', nullable: true, description: 'Branch name' },
      { name: 'author', type: 'text', nullable: true, description: 'Commit author' },
    ],
    primaryKey: ['id'],
    foreignKeys: [
      { column: 'project_id', referencesTable: 'projects', referencesColumn: 'id' },
    ],
  },

  commit_interactions: {
    name: 'commit_interactions',
    columns: [
      { name: 'commit_id', type: 'uuid', nullable: false, description: 'Associated commit ID' },
      { name: 'interaction_id', type: 'uuid', nullable: false, description: 'Associated interaction ID' },
    ],
    primaryKey: ['commit_id', 'interaction_id'],
    foreignKeys: [
      { column: 'commit_id', referencesTable: 'commits', referencesColumn: 'id' },
      { column: 'interaction_id', referencesTable: 'interactions', referencesColumn: 'id' },
    ],
  },

  pull_requests: {
    name: 'pull_requests',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, description: 'Unique pull request identifier' },
      { name: 'project_id', type: 'uuid', nullable: false, description: 'Associated project ID' },
      { name: 'pr_number', type: 'integer', nullable: false, description: 'Pull request number' },
      { name: 'title', type: 'text', nullable: false, description: 'Pull request title' },
      { name: 'description', type: 'text', nullable: true, description: 'Pull request description' },
      { name: 'author', type: 'text', nullable: true, description: 'Pull request author' },
      { name: 'head_branch', type: 'text', nullable: false, description: 'Head branch name' },
      { name: 'base_branch', type: 'text', nullable: false, description: 'Base branch name' },
      { name: 'head_sha', type: 'text', nullable: true, description: 'Head commit SHA' },
      { name: 'state', type: 'text', nullable: false, description: 'Pull request state (open, closed, merged)' },
      { name: 'github_url', type: 'text', nullable: false, description: 'GitHub URL' },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false, description: 'Pull request creation timestamp' },
      { name: 'updated_at', type: 'timestamp with time zone', nullable: false, description: 'Pull request last update timestamp' },
      { name: 'merged_at', type: 'timestamp with time zone', nullable: true, description: 'Pull request merge timestamp' },
    ],
    primaryKey: ['id'],
    foreignKeys: [
      { column: 'project_id', referencesTable: 'projects', referencesColumn: 'id' },
    ],
  },

  api_keys: {
    name: 'api_keys',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, description: 'Unique API key identifier' },
      { name: 'key_hash', type: 'text', nullable: false, description: 'API key hash' },
      { name: 'key_prefix', type: 'text', nullable: false, description: 'API key prefix' },
      { name: 'user_id', type: 'uuid', nullable: true, description: 'Associated user ID' },
      { name: 'description', type: 'text', nullable: true, description: 'API key description' },
      { name: 'created_at', type: 'timestamp with time zone', nullable: true, description: 'API key creation timestamp' },
      { name: 'last_used_at', type: 'timestamp with time zone', nullable: true, description: 'API key last used timestamp' },
      { name: 'is_active', type: 'boolean', nullable: true, description: 'API key active status' },
      { name: 'rate_limit_per_minute', type: 'integer', nullable: true, description: 'Rate limit per minute' },
    ],
    primaryKey: ['id'],
    foreignKeys: [
      { column: 'user_id', referencesTable: 'users', referencesColumn: 'id' },
    ],
  },

  api_key_usage: {
    name: 'api_key_usage',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, description: 'Unique usage record identifier' },
      { name: 'api_key_id', type: 'uuid', nullable: true, description: 'Associated API key ID' },
      { name: 'timestamp', type: 'timestamp with time zone', nullable: true, description: 'Usage timestamp' },
      { name: 'endpoint', type: 'text', nullable: true, description: 'API endpoint accessed' },
    ],
    primaryKey: ['id'],
    foreignKeys: [
      { column: 'api_key_id', referencesTable: 'api_keys', referencesColumn: 'id' },
    ],
  },

  interaction_embeddings: {
    name: 'interaction_embeddings',
    columns: [
      { name: 'embedding_id', type: 'uuid', nullable: false, description: 'Unique embedding identifier' },
      { name: 'interaction_id', type: 'uuid', nullable: false, description: 'Associated interaction ID' },
      { name: 'type', type: 'text', nullable: false, description: 'Embedding type (prompt_response, full_code_diff, chunked_code_diff)' },
      { name: 'chunk_id', type: 'integer', nullable: true, description: 'Chunk ID for chunked embeddings' },
      { name: 'embedding', type: 'vector', nullable: false, description: 'Vector embedding' },
    ],
    primaryKey: ['embedding_id'],
    foreignKeys: [
      { column: 'interaction_id', referencesTable: 'interactions', referencesColumn: 'id' },
    ],
  },
};

/**
 * Domain to Table Mapping
 */
export const DOMAIN_TO_TABLES: Record<string, string[]> = {
  commit: ['commits', 'commit_interactions'],
  interaction: ['interactions', 'interaction_diffs', 'commit_interactions'],
  conversation: ['conversations', 'interactions'],
  diff: ['interaction_diffs'],
  user: ['users'],
  project: ['projects'],
  pull_request: ['pull_requests'],
};

/**
 * Common Join Patterns
 */
export const JOIN_PATTERNS = {
  conversation_to_interaction: {
    from: 'conversations',
    to: 'interactions',
    condition: 'conversations.id = interactions.conversation_id',
  },
  interaction_to_diff: {
    from: 'interactions',
    to: 'interaction_diffs',
    condition: 'interactions.id = interaction_diffs.interaction_id',
  },
  commit_to_interaction: {
    from: 'commits',
    to: 'interactions',
    via: 'commit_interactions',
    condition: 'commits.id = commit_interactions.commit_id AND commit_interactions.interaction_id = interactions.id',
  },
  conversation_to_project: {
    from: 'conversations',
    to: 'projects',
    condition: 'conversations.project_id = projects.id',
  },
  commit_to_project: {
    from: 'commits',
    to: 'projects',
    condition: 'commits.project_id = projects.id',
  },
};

/**
 * Get table schema by name
 */
export function getTableSchema(tableName: string): TableSchema | undefined {
  return TABLES[tableName];
}

/**
 * Get columns for a table
 */
export function getTableColumns(tableName: string): ColumnSchema[] {
  const table = TABLES[tableName];
  return table ? table.columns : [];
}

/**
 * Get foreign keys for a table
 */
export function getTableForeignKeys(tableName: string): ForeignKeySchema[] {
  const table = TABLES[tableName];
  return table ? table.foreignKeys : [];
}

/**
 * Check if a column is restricted
 */
export function isRestrictedColumn(tableName: string, columnName: string): boolean {
  const restrictedColumns = ['users.email', 'users.auth_user_id'];
  const fullColumnName = `${tableName}.${columnName}`;
  return restrictedColumns.includes(fullColumnName);
}

/**
 * Get tables for a domain
 */
export function getTablesForDomain(domain: string): string[] {
  return DOMAIN_TO_TABLES[domain] || [];
}

/**
 * Entity mapping: conceptual entities to database entities
 */
export const ENTITY_MAPPING: Record<string, string[]> = {
  'timeline function': ['interaction_diffs', 'interactions'],
  'page.tsx': ['interaction_diffs', 'commits'],
  'file': ['interaction_diffs'],
  'conversation': ['interactions', 'conversations'],
  'commit': ['commits'],
  'user': ['users'],
  'author': ['users'],
  'discussion': ['interactions'],
  'chat': ['interactions', 'conversations'],
  'diff': ['interaction_diffs'],
  'code change': ['interaction_diffs', 'commits'],
  'pull request': ['pull_requests'],
  'pr': ['pull_requests'],
};

/**
 * Get database entities for a conceptual entity
 */
export function mapConceptualEntity(conceptualEntity: string): string[] {
  const lowerEntity = conceptualEntity.toLowerCase();
  return ENTITY_MAPPING[lowerEntity] || [];
}

