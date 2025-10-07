import { QueryPlan, ValidationResult } from "./types.js";
import { 
  ENTITY_DEFINITIONS, 
  getEntityColumns, 
  isValidJoin, 
  isRestrictedColumn,
  getForeignKeyRelationship 
} from "./ontology.js";

/**
 * Dangerous SQL keywords that should be blocked
 */
const DANGEROUS_KEYWORDS = [
  "DROP", "INSERT", "UPDATE", "DELETE", "TRUNCATE", 
  "ALTER", "CREATE", "EXEC", "EXECUTE", "CALL",
  "GRANT", "REVOKE", "COMMIT", "ROLLBACK"
];

/**
 * Maximum number of rows allowed per query
 */
const MAX_ROWS = 200;

/**
 * Default time window in days
 */
const DEFAULT_TIME_WINDOW_DAYS = 30;

/**
 * Validate a query plan and generate safe SQL
 */
export function validateAndBuildSQL(plan: QueryPlan, projectId: string): ValidationResult {
  const issues: string[] = [];
  
  try {
    // Validate entities
    for (const entity of plan.entities) {
      if (!ENTITY_DEFINITIONS[entity as keyof typeof ENTITY_DEFINITIONS]) {
        issues.push(`Unknown entity: ${entity}`);
      }
    }
    
    // Validate columns
    for (const column of plan.columns) {
      const [tableName, columnName] = column.includes('.') ? column.split('.') : ['', column];
      if (tableName && !getEntityColumns(tableName).includes(columnName)) {
        issues.push(`Unknown column: ${column}`);
      }
    }
    
    // Validate joins
    for (const join of plan.joins) {
      if (!isValidJoin(join.left_table, join.right_table)) {
        issues.push(`Invalid join: ${join.left_table} → ${join.right_table}`);
      }
    }
    
    // Check for dangerous keywords in filters (basic check)
    const filterText = JSON.stringify(plan.filters);
    for (const keyword of DANGEROUS_KEYWORDS) {
      if (filterText.toUpperCase().includes(keyword)) {
        issues.push(`Dangerous keyword detected: ${keyword}`);
      }
    }
    
    if (issues.length > 0) {
      return { isValid: false, issues };
    }
    
    // Generate safe SQL
    const safeSQL = buildSafeSQL(plan, projectId);
    
    return { isValid: true, issues: [], safeSQL };
    
  } catch (error) {
    return { 
      isValid: false, 
      issues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}

/**
 * Build safe parameterized SQL from query plan
 */
function buildSafeSQL(plan: QueryPlan, projectId: string): string {
  const mainEntity = plan.entities[0];
  const mainTable = ENTITY_DEFINITIONS[mainEntity as keyof typeof ENTITY_DEFINITIONS];
  
  if (!mainTable) {
    throw new Error(`Unknown main entity: ${mainEntity}`);
  }
  
  // Build SELECT clause
  const selectColumns = plan.columns.length > 0 
    ? plan.columns.map(col => {
        const [table, column] = col.includes('.') ? col.split('.') : [mainEntity, col];
        return isRestrictedColumn(table, column) 
          ? `CASE WHEN '${table}.${column}' = '${table}.${column}' THEN 'REDACTED' ELSE 'REDACTED' END AS ${column}`
          : `${table}.${column}`;
      }).join(', ')
    : `${mainEntity}.*`;
  
  // Build FROM clause
  let fromClause = `FROM ${mainEntity}`;
  
  // Build JOIN clauses
  const joins: string[] = [];
  for (const join of plan.joins) {
    const fkRelationship = getForeignKeyRelationship(join.left_table, join.right_table);
    if (fkRelationship) {
      joins.push(
        `${join.type} JOIN ${join.right_table} ON ${join.left_table}.${fkRelationship.leftColumn} = ${join.right_table}.${fkRelationship.rightColumn}`
      );
    }
  }
  
  // Build WHERE clause
  const whereConditions: string[] = [];
  
  // Always include project_id filter
  if (mainEntity === 'projects') {
    whereConditions.push(`${mainEntity}.id = $1`);
  } else {
    // For other entities, join to projects to filter by project_id
    if (!plan.joins.some(j => j.right_table === 'projects')) {
      joins.push(`INNER JOIN projects ON ${mainEntity}.project_id = projects.id`);
    }
    whereConditions.push(`projects.id = $1`);
  }
  
  // Add time window filter
  const timeWindow = plan.time_window;
  if (timeWindow.days_back) {
    const daysBack = timeWindow.days_back || DEFAULT_TIME_WINDOW_DAYS;
    const timeColumn = getTimeColumn(mainEntity);
    if (timeColumn) {
      whereConditions.push(`${mainEntity}.${timeColumn} >= NOW() - INTERVAL '${daysBack} days'`);
    }
  }
  
  // Add custom filters
  let paramIndex = 2;
  for (const filter of plan.filters) {
    const [table, column] = filter.column.includes('.') ? filter.column.split('.') : [mainEntity, filter.column];
    const param = `$${paramIndex}`;
    
    switch (filter.operator) {
      case '=':
      case '!=':
      case '>':
      case '<':
      case '>=':
      case '<=':
        whereConditions.push(`${table}.${column} ${filter.operator} ${param}`);
        paramIndex++;
        break;
      case 'LIKE':
        whereConditions.push(`${table}.${column} LIKE ${param}`);
        paramIndex++;
        break;
      case 'IN':
        if (Array.isArray(filter.value)) {
          const placeholders = filter.value.map(() => `$${paramIndex++}`).join(', ');
          whereConditions.push(`${table}.${column} IN (${placeholders})`);
        }
        break;
      case 'NOT IN':
        if (Array.isArray(filter.value)) {
          const placeholders = filter.value.map(() => `$${paramIndex++}`).join(', ');
          whereConditions.push(`${table}.${column} NOT IN (${placeholders})`);
        }
        break;
    }
  }
  
  // Build ORDER BY clause (default to most recent)
  const timeColumn = getTimeColumn(mainEntity);
  const orderBy = timeColumn ? `ORDER BY ${mainEntity}.${timeColumn} DESC` : '';
  
  // Build LIMIT clause
  const limit = `LIMIT ${MAX_ROWS}`;
  
  // Combine all parts
  const sql = [
    `SELECT ${selectColumns}`,
    fromClause,
    ...joins,
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '',
    orderBy,
    limit
  ].filter(Boolean).join('\n');
  
  return sql;
}

/**
 * Get the appropriate time column for an entity
 */
function getTimeColumn(entity: string): string | null {
  const timeColumns: Record<string, string> = {
    commits: 'committed_at',
    interactions: 'created_at',
    conversations: 'created_at',
    projects: 'created_at',
    users: 'created_at'
  };
  
  return timeColumns[entity] || null;
}
