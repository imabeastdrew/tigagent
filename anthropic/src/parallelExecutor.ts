import { Pool } from 'pg';
import { 
  MultiStageQueryPlan, 
  MultiStageQueryResults, 
  QueryResult, 
  ParallelExecutionResult 
} from './types';
import { executeQueryPlan } from './executor';
import { PERFORMANCE_CONFIG } from './config';

/**
 * Parallel Executor
 * Executes multiple coordinated queries simultaneously
 */
export class ParallelExecutor {
  private pool: Pool;
  private projectId: string;

  constructor(pool: Pool, projectId: string) {
    this.pool = pool;
    this.projectId = projectId;
  }

  /**
   * Execute a multi-stage query plan with parallel execution
   */
  async executeMultiStagePlan(plan: MultiStageQueryPlan): Promise<MultiStageQueryResults> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Execute primary and contextual queries in parallel
      const allPlans = [plan.primaryPlan, ...plan.contextualPlans];
      
      // Execute all queries in parallel using Promise.allSettled
      const results = await this.executeInParallel(allPlans);

      // Separate primary and contextual results
      const primaryResult = results[0];
      const contextualResults = results.slice(1);

      // Execute connection plan if present
      let connectionResult: QueryResult | undefined;
      if (plan.connectionPlan) {
        connectionResult = await this.executeSingle(plan.connectionPlan);
      }

      // Calculate total execution time
      const totalExecutionTime = Date.now() - startTime;

      // Collect errors
      results.forEach(result => {
        if (result.error) {
          errors.push(result.error);
        }
      });

      return {
        primaryResult,
        contextualResults,
        connectionResult,
        totalExecutionTime,
        errors,
      };
    } catch (error) {
      const totalExecutionTime = Date.now() - startTime;
      
      errors.push(error instanceof Error ? error.message : String(error));

      // Return empty results with error
      return {
        primaryResult: {
          domain: plan.primaryPlan.domain,
          intent: plan.primaryPlan.intent,
          data: [],
          rowCount: 0,
          executionTime: 0,
          error: errors[0],
        },
        contextualResults: [],
        totalExecutionTime,
        errors,
      };
    }
  }

  /**
   * Execute multiple query plans in parallel
   */
  private async executeInParallel(plans: any[]): Promise<QueryResult[]> {
    // Limit concurrent queries based on configuration
    const maxConcurrent = PERFORMANCE_CONFIG.maxConcurrentQueries;

    if (plans.length <= maxConcurrent) {
      // Execute all at once
      return this.executeBatch(plans);
    } else {
      // Execute in batches
      return this.executeBatched(plans, maxConcurrent);
    }
  }

  /**
   * Execute a batch of queries
   */
  private async executeBatch(plans: any[]): Promise<QueryResult[]> {
    const promises = plans.map(plan => this.executeSingleWithFallback(plan));
    const results = await Promise.allSettled(promises);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          domain: plans[index].domain,
          intent: plans[index].intent,
          data: [],
          rowCount: 0,
          executionTime: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      }
    });
  }

  /**
   * Execute queries in batches (for large numbers of queries)
   */
  private async executeBatched(plans: any[], batchSize: number): Promise<QueryResult[]> {
    const results: QueryResult[] = [];

    for (let i = 0; i < plans.length; i += batchSize) {
      const batch = plans.slice(i, i + batchSize);
      const batchResults = await this.executeBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Execute a single query plan with fallback
   */
  private async executeSingleWithFallback(plan: any): Promise<QueryResult> {
    try {
      return await this.executeSingle(plan);
    } catch (error) {
      return {
        domain: plan.domain,
        intent: plan.intent,
        data: [],
        rowCount: 0,
        executionTime: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a single query plan
   */
  private async executeSingle(plan: any): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const result = await executeQueryPlan(plan, this.pool, this.projectId);
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        domain: plan.domain,
        intent: plan.intent,
        data: [],
        rowCount: 0,
        executionTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute with timeout
   */
  async executeWithTimeout(
    plan: MultiStageQueryPlan,
    timeoutMs: number = PERFORMANCE_CONFIG.queryTimeoutMs
  ): Promise<MultiStageQueryResults> {
    return Promise.race([
      this.executeMultiStagePlan(plan),
      new Promise<MultiStageQueryResults>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(
    plan: MultiStageQueryPlan,
    maxRetries: number = 3
  ): Promise<MultiStageQueryResults> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.executeMultiStagePlan(plan);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries - 1) {
          const delayMs = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError || new Error('Execution failed after retries');
  }

  /**
   * Execute with progress tracking
   */
  async executeWithProgress(
    plan: MultiStageQueryPlan,
    onProgress: (completed: number, total: number) => void
  ): Promise<MultiStageQueryResults> {
    const totalQueries = 1 + plan.contextualPlans.length + (plan.connectionPlan ? 1 : 0);
    let completedQueries = 0;

    const trackProgress = async <T>(promise: Promise<T>): Promise<T> => {
      const result = await promise;
      completedQueries++;
      onProgress(completedQueries, totalQueries);
      return result;
    };

    // Execute primary query
    const primaryPromise = trackProgress(this.executeSingle(plan.primaryPlan));

    // Execute contextual queries in parallel
    const contextualPromises = plan.contextualPlans.map(p =>
      trackProgress(this.executeSingle(p))
    );

    // Wait for all queries
    const [primaryResult, ...contextualResults] = await Promise.all([
      primaryPromise,
      ...contextualPromises,
    ]);

    // Execute connection plan if present
    let connectionResult: QueryResult | undefined;
    if (plan.connectionPlan) {
      connectionResult = await trackProgress(this.executeSingle(plan.connectionPlan));
    }

    return {
      primaryResult,
      contextualResults,
      connectionResult,
      totalExecutionTime: 0, // Will be calculated elsewhere
      errors: [],
    };
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(results: MultiStageQueryResults): any {
    const totalRows = results.primaryResult.rowCount +
      results.contextualResults.reduce((sum, r) => sum + r.rowCount, 0);

    const avgExecutionTime = (
      results.primaryResult.executionTime +
      results.contextualResults.reduce((sum, r) => sum + r.executionTime, 0)
    ) / (1 + results.contextualResults.length);

    return {
      totalQueries: 1 + results.contextualResults.length,
      totalRows,
      totalExecutionTime: results.totalExecutionTime,
      avgExecutionTime,
      errorCount: results.errors.length,
      successRate: (
        (1 + results.contextualResults.length - results.errors.length) /
        (1 + results.contextualResults.length)
      ) * 100,
    };
  }
}

/**
 * Create a parallel executor instance
 */
export function createParallelExecutor(pool: Pool, projectId: string): ParallelExecutor {
  return new ParallelExecutor(pool, projectId);
}

/**
 * Execute multiple plans in parallel (utility function)
 */
export async function executeMultiplePlansInParallel(
  plans: MultiStageQueryPlan[],
  pool: Pool,
  projectId: string
): Promise<MultiStageQueryResults[]> {
  const executor = new ParallelExecutor(pool, projectId);
  
  const promises = plans.map(plan => executor.executeMultiStagePlan(plan));
  const results = await Promise.allSettled(promises);

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        primaryResult: {
          domain: 'error',
          intent: 'error',
          data: [],
          rowCount: 0,
          executionTime: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        },
        contextualResults: [],
        totalExecutionTime: 0,
        errors: [result.reason instanceof Error ? result.reason.message : String(result.reason)],
      };
    }
  });
}

