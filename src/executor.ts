import { Pool } from "pg";
import { createHash } from "crypto";
import { ExecutionResult } from "./types.js";

/**
 * Execute a validated SQL query safely
 */
export async function executeQuery(safeSQL: string, pool: Pool): Promise<ExecutionResult> {
  const startTime = Date.now();
  const queryHash = createHash('sha256').update(safeSQL).digest('hex');
  
  let client;
  
  try {
    // Get client from pool
    client = await pool.connect();
    
    // Begin read-only transaction
    await client.query('BEGIN TRANSACTION READ ONLY');
    
    // Execute the query
    const result = await client.query(safeSQL);
    
    // Commit the transaction
    await client.query('COMMIT');
    
    const executionTimeMs = Date.now() - startTime;
    
    // Log query execution details
    console.log(`Query executed successfully:`, {
      queryHash,
      rowCount: result.rowCount || 0,
      executionTimeMs,
      timestamp: new Date().toISOString()
    });
    
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
      executionTimeMs,
      queryHash
    };
    
  } catch (error) {
    // Rollback transaction on error
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
    }
    
    const executionTimeMs = Date.now() - startTime;
    
    // Log error details
    console.error(`Query execution failed:`, {
      queryHash,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTimeMs,
      timestamp: new Date().toISOString(),
      sql: safeSQL.substring(0, 200) + '...' // Log first 200 chars for debugging
    });
    
    throw new Error(`Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
  } finally {
    // Always release the client back to the pool
    if (client) {
      client.release();
    }
  }
}

/**
 * Execute a query with parameters
 */
export async function executeQueryWithParams(
  safeSQL: string, 
  params: any[], 
  pool: Pool
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const queryHash = createHash('sha256').update(safeSQL + JSON.stringify(params)).digest('hex');
  
  let client;
  
  try {
    // Get client from pool
    client = await pool.connect();
    
    // Begin read-only transaction
    await client.query('BEGIN TRANSACTION READ ONLY');
    
    // Execute the query with parameters
    const result = await client.query(safeSQL, params);
    
    // Commit the transaction
    await client.query('COMMIT');
    
    const executionTimeMs = Date.now() - startTime;
    
    // Log query execution details
    console.log(`Parameterized query executed successfully:`, {
      queryHash,
      rowCount: result.rowCount || 0,
      executionTimeMs,
      paramCount: params.length,
      timestamp: new Date().toISOString()
    });
    
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
      executionTimeMs,
      queryHash
    };
    
  } catch (error) {
    // Rollback transaction on error
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
    }
    
    const executionTimeMs = Date.now() - startTime;
    
    // Log error details
    console.error(`Parameterized query execution failed:`, {
      queryHash,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTimeMs,
      paramCount: params.length,
      timestamp: new Date().toISOString(),
      sql: safeSQL.substring(0, 200) + '...' // Log first 200 chars for debugging
    });
    
    throw new Error(`Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
  } finally {
    // Always release the client back to the pool
    if (client) {
      client.release();
    }
  }
}
