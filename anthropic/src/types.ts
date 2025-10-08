import { Pool } from 'pg';

/**
 * Main input structure for TigAgent workflow
 */
export interface WorkflowInput {
  query: string;
  projectId: string;
  sessionId?: string; // For session management
}

/**
 * Context Analysis Output
 */
export interface ContextAnalysis {
  primaryIntent: {
    domain: string;
    query: string;
    entities: string[];
  };
  contextualIntents: ContextualIntent[];
  connectionStrategy: ConnectionStrategy;
  explanation: string;
}

export interface ContextualIntent {
  domain: string;
  query: string;
  connectionType: 'temporal' | 'semantic' | 'commit' | 'file' | 'author';
  entities: string[];
  priority: 1 | 2 | 3;
}

export interface ConnectionStrategy {
  type: 'time_based' | 'commit_based' | 'semantic' | 'file_based' | 'author_based';
  parameters: Record<string, any>;
}

/**
 * Query Planning Structures
 */
export interface MultiStageQueryPlan {
  primaryPlan: QueryPlan;
  contextualPlans: QueryPlan[];
  connectionPlan?: QueryPlan;
  synthesisStrategy: SynthesisStrategy;
  explanation: string;
}

export interface QueryPlan {
  domain: string;
  intent: string;
  entities: string[];
  filters?: QueryFilters; // Specific filters extracted from the query
  sql?: string; // Generated after validation
  estimatedRows?: number;
  priority?: 1 | 2 | 3;
}

export interface QueryFilters {
  author?: string; // Filter by commit author or interaction author
  date?: string; // Specific date (YYYY-MM-DD)
  dateRange?: { start?: string; end?: string }; // Date range
  fileName?: string; // Filter by file name
  branch?: string; // Filter by branch name
  commitHash?: string; // Specific commit hash
  conversationId?: string; // Specific conversation
  searchText?: string; // Text search in messages
  limit?: number; // Result limit (if specified in query)
}

export interface SynthesisStrategy {
  combineResults: boolean;
  highlightConnections: boolean;
  temporalOrdering: boolean;
  showContextualData: boolean;
}

/**
 * Query Execution Results
 */
export interface QueryResult {
  domain: string;
  intent: string;
  data: any[];
  rowCount: number;
  executionTime: number;
  error?: string;
  sql?: string; // The generated SQL query (for debugging)
}

export interface MultiStageQueryResults {
  primaryResult: QueryResult;
  contextualResults: QueryResult[];
  connectionResult?: QueryResult;
  totalExecutionTime: number;
  errors: string[];
}

/**
 * Database Schema Types (from ontology)
 */
export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  primaryKey: string[];
  foreignKeys: ForeignKeySchema[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
}

export interface ForeignKeySchema {
  column: string;
  referencesTable: string;
  referencesColumn: string;
}

/**
 * Validation and Security
 */
export interface ValidationResult {
  isValid: boolean;
  sql?: string;
  errors: string[];
  warnings: string[];
}

export interface SecurityContext {
  allowedOperations: string[];
  maxRows: number;
  requiredProjectScope: boolean;
  restrictedColumns: string[];
  dangerousKeywords: string[];
}

/**
 * Agent Configuration Types
 */
export interface AgentConfig {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  allowedTools?: string[];
  temperature?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  execute: (input: any) => Promise<any>;
}

/**
 * Session Management
 */
export interface SessionContext {
  sessionId: string;
  conversationHistory: ConversationEntry[];
  userPreferences?: UserPreferences;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  queryResults?: any;
}

export interface UserPreferences {
  preferredDomains?: string[];
  defaultTimeRange?: string;
  detailLevel?: 'brief' | 'detailed' | 'comprehensive';
}

/**
 * Subagent Types
 */
export interface SubagentConfig {
  role: string;
  expertise: string[];
  systemPrompt: string;
  tools: string[];
  execute: (input: any) => Promise<any>;
}

/**
 * Parallel Execution Types
 */
export interface ParallelExecutionResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  executionTime: number;
}

/**
 * Tool Permission Types
 */
export interface ToolPermissions {
  allowedTools: string[];
  disallowedTools: string[];
  permissionMode: 'acceptEdits' | 'requireApproval' | 'denyAll';
}

export interface DatabasePermissions {
  allowed_operations: string[];
  max_rows: number;
  required_project_scope: boolean;
  restricted_columns: string[];
  dangerous_keywords: string[];
}

/**
 * Export types for external use
 */
export type ConnectionType = 'temporal' | 'semantic' | 'commit' | 'file' | 'author';
export type ConnectionStrategyType = 'time_based' | 'commit_based' | 'semantic' | 'file_based' | 'author_based';
export type Priority = 1 | 2 | 3;
export type Domain = 'commit' | 'interaction' | 'conversation' | 'diff' | 'user' | 'project';

