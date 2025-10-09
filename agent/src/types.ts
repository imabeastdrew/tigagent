/**
 * Unit67 Type Definitions
 */

export interface ExplorationEvent {
  event_id?: string;
  agent: 'discovery' | 'thread_following' | 'knowledge_mining' | 'temporal_context' | 'synthesis';
  phase: 'discovery' | 'parallel' | 'synthesis';
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

