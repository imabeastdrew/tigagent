/**
 * Unit67 - Multi-Agent Exploration System
 * 
 * Deep exploration of codebase context using parallel specialized agents.
 */

// Legacy orchestrator
export { explore, getExplorationSession } from './orchestrator';

// New iterative orchestrator
export { exploreIterative, getIterativeExplorationSession } from './iterativeOrchestrator';

export type { 
  ExplorationEvent, 
  ExplorationResult,
  DiscoveryOutput,
  ThreadFollowingOutput,
  KnowledgeMiningOutput,
  TemporalContextOutput,
  ConversationThread,
  CommitContext,
  FileHistory,
  KnowledgeAnalysis,
  TimelineData,
  // New iterative architecture types
  SearchRequest,
  Lead,
  Finding,
  JudgeScore,
  WorkItem,
  InvestigationResult,
  Interaction
} from './types';

