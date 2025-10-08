import { QueryPlan, ValidationResult } from "./types.js";
import { 
  ENTITY_DEFINITIONS, 
  getEntityColumns, 
  isValidJoin, 
  isRestrictedColumn,
  getForeignKeyRelationship,
  getTextJoinCondition,
  ALLOWED_AGGREGATIONS,
  AGGREGATION_RULES
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
 * Default time window in days (only applied when explicitly requested)
 * By default, queries should return current state (HEAD) without time restrictions
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
    
    // Validate joins (including text-based joins)
    for (const join of plan.joins) {
      // First check if the join is allowed at all
      if (!isValidJoin(join.left_table, join.right_table)) {
        issues.push(`Invalid join: ${join.left_table} → ${join.right_table}`);
        continue;
      }
      
      // Check if it's a valid foreign key join
      const fkRelationship = getForeignKeyRelationship(join.left_table, join.right_table);
      // Check if it's a valid text-based join
      const textJoin = getTextJoinCondition(join.left_table, join.right_table);
      
      if (!fkRelationship && !textJoin) {
        // Check bidirectional joins
        const reverseFk = getForeignKeyRelationship(join.right_table, join.left_table);
        const reverseTextJoin = getTextJoinCondition(join.right_table, join.left_table);
        
        if (!reverseFk && !reverseTextJoin) {
          issues.push(`No valid relationship found for join: ${join.left_table} → ${join.right_table}`);
        }
      }
    }
    
    // Validate aggregations
    if (plan.aggregations && plan.aggregations.length > 0) {
      for (const agg of plan.aggregations) {
        if (!ALLOWED_AGGREGATIONS.includes(agg.function)) {
          issues.push(`Invalid aggregation function: ${agg.function}`);
        }
        
        // Check if numeric-only functions are used on appropriate columns
        if (AGGREGATION_RULES.numeric_only.includes(agg.function)) {
          // This is a basic check - in a real implementation, you'd check column types
          const columnName = agg.column.split('.').pop() || agg.column;
          if (columnName === 'id' || columnName === 'created_at' || columnName === 'committed_at') {
            issues.push(`Aggregation function ${agg.function} not suitable for ${agg.column}`);
          }
        }
      }
      
      // Validate GROUP BY if aggregations are present
      if (plan.aggregations.length > 0 && (!plan.group_by || plan.group_by.length === 0)) {
        issues.push(`GROUP BY required when using aggregations`);
      }
    }
    
    // Check for dangerous keywords in filters (basic check)
    // Use word boundaries to avoid false positives like "commits" matching "COMMIT"
    const filterText = JSON.stringify(plan.filters);
    for (const keyword of DANGEROUS_KEYWORDS) {
      // Skip "COMMIT" if it's part of a table name like "commits"
      if (keyword === 'COMMIT' && (filterText.includes('commits') || filterText.includes('commit'))) {
        continue;
      }
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(filterText)) {
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
  
  // Resolve parameter placeholders to actual values
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  
  const resolveParameter = (value: any): any => {
    if (typeof value === 'string') {
      if (value === ':project_id' || value === '${project_id}' || value === '{project_id}' || value === '{{project_id}}' || value === '$project_id') return projectId;
      if (value === ':start_date' || value === '${start_date}' || value === '{start_date}' || value === '{{start_date}}' || value === '$start_date') return thirtyDaysAgo.toISOString();
      if (value === ':end_date' || value === '${end_date}' || value === '{end_date}' || value === '{{end_date}}' || value === '$end_date') return now.toISOString();
      
      // Handle dynamic time expressions like "${now - 90 days}"
      const timeMatch = value.match(/\$\{now\s*-\s*(\d+)\s*days?\}/i);
      if (timeMatch) {
        const daysBack = parseInt(timeMatch[1]);
        const pastDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        return pastDate.toISOString();
      }
    }
    return value;
  };
  
  // Build SELECT clause with aggregations
  let selectColumns: string;
  
  if (plan.aggregations && plan.aggregations.length > 0) {
    // Build aggregation SELECT
    const aggregationClauses = plan.aggregations.map(agg => {
      const [table, column] = agg.column.includes('.') ? agg.column.split('.') : [mainEntity, agg.column];
      return `${agg.function}(${table}.${column}) AS ${agg.alias}`;
    });
    
    // Add non-aggregated columns from GROUP BY
    const groupByColumns = plan.group_by ? plan.group_by.map(col => {
      const [table, column] = col.includes('.') ? col.split('.') : [mainEntity, col];
      return `${table}.${column}`;
    }) : [];
    
    selectColumns = [...groupByColumns, ...aggregationClauses].join(', ');
  } else {
    // Regular SELECT
    selectColumns = plan.columns.length > 0 
      ? plan.columns.map(col => {
          const [table, column] = col.includes('.') ? col.split('.') : [mainEntity, col];
          return isRestrictedColumn(table, column) 
            ? `CASE WHEN '${table}.${column}' = '${table}.${column}' THEN 'REDACTED' ELSE 'REDACTED' END AS ${column}`
            : `${table}.${column}`;
        }).join(', ')
      : `${mainEntity}.*`;
  }
  
  // Build FROM clause
  let fromClause = `FROM ${mainEntity}`;
  
  // Track which tables are already in the FROM clause to avoid duplicates
  const tablesInFrom = new Set([mainEntity]);
  
  // Build JOIN clauses (including text-based joins)
  const joins: string[] = [];
  for (const join of plan.joins) {
    const fkRelationship = getForeignKeyRelationship(join.left_table, join.right_table);
    const textJoin = getTextJoinCondition(join.left_table, join.right_table);
    
    if (fkRelationship) {
      if (!tablesInFrom.has(join.right_table)) {
        joins.push(
          `${join.type} JOIN ${join.right_table} ON ${join.left_table}.${fkRelationship.leftColumn} = ${join.right_table}.${fkRelationship.rightColumn}`
        );
        tablesInFrom.add(join.right_table);
      }
    } else if (textJoin) {
      if (!tablesInFrom.has(join.right_table)) {
        joins.push(
          `${join.type} JOIN ${join.right_table} ON ${join.left_table}.${textJoin.leftColumn} = ${join.right_table}.${textJoin.rightColumn}`
        );
        tablesInFrom.add(join.right_table);
      }
    } else {
      // Check reverse direction
      const reverseFk = getForeignKeyRelationship(join.right_table, join.left_table);
      const reverseTextJoin = getTextJoinCondition(join.right_table, join.left_table);
      
      if (reverseFk) {
        if (!tablesInFrom.has(join.right_table)) {
          joins.push(
            `${join.type} JOIN ${join.right_table} ON ${join.right_table}.${reverseFk.rightColumn} = ${join.left_table}.${reverseFk.leftColumn}`
          );
          tablesInFrom.add(join.right_table);
        }
      } else if (reverseTextJoin) {
        if (!tablesInFrom.has(join.right_table)) {
          joins.push(
            `${join.type} JOIN ${join.right_table} ON ${join.right_table}.${reverseTextJoin.rightColumn} = ${join.left_table}.${reverseTextJoin.leftColumn}`
          );
          tablesInFrom.add(join.right_table);
        }
      }
    }
  }
  
  // Build WHERE clause
  const whereConditions: string[] = [];
  
  // Always include project_id filter
  if (mainEntity === 'projects') {
    whereConditions.push(`${mainEntity}.id = '${projectId}'`);
  } else if (mainEntity === 'users' || mainEntity === 'interaction_diffs') {
    // Users and interaction_diffs tables don't have project_id, so we don't add automatic project join
    // Project filtering will be handled through joined entities
  } else {
    // For other entities, join to projects to filter by project_id
    if (!plan.joins.some(j => j.right_table === 'projects') && !tablesInFrom.has('projects')) {
      joins.push(`INNER JOIN projects ON ${mainEntity}.project_id = projects.id`);
      tablesInFrom.add('projects');
    }
    whereConditions.push(`projects.id = '${projectId}'`);
  }
  
  // Special handling for users, interaction_diffs, and interactions tables - they don't have project_id directly
  if (mainEntity === 'users' || mainEntity === 'interaction_diffs' || mainEntity === 'interactions') {
    // For these tables, we need to filter through the joined entities
    // Check if we have joins that can provide project context
    const hasProjectContext = plan.joins.some(j => 
      j.right_table === 'commits' || j.right_table === 'interactions' || j.right_table === 'conversations'
    );
    
    if (hasProjectContext) {
      // Filter through the joined entity's project_id
      const projectEntity = plan.joins.find(j => 
        j.right_table === 'commits' || j.right_table === 'interactions' || j.right_table === 'conversations'
      )?.right_table;
      
      if (projectEntity === 'commits' || projectEntity === 'conversations') {
        // These entities have direct project_id
        whereConditions.push(`${projectEntity}.project_id = '${projectId}'`);
      } else if (projectEntity === 'interactions') {
        // Interactions don't have direct project_id, need to go through conversations
        if (plan.joins.some(j => j.right_table === 'conversations')) {
          whereConditions.push(`conversations.project_id = '${projectId}'`);
        } else {
          // Add the missing join to conversations
          joins.push(`INNER JOIN conversations ON interactions.conversation_id = conversations.id`);
          tablesInFrom.add('conversations');
          whereConditions.push(`conversations.project_id = '${projectId}'`);
        }
      }
    } else {
      // If no project context available, add conversations join for interactions
      if (mainEntity === 'interactions') {
        joins.push(`INNER JOIN conversations ON interactions.conversation_id = conversations.id`);
        tablesInFrom.add('conversations');
        whereConditions.push(`conversations.project_id = '${projectId}'`);
      }
      // For other entities without project context, we can't filter by project
      // This should be handled by the planner to ensure proper joins
    }
  }
  
  // Add time window filter (only if explicitly requested)
  const timeWindow = plan.time_window;
  if (timeWindow.days_back && timeWindow.days_back > 0) {
    const daysBack = timeWindow.days_back;
    const timeColumn = getTimeColumn(mainEntity);
    if (timeColumn) {
      whereConditions.push(`${mainEntity}.${timeColumn} >= NOW() - INTERVAL '${daysBack} days'`);
    }
  }
  
  // Add custom filters
  for (const filter of plan.filters) {
    const [table, column] = filter.column.includes('.') ? filter.column.split('.') : [mainEntity, filter.column];
    const resolvedValue = resolveParameter(filter.value);
    
    switch (filter.operator) {
      case '=':
      case '!=':
      case '>':
      case '<':
      case '>=':
      case '<=':
        if (typeof resolvedValue === 'string') {
          whereConditions.push(`${table}.${column} ${filter.operator} '${resolvedValue}'`);
        } else {
          whereConditions.push(`${table}.${column} ${filter.operator} ${resolvedValue}`);
        }
        break;
      case 'LIKE':
        // Special handling for JSONB columns
        if (column === 'diff_chunks') {
          // For JSONB columns, use case-insensitive text search
          whereConditions.push(`LOWER(${table}.${column}::text) LIKE LOWER('${resolvedValue}')`);
        } else {
          // Use case-insensitive LIKE for better matching
          whereConditions.push(`LOWER(${table}.${column}) LIKE LOWER('${resolvedValue}')`);
        }
        break;
      case 'IN':
        if (Array.isArray(resolvedValue)) {
          const values = resolvedValue.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ');
          whereConditions.push(`${table}.${column} IN (${values})`);
        }
        break;
      case 'NOT IN':
        if (Array.isArray(resolvedValue)) {
          const values = resolvedValue.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ');
          whereConditions.push(`${table}.${column} NOT IN (${values})`);
        }
        break;
    }
  }
  
  // Build GROUP BY clause
  const groupBy = plan.group_by && plan.group_by.length > 0 
    ? `GROUP BY ${plan.group_by.map(col => {
        const [table, column] = col.includes('.') ? col.split('.') : [mainEntity, col];
        return `${table}.${column}`;
      }).join(', ')}`
    : '';
  
  // Build ORDER BY clause (default to most recent)
  const timeColumn = getTimeColumn(mainEntity);
  let orderBy = '';
  
  if (plan.aggregations && plan.aggregations.length > 0) {
    // For aggregation queries, order by the first aggregation (usually COUNT)
    const firstAgg = plan.aggregations[0];
    orderBy = `ORDER BY ${firstAgg.alias} DESC`;
  } else if (timeColumn) {
    // For regular queries, order by time column
    orderBy = `ORDER BY ${mainEntity}.${timeColumn} DESC`;
  }
  
  // Build LIMIT clause
  const limit = `LIMIT ${MAX_ROWS}`;
  
  // Combine all parts
  const sql = [
    `SELECT ${selectColumns}`,
    fromClause,
    ...joins,
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '',
    groupBy,
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
    users: 'created_at',
    interaction_diffs: 'created_at',
    pull_requests: 'created_at'
  };
  
  return timeColumns[entity] || null;
}
