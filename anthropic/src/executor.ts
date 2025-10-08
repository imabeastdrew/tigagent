import { Pool, QueryResult as PgQueryResult } from 'pg';
import { QueryPlan, QueryResult, ValidationResult } from './types';
import { validateAndBuildSQL } from './validator';
import { DATABASE_PERMISSIONS } from './config';

/**
 * Execute a validated SQL query
 */
export async function executeQuery(
  sql: string,
  pool: Pool,
  domain: string,
  intent: string
): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    // Additional safety check
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries are allowed');
    }

    // Execute the query
    const result: PgQueryResult = await pool.query(sql);

    const executionTime = Date.now() - startTime;

    return {
      domain,
      intent,
      data: result.rows,
      rowCount: result.rowCount || 0,
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      domain,
      intent,
      data: [],
      rowCount: 0,
      executionTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a query plan (validate and execute)
 */
export async function executeQueryPlan(
  plan: QueryPlan,
  pool: Pool,
  projectId: string
): Promise<QueryResult> {
  // Validate and build SQL
  const validation: ValidationResult = validateAndBuildSQL(plan, projectId);

  // Log SQL generation for debugging
  const enableDebugLogging = process.env.DEBUG_SQL === 'true';
  if (enableDebugLogging) {
    console.log(`\n[SQL] Plan: ${plan.domain} - ${plan.intent}`);
    console.log(`[SQL] Entities: ${plan.entities?.join(', ') || 'none'}`);
    console.log(`[SQL] Valid: ${validation.isValid}`);
    if (validation.sql) {
      console.log(`[SQL] Full Query:\n${validation.sql}`);
    }
    if (validation.errors.length > 0) {
      console.log(`[SQL] Errors: ${validation.errors.join(', ')}`);
    }
    console.log('[SQL] ---');
  }

  if (!validation.isValid || !validation.sql) {
    return {
      domain: plan.domain,
      intent: plan.intent,
      data: [],
      rowCount: 0,
      executionTime: 0,
      error: `Validation failed: ${validation.errors.join(', ')}`,
      sql: validation.sql || 'No SQL generated',
    };
  }

  // Execute the query
  const result = await executeQuery(validation.sql, pool, plan.domain, plan.intent);
  
  // Include SQL in result for debugging
  return {
    ...result,
    sql: validation.sql,
  };
}

/**
 * Execute multiple query plans sequentially
 */
export async function executeMultipleQueryPlans(
  plans: QueryPlan[],
  pool: Pool,
  projectId: string
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];

  for (const plan of plans) {
    const result = await executeQueryPlan(plan, pool, projectId);
    results.push(result);
  }

  return results;
}

/**
 * Execute query with parameters (using parameterized queries for safety)
 */
export async function executeQueryWithParams(
  sql: string,
  params: any[],
  pool: Pool
): Promise<any[]> {
  try {
    // Additional safety check
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries are allowed');
    }

    const result: PgQueryResult = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('Query execution error:', error);
    throw error;
  }
}

/**
 * Execute a raw SQL query (with all safety checks)
 */
export async function executeSafeQuery(
  sql: string,
  pool: Pool,
  projectId: string
): Promise<any[]> {
  // Perform safety checks
  const upperSQL = sql.toUpperCase();

  // Must be SELECT only
  if (!upperSQL.startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }

  // Check for dangerous keywords
  const dangerous = DATABASE_PERMISSIONS.dangerous_keywords;
  for (const keyword of dangerous) {
    if (upperSQL.includes(keyword)) {
      throw new Error(`Dangerous keyword detected: ${keyword}`);
    }
  }

  // Check for project scoping
  if (DATABASE_PERMISSIONS.required_project_scope) {
    if (!sql.includes(projectId)) {
      throw new Error('Query must include project_id filter');
    }
  }

  // Check for row limit
  if (!upperSQL.includes('LIMIT')) {
    sql += ` LIMIT ${DATABASE_PERMISSIONS.max_rows}`;
  }

  // Execute the query
  return executeQueryWithParams(sql, [], pool);
}

/**
 * Test database connection
 */
export async function testConnection(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(pool: Pool): Promise<any> {
  try {
    const queries = [
      'SELECT COUNT(*) as total_projects FROM projects',
      'SELECT COUNT(*) as total_conversations FROM conversations',
      'SELECT COUNT(*) as total_interactions FROM interactions',
      'SELECT COUNT(*) as total_commits FROM commits',
      'SELECT COUNT(*) as total_diffs FROM interaction_diffs',
    ];

    const results = await Promise.all(
      queries.map(query => pool.query(query))
    );

    return {
      totalProjects: parseInt(results[0].rows[0].total_projects),
      totalConversations: parseInt(results[1].rows[0].total_conversations),
      totalInteractions: parseInt(results[2].rows[0].total_interactions),
      totalCommits: parseInt(results[3].rows[0].total_commits),
      totalDiffs: parseInt(results[4].rows[0].total_diffs),
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    return null;
  }
}

/**
 * Get project information
 */
export async function getProjectInfo(pool: Pool, projectId: string): Promise<any> {
  try {
    const result = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting project info:', error);
    throw error;
  }
}

/**
 * Execute query with timeout
 */
export async function executeQueryWithTimeout(
  sql: string,
  pool: Pool,
  timeoutMs: number = 30000
): Promise<any[]> {
  return Promise.race([
    executeQueryWithParams(sql, [], pool),
    new Promise<any[]>((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    ),
  ]);
}

/**
 * Batch execute queries with error handling
 */
export async function batchExecuteQueries(
  queries: Array<{ sql: string; params?: any[] }>,
  pool: Pool
): Promise<Array<{ success: boolean; data?: any[]; error?: string }>> {
  const results = await Promise.allSettled(
    queries.map(({ sql, params = [] }) => executeQueryWithParams(sql, params, pool))
  );

  return results.map(result => {
    if (result.status === 'fulfilled') {
      return { success: true, data: result.value };
    } else {
      return {
        success: false,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
  });
}

/**
 * Stream query results (for large datasets)
 */
export async function* streamQueryResults(
  sql: string,
  pool: Pool,
  batchSize: number = 100
): AsyncGenerator<any[], void, unknown> {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batchSQL = `${sql} LIMIT ${batchSize} OFFSET ${offset}`;
    const rows = await executeQueryWithParams(batchSQL, [], pool);

    if (rows.length === 0) {
      hasMore = false;
    } else {
      yield rows;
      offset += batchSize;
    }

    // Safety check to prevent infinite loops
    if (offset > DATABASE_PERMISSIONS.max_rows) {
      hasMore = false;
    }
  }
}

/**
 * Execute transaction (for future use if needed)
 */
export async function executeTransaction(
  queries: Array<{ sql: string; params?: any[] }>,
  pool: Pool
): Promise<any[]> {
  const client = await pool.connect();
  const results: any[] = [];

  try {
    await client.query('BEGIN');

    for (const { sql, params = [] } of queries) {
      const result = await client.query(sql, params);
      results.push(result.rows);
    }

    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Count query results without fetching all data
 */
export async function countQueryResults(
  sql: string,
  pool: Pool
): Promise<number> {
  // Convert SELECT query to COUNT query
  const countSQL = sql.replace(/SELECT .+ FROM/i, 'SELECT COUNT(*) as count FROM');
  
  try {
    const result = await pool.query(countSQL);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error counting query results:', error);
    return 0;
  }
}

