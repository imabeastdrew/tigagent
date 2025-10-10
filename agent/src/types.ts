/**
 * Unit67 Type Definitions
 */

export interface ExplorationEvent {
  event_id?: string;
  agent: string; // Changed to string to support dynamic agent names (worker_1, judge_2, etc.)
  phase: 'discovery' | 'parallel' | 'synthesis' | 'search' | 'judging' | 'investigation'; // Support both old and new phases during migration
  action: string;
  output: Record<string, any>;
  storage?: Record<string, string>;
  references?: string[];
  timestamp: number;
}

export interface DiscoveryOutput {
  interaction_ids: string[];
  conversation_ids: string[];
  commit_hashes: string[];
  file_paths: string[];
  people: string[];
  counts: {
    interactions: number;
    conversations: number;
    commits: number;
    files: number;
  };
}

export interface ThreadFollowingOutput {
  threads_found: number;
  commits_traced: number;
  files_traced: number;
  summary: string;
}

export interface KnowledgeMiningOutput {
  decisions_found: number;
  warnings_found: number;
  constraints_found: number;
  patterns_found: number;
  summary: string;
}

export interface TemporalContextOutput {
  date_range: string;
  activity_spikes: string[];
  change_frequency: string;
  urgency_level: 'low' | 'moderate' | 'high';
  summary: string;
}

export interface ExplorationResult {
  brief: string;
  sessionId: string;
  streamUrl: string;
  auditTrail: ExplorationEvent[];
}

export interface ConversationThread {
  conversation_id: string;
  title: string;
  created_at: Date;
  thread: Array<{
    id: string;
    prompt: string;
    response: string;
    author: string;
    timestamp: Date;
  }>;
}

export interface CommitContext {
  hash: string;
  message: string;
  author: string;
  committed_at: Date;
  related_interactions: Array<{
    interaction_id: string;
    prompt: string;
    response: string;
  }>;
}

export interface FileHistory {
  file_path: string;
  change_history: Array<{
    interaction_id: string;
    diff: any;
    author: string;
    timestamp: Date;
    conversation_id: string;
  }>;
}

export interface KnowledgeAnalysis {
  decisions: Array<{
    what: string;
    when: string;
    who: string[];
    why: string;
    alternatives?: string[];
  }>;
  warnings: Array<{
    severity: 'info' | 'warning' | 'critical';
    message: string;
    source: string;
    context: string;
  }>;
  constraints: Array<{
    type: string;
    description: string;
    context: string;
  }>;
  patterns: Array<{
    type: 'bug' | 'discussion' | 'refactor';
    description: string;
    occurrences: number;
    examples: string[];
  }>;
}

export interface TimelineData {
  timeline: Array<{
    date: string;
    interaction_count: number;
    authors_active: string[];
    interaction_ids: string[];
  }>;
  spikes: Array<{
    date: string;
    interaction_count: number;
  }>;
  commitTimeline: Array<{
    date: string;
    commit_count: number;
    commit_messages: string[];
  }>;
  metrics: {
    firstEvent: Date;
    lastEvent: Date;
    daySpan: number;
    changeFrequency: number;
    urgency: 'low' | 'moderate' | 'high';
  };
}

// ============================================================================
// New Iterative Architecture Types
// ============================================================================

/**
 * Search request sent to Discovery service
 */
export interface SearchRequest {
  query: string;
  iteration: number;
  source: string; // event_id that triggered this search, or 'user_query' for initial
  lead_type: 'initial' | 'commit_reference' | 'entity_reference' | 'person_reference' | 
             'date_reference' | 'file_reference' | 'conversation_reference';
  context?: string;
  filters?: {
    commit_hash?: string;
    author?: string;
    file_path?: string;
    date?: string;
  };
}

/**
 * Lead discovered by an investigator (something to search for)
 */
export interface Lead {
  type: 'commit' | 'entity' | 'person' | 'temporal' | 'conversation' | 'file';
  value: string; // The specific value (commit hash, entity name, person name, etc.)
  search_query: string; // What to search for in Discovery
  reason: string; // Why we need to follow this lead
  priority: 'high' | 'medium' | 'low';
  context?: string; // Additional context about the lead
}

/**
 * Finding extracted by an investigator
 */
export interface Finding {
  type: 'decision' | 'problem' | 'solution' | 'technical_detail' | 'context';
  summary: string; // One sentence summary
  details: string; // Full explanation with quotes
  entities: string[]; // Entities mentioned (SessionManager, auth, etc.)
  relevance_to_query: string; // How this helps answer the query
  interaction_id: string; // Source interaction
  author: string;
  timestamp: string;
  confidence: number; // 0-1 scale
}

/**
 * Score from a judge agent
 */
export interface JudgeScore {
  interaction_id: string;
  score: number; // 0-10
  reason: string; // Why this score
}

/**
 * Work item in investigation queue
 */
export interface WorkItem {
  interaction_id: string;
  conversation_id: string;
  priority: number; // Score from judge
  source: string; // 'initial_embedding' or 'discovered_reference'
  context?: string; // Why this was added to queue
  claimed?: boolean;
  claimed_by?: string;
  iteration: number;
}

/**
 * Analysis result from investigator
 */
export interface InvestigationResult {
  findings: Finding[];
  leads: Lead[];
  completeness: {
    score: number; // 0-1, how complete is our understanding
    missing: string[]; // What key questions remain
  };
}

/**
 * Interaction data from semantic search
 */
export interface Interaction {
  id: string;
  conversation_id: string;
  prompt_text: string;
  response_text: string;
  author: string;
  prompt_ts: string;
  conversation_title: string;
  platform: string;
  similarity?: number;
}

