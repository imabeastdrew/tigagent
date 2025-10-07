import { Pool } from "pg";
import dotenv from "dotenv";
import { runWorkflow } from "./workflow.js";
import { WorkflowInput, AgentResponse } from "./types.js";

// Load environment variables
dotenv.config();

/**
 * Initialize database connection pool
 */
let dbPool: Pool | null = null;

function getDbPool(): Pool {
  if (!dbPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    
    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    });
  }
  
  return dbPool;
}

/**
 * Main entry point for the Tig Agent SDK
 * 
 * @example
 * ```typescript
 * import { runTigAgent } from './index.js';
 * 
 * const result = await runTigAgent({
 *   input_as_text: "Show me recent commits",
 *   project_id: "your-project-id"
 * });
 * 
 * console.log(result);
 * ```
 */
export async function runTigAgent(input: WorkflowInput): Promise<string> {
  const pool = getDbPool();
  return await runWorkflow(input, pool);
}

/**
 * Close database connections (call this when shutting down)
 */
export async function closeConnections(): Promise<void> {
  if (dbPool) {
    await dbPool.end();
    dbPool = null;
  }
}

// Export types for external use
export type { WorkflowInput, AgentResponse, Domain, QueryPlan, ExecutionResult } from "./types.js";

// Export the main workflow function for advanced usage
export { runWorkflow } from "./workflow.js";

// Export individual agents for testing or custom workflows
export { routerAgent } from "./agents/routerAgent.js";
export { 
  commitPlannerAgent, 
  interactionPlannerAgent, 
  conversationPlannerAgent, 
  projectPlannerAgent, 
  userPlannerAgent 
} from "./agents/plannerAgents.js";
export { synthesizerAgent } from "./agents/synthesizerAgent.js";

// Export utilities
export { validateAndBuildSQL } from "./validator.js";
export { executeQuery, executeQueryWithParams } from "./executor.js";
export { 
  guardrailsHasTripwire, 
  getGuardrailSafeText, 
  buildGuardrailFailOutput 
} from "./guardrailUtils.js";

// Export configuration
export { client, guardrailsConfig, guardrailsContext } from "./config.js";

// Export ontology helpers
export { 
  getEntityColumns, 
  isValidJoin, 
  isRestrictedColumn, 
  getForeignKeyRelationship,
  ONTOLOGY_TEXT 
} from "./ontology.js";
