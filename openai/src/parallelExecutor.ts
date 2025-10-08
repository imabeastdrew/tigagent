import { Pool } from "pg";
import { MultiStageQueryPlan, QueryPlan } from "./types.js";
import { validateAndBuildSQL } from "./validator.js";
import { executeQueryWithParams } from "./executor.js";

/**
 * Result from executing a single query plan
 */
export interface QueryExecutionResult {
  plan: QueryPlan;
  result: {
    success: boolean;
    data?: any[];
    error?: string;
    executionTimeMs: number;
    rowCount: number;
  };
  metadata: {
    queryType: 'primary' | 'contextual' | 'connection';
    domain: string;
    entities: string[];
  };
}

/**
 * Result from executing all queries in a multi-stage plan
 */
export interface MultiStageExecutionResult {
  primaryResult: QueryExecutionResult;
  contextualResults: QueryExecutionResult[];
  connectionResult?: QueryExecutionResult;
  totalExecutionTimeMs: number;
  success: boolean;
  errors: string[];
}

/**
 * Execute all queries in a multi-stage plan in parallel
 */
export async function executeMultiStageQueries(
  multiStagePlan: MultiStageQueryPlan,
  projectId: string,
  pool: Pool
): Promise<MultiStageExecutionResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  // Prepare all query plans for execution
  const queryPromises: Promise<QueryExecutionResult>[] = [];
  
  // Primary query
  const primaryPromise = executeSingleQuery(
    multiStagePlan.primaryPlan,
    projectId,
    pool,
    'primary',
    multiStagePlan.primaryPlan.entities[0] || 'unknown'
  );
  queryPromises.push(primaryPromise);
  
  // Contextual queries
  const contextualPromises = multiStagePlan.contextualPlans.map((plan, index) =>
    executeSingleQuery(
      plan,
      projectId,
      pool,
      'contextual',
      plan.entities[0] || 'unknown'
    )
  );
  queryPromises.push(...contextualPromises);
  
  // Connection query (if present)
  if (multiStagePlan.connectionPlan) {
    const connectionPromise = executeSingleQuery(
      multiStagePlan.connectionPlan,
      projectId,
      pool,
      'connection',
      'connection'
    );
    queryPromises.push(connectionPromise);
  }
  
  // Execute all queries in parallel
  const results = await Promise.allSettled(queryPromises);
  
  // Process results
  const primaryResult = results[0].status === 'fulfilled' ? results[0].value : null;
  const contextualResults: QueryExecutionResult[] = [];
  const lastResult = results[results.length - 1];
  const connectionResult = multiStagePlan.connectionPlan && 
    lastResult?.status === 'fulfilled' ? 
    lastResult.value : undefined;
  
  // Process contextual results
  for (let i = 1; i < results.length - (multiStagePlan.connectionPlan ? 1 : 0); i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      contextualResults.push(result.value);
    } else {
      errors.push(`Contextual query ${i} failed: ${result.reason}`);
    }
  }
  
  // Check for primary query failure
  if (!primaryResult) {
    const primaryResultSettled = results[0];
    errors.push(`Primary query failed: ${primaryResultSettled.status === 'rejected' ? primaryResultSettled.reason : 'Unknown error'}`);
  }
  
  const totalExecutionTimeMs = Date.now() - startTime;
  
  return {
    primaryResult: primaryResult!,
    contextualResults,
    connectionResult,
    totalExecutionTimeMs,
    success: errors.length === 0,
    errors
  };
}

/**
 * Execute a single query plan
 */
async function executeSingleQuery(
  plan: QueryPlan,
  projectId: string,
  pool: Pool,
  queryType: 'primary' | 'contextual' | 'connection',
  domain: string
): Promise<QueryExecutionResult> {
  const startTime = Date.now();
  
  try {
    // Validate and build SQL
    console.log(`Executing ${queryType} query for domain: ${domain}`);
    console.log(`Plan entities: ${plan.entities.join(', ')}`);
    console.log(`Plan filters: ${plan.filters.map(f => `${f.column} ${f.operator} ${f.value}`).join(', ')}`);
    
    const validationResult = validateAndBuildSQL(plan, projectId);
    
    if (validationResult.safeSQL) {
      console.log(`Generated SQL: ${validationResult.safeSQL.substring(0, 200)}...`);
    }
    
    if (!validationResult.isValid) {
      return {
        plan,
        result: {
          success: false,
          error: `Validation failed: ${validationResult.issues?.join(', ') || 'Unknown validation error'}`,
          executionTimeMs: Date.now() - startTime,
          rowCount: 0
        },
        metadata: {
          queryType,
          domain,
          entities: plan.entities
        }
      };
    }
    
    // Execute query
    const executionResult = await executeQueryWithParams(
      validationResult.safeSQL || '',
      [],
      pool
    );
    
    return {
      plan,
      result: {
        success: true,
        data: executionResult.rows,
        executionTimeMs: executionResult.executionTimeMs,
        rowCount: executionResult.rowCount
      },
      metadata: {
        queryType,
        domain,
        entities: plan.entities
      }
    };
    
  } catch (error) {
    return {
      plan,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: Date.now() - startTime,
        rowCount: 0
      },
      metadata: {
        queryType,
        domain,
        entities: plan.entities
      }
    };
  }
}
