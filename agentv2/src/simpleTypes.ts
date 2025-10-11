/**
 * Simplified types for Agent v2 - only what we actually need
 */

/**
 * Database interaction record
 */
export interface Interaction {
  id: string;
  conversation_id: string;
  prompt_text: string;
  response_text: string;
  created_at: string;
  author: string;
  project_id: string;
  prompt_ts?: string; // For compatibility
  conversation_title?: string; // For compatibility
  platform?: string; // For compatibility
}

/**
 * Simple search request for Agent v2
 */
export interface SearchRequest {
  query: string;
  iteration: number;
  source: string;
  lead_type: 'initial' | 'commit_reference' | 'entity_reference' | 'person_reference' | 
             'date_reference' | 'file_reference' | 'conversation_reference';
  context?: string;
  filters?: {
    commit_hash?: string;
    author?: string;
    file_path?: string;
    date?: string;
  };
  project_id?: string;
}

/**
 * SQL Agent interfaces
 */
export interface SQLQueryRequest {
  query: string;
  project_id?: string;
  context?: string;
  max_iterations?: number;
}

export interface SQLQueryResult {
  success: boolean;
  data?: any[];
  error?: string;
  iterations: number;
  final_query?: string;
  explanation?: string;
}

/**
 * SQL Discovery result
 */
export interface SQLDiscoveryResult {
  interactions: Interaction[];
  conversations: Array<{
    id: string;
    title: string;
    created_at: string;
    project_id: string;
  }>;
  commits: Array<{
    id: string;
    hash: string;
    message: string;
    author: string;
    committed_at: string;
  }>;
  files: Array<{
    file_path: string;
    interaction_count: number;
  }>;
  people: Array<{
    author: string;
    interaction_count: number;
    commit_count: number;
  }>;
  summary: string;
}

/**
 * Agent v2 main interfaces
 */
export interface AgentV2Config {
  projectId: string;
  maxIterations: number;
  enableSQLDiscovery: boolean;
  enableTraditionalDiscovery: boolean;
  debugMode: boolean;
}

export interface Finding {
  type: 'decision' | 'problem' | 'solution' | 'technical_detail' | 'context';
  summary: string;
  details: string;
  entities: string[];
  relevance_to_query: string;
  interaction_id: string;
  author: string;
  timestamp: string;
  confidence: number;
}

export interface Lead {
  type: 'commit' | 'entity' | 'person' | 'temporal' | 'conversation' | 'file';
  value: string;
  search_query: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  context?: string;
}

export interface AgentV2Result {
  success: boolean;
  findings: Finding[];
  leads: Lead[];
  sqlResults: SQLDiscoveryResult;
  summary: string;
  iterations: number;
  errors: string[];
}
