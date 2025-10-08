import { QueryPlan, ValidationResult } from './types';
import { DATABASE_PERMISSIONS } from './config';
import { getTableSchema, getTableColumns, isRestrictedColumn, TABLES } from './ontology';

/**
 * Validates a query plan and generates safe SQL
 */
export function validateAndBuildSQL(plan: QueryPlan, projectId: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate domain and entities
  if (!plan.domain) {
    errors.push('Query plan must specify a domain');
  }

  if (!plan.entities || plan.entities.length === 0) {
    errors.push('Query plan must specify at least one entity');
  }

  // Check if entities are valid tables
  const invalidTables = plan.entities.filter(entity => !TABLES[entity]);
  if (invalidTables.length > 0) {
    errors.push(`Invalid table(s): ${invalidTables.join(', ')}`);
  }

  // Early return if basic validation fails
  if (errors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  try {
    // Build SQL based on the query plan
    const sql = buildSQLFromPlan(plan, projectId, errors, warnings);

    // Validate the generated SQL
    validateSQL(sql, errors, warnings);

    // Check for dangerous keywords
    checkDangerousKeywords(sql, errors);

    // Check row limits
    if (!sql.includes('LIMIT')) {
      warnings.push('No LIMIT clause specified, adding default limit');
    }

    return {
      isValid: errors.length === 0,
      sql: errors.length === 0 ? sql : undefined,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(`Error building SQL: ${error instanceof Error ? error.message : String(error)}`);
    return { isValid: false, errors, warnings };
  }
}

/**
 * Build SQL from query plan
 */
function buildSQLFromPlan(
  plan: QueryPlan,
  projectId: string,
  errors: string[],
  warnings: string[]
): string {
  const primaryTable = plan.entities[0];
  const tableSchema = getTableSchema(primaryTable);

  if (!tableSchema) {
    errors.push(`Table schema not found for ${primaryTable}`);
    return '';
  }

  // First determine which tables can actually be joined
  const joinableEntities = determineJoinableEntities(plan);
  
  // Create a modified plan with only joinable entities
  const joinedPlan: QueryPlan = {
    ...plan,
    entities: joinableEntities,
  };

  // Build SELECT clause with only joinable tables
  const selectColumns = buildSelectClause(joinedPlan, primaryTable, errors, warnings);

  // Build FROM clause with only joinable tables
  const fromClause = buildFromClauseWithJoinableEntities(joinedPlan);

  // Build WHERE clause (always include project scoping)
  const whereClause = buildWhereClause(joinedPlan, primaryTable, projectId, errors);

  // Build ORDER BY clause
  const orderByClause = buildOrderByClause(joinedPlan, primaryTable);

  // Build LIMIT clause (use filter limit if specified, otherwise use max_rows)
  const limit = joinedPlan.filters?.limit || DATABASE_PERMISSIONS.max_rows;
  const limitClause = `LIMIT ${limit}`;

  // Combine all parts
  const sql = `
SELECT ${selectColumns}
FROM ${fromClause}
${whereClause}
${orderByClause}
${limitClause}
  `.trim();

  return sql;
}

/**
 * Determine which entities can actually be joined (with junction table support)
 */
function determineJoinableEntities(plan: QueryPlan): string[] {
  if (plan.entities.length <= 1) {
    return plan.entities;
  }

  const joinableEntities: string[] = [plan.entities[0]]; // Primary table is always included

  for (let i = 1; i < plan.entities.length; i++) {
    const joinedTable = plan.entities[i];
    
    // Skip if already in joinableEntities (avoid duplicates)
    if (joinableEntities.includes(joinedTable)) {
      continue;
    }
    
    // Try to find a join from ANY previously joined table (not just the last one)
    let foundJoin = false;
    
    // Try from the last table first (most common case)
    for (let j = joinableEntities.length - 1; j >= 0 && !foundJoin; j--) {
      const prevTable = joinableEntities[j];
      
      // Check for direct join
      const joinCondition = determineJoinCondition(prevTable, joinedTable);

      if (joinCondition) {
        joinableEntities.push(joinedTable);
        foundJoin = true;
        break;
      }
      
      // Check if we need a junction table
      const junctionPath = findJunctionTablePath(prevTable, joinedTable);
      
      if (junctionPath) {
        // Add all tables in the junction path (filter out duplicates)
        for (const table of junctionPath) {
          if (!joinableEntities.includes(table)) {
            joinableEntities.push(table);
          }
        }
        // Also add the target table at the end
        if (!joinableEntities.includes(joinedTable)) {
          joinableEntities.push(joinedTable);
        }
        foundJoin = true;
        break;
      }
    }
    
    // If no join found from any table, try project_id fallback from last table
    if (!foundJoin) {
      const prevTable = joinableEntities[joinableEntities.length - 1];
      const prevSchema = getTableSchema(prevTable);
      const joinSchema = getTableSchema(joinedTable);
      
      const prevHasProjectId = prevSchema?.columns.some(col => col.name === 'project_id');
      const joinHasProjectId = joinSchema?.columns.some(col => col.name === 'project_id');
      
      if (prevHasProjectId && joinHasProjectId) {
        joinableEntities.push(joinedTable);
      }
      // Otherwise skip this table (don't add to joinableEntities)
    }
  }

  return joinableEntities;
}

/**
 * Find a path through junction tables to connect two tables
 */
function findJunctionTablePath(table1: string, table2: string): string[] | null {
  // Define known junction table paths
  const junctionPaths: Record<string, string[]> = {
    // conversations ↔ commits via interactions → commit_interactions
    'conversations-commits': ['interactions', 'commit_interactions'],
    'commits-conversations': ['commit_interactions', 'interactions', 'conversations'],
    
    // commits ↔ interactions via commit_interactions
    'commits-interactions': ['commit_interactions'],
    'interactions-commits': ['commit_interactions'],
    
    // commits ↔ interaction_diffs via commit_interactions → interactions
    'commits-interaction_diffs': ['commit_interactions', 'interactions'],
    'interaction_diffs-commits': ['interactions', 'commit_interactions'],
  };

  const key = `${table1}-${table2}`;
  return junctionPaths[key] || null;
}

/**
 * Build FROM clause with joinable entities (no side effects)
 */
function buildFromClauseWithJoinableEntities(plan: QueryPlan): string {
  const primaryTable = plan.entities[0];
  let fromClause = primaryTable;

  // Add JOINs for additional entities
  if (plan.entities.length > 1) {
    for (let i = 1; i < plan.entities.length; i++) {
      const joinedTable = plan.entities[i];
      
      // Try to find a join condition from ANY previously joined table (search backwards)
      let foundJoin = false;
      for (let j = i - 1; j >= 0 && !foundJoin; j--) {
        const prevTable = plan.entities[j];
        const joinCondition = determineJoinCondition(prevTable, joinedTable);

        if (joinCondition) {
          fromClause += `\nLEFT JOIN ${joinedTable} ON ${joinCondition}`;
          foundJoin = true;
          break;
        }
      }
      
      // Fallback: join on project_id from immediately previous table
      if (!foundJoin) {
        const prevTable = plan.entities[i - 1];
        const prevSchema = getTableSchema(prevTable);
        const joinSchema = getTableSchema(joinedTable);
        
        const prevHasProjectId = prevSchema?.columns.some(col => col.name === 'project_id');
        const joinHasProjectId = joinSchema?.columns.some(col => col.name === 'project_id');
        
        if (prevHasProjectId && joinHasProjectId) {
          fromClause += `\nLEFT JOIN ${joinedTable} ON ${prevTable}.project_id = ${joinedTable}.project_id`;
        } else {
          // Skip this join if we can't determine how to do it
          console.warn(`[SQL Builder] Cannot join ${joinedTable}, skipping`);
        }
      }
    }
  }

  return fromClause;
}

/**
 * Build SELECT clause
 */
function buildSelectClause(
  plan: QueryPlan,
  primaryTable: string,
  errors: string[],
  warnings: string[]
): string {
  const columns = getTableColumns(primaryTable);
  const selectColumns: string[] = [];

  for (const column of columns) {
    const fullColumnName = `${primaryTable}.${column.name}`;

    // Skip restricted columns
    if (isRestrictedColumn(primaryTable, column.name)) {
      warnings.push(`Skipping restricted column: ${fullColumnName}`);
      continue;
    }

    selectColumns.push(`${primaryTable}.${column.name}`);
  }

  // Handle joins - add columns from joined tables
  if (plan.entities.length > 1) {
    for (let i = 1; i < plan.entities.length; i++) {
      const joinedTable = plan.entities[i];
      const joinedColumns = getTableColumns(joinedTable);

      for (const column of joinedColumns) {
        if (!isRestrictedColumn(joinedTable, column.name)) {
          selectColumns.push(`${joinedTable}.${column.name}`);
        }
      }
    }
  }

  if (selectColumns.length === 0) {
    errors.push('No valid columns to select');
    return '*';
  }

  return selectColumns.join(',\n       ');
}


/**
 * Determine JOIN condition between two tables
 */
function determineJoinCondition(table1: string, table2: string): string | null {
  // Common join patterns
  const joinPatterns: Record<string, string> = {
    // Direct foreign key relationships
    'conversations-interactions': 'conversations.id = interactions.conversation_id',
    'interactions-interaction_diffs': 'interactions.id = interaction_diffs.interaction_id',
    'conversations-projects': 'conversations.project_id = projects.id',
    'commits-projects': 'commits.project_id = projects.id',
    'interactions-conversations': 'interactions.conversation_id = conversations.id',
    'interaction_diffs-interactions': 'interaction_diffs.interaction_id = interactions.id',
    
    // User relationships
    'commits-users': 'commits.author = users.github_username',
    'users-commits': 'users.github_username = commits.author',
    
    // Junction table: commit_interactions
    'commits-commit_interactions': 'commits.id = commit_interactions.commit_id',
    'commit_interactions-commits': 'commit_interactions.commit_id = commits.id',
    'interactions-commit_interactions': 'interactions.id = commit_interactions.interaction_id',
    'commit_interactions-interactions': 'commit_interactions.interaction_id = interactions.id',
    
    // Project scoping
    'projects-conversations': 'projects.id = conversations.project_id',
    'projects-commits': 'projects.id = commits.project_id',
  };

  const key1 = `${table1}-${table2}`;
  const key2 = `${table2}-${table1}`;

  return joinPatterns[key1] || joinPatterns[key2] || null;
}

/**
 * Build WHERE clause
 */
function buildWhereClause(
  plan: QueryPlan,
  primaryTable: string,
  projectId: string,
  errors: string[]
): string {
  const conditions: string[] = [];

  // Always add project scoping if the table has a project_id column
  if (DATABASE_PERMISSIONS.required_project_scope) {
    const tableSchema = getTableSchema(primaryTable);
    const hasProjectId = tableSchema?.columns.some(col => col.name === 'project_id');

    if (hasProjectId) {
      conditions.push(`${primaryTable}.project_id = '${projectId}'`);
    } else {
      // Check if any joined table has project_id
      for (const entity of plan.entities) {
        const schema = getTableSchema(entity);
        if (schema?.columns.some(col => col.name === 'project_id')) {
          conditions.push(`${entity}.project_id = '${projectId}'`);
          break;
        }
      }
    }
  }

  // Add intent-based filters
  if (plan.intent) {
    const intentFilters = buildIntentFilters(plan, primaryTable);
    conditions.push(...intentFilters);
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND\n      ')}` : '';
}

/**
 * Build filters based on extracted query filters
 */
function buildIntentFilters(plan: QueryPlan, primaryTable: string): string[] {
  const filters: string[] = [];
  const queryFilters = plan.filters;
  
  if (!queryFilters) {
    // Fallback to generic "recent" filter if no specific filters
    const intent = plan.intent.toLowerCase();
    if (intent.includes('recent') || intent.includes('last')) {
      const tableSchema = getTableSchema(primaryTable);
      const timeColumn = tableSchema?.columns.find(col =>
        col.name.includes('created_at') || col.name.includes('timestamp') || col.name.includes('committed_at')
      );

      if (timeColumn) {
        filters.push(`${primaryTable}.${timeColumn.name} >= NOW() - INTERVAL '30 days'`);
      }
    }
    return filters;
  }

  const tableSchema = getTableSchema(primaryTable);
  
  // Determine if we should apply commit-related filters to commits table instead of primary table
  // This happens when querying conversations/interactions but filtering by commit attributes
  const hasCommitsJoined = plan.entities.includes('commits');
  const isCommitRelatedQuery = primaryTable !== 'commits' && hasCommitsJoined;

  // Author filter
  if (queryFilters.author) {
    // Check if author filter should apply to commits (when querying conversations/interactions about commits)
    if (isCommitRelatedQuery) {
      // Apply to commits table since we're filtering by commit author
      filters.push(`commits.author ILIKE '%${queryFilters.author}%'`);
    } else {
      // Apply to primary table if it has author column
      const hasAuthor = tableSchema?.columns.some(col => col.name === 'author');
      if (hasAuthor) {
        filters.push(`${primaryTable}.author ILIKE '%${queryFilters.author}%'`);
      }
    }
    
    // Also check for github_username in joined tables
    if (plan.entities.includes('users')) {
      filters.push(`(users.github_username ILIKE '%${queryFilters.author}%' OR users.full_name ILIKE '%${queryFilters.author}%')`);
    }
  }

  // Specific date filter
  if (queryFilters.date) {
    // Determine which table's date column to use
    if (isCommitRelatedQuery) {
      // When querying conversations/interactions about commits, filter by commit date
      filters.push(`DATE(commits.committed_at) = '${queryFilters.date}'`);
    } else {
      // Use primary table's time column
      const timeColumn = tableSchema?.columns.find(col =>
        col.name.includes('created_at') || col.name.includes('timestamp') || col.name.includes('committed_at')
      );

      if (timeColumn) {
        filters.push(`DATE(${primaryTable}.${timeColumn.name}) = '${queryFilters.date}'`);
      }
    }
  }

  // Date range filter
  if (queryFilters.dateRange) {
    // Determine which table's date column to use
    if (isCommitRelatedQuery) {
      // When querying conversations/interactions about commits, filter by commit date
      if (queryFilters.dateRange.start) {
        filters.push(`commits.committed_at >= '${queryFilters.dateRange.start}'`);
      }
      if (queryFilters.dateRange.end) {
        filters.push(`commits.committed_at <= '${queryFilters.dateRange.end}'`);
      }
    } else {
      // Use primary table's time column
      const timeColumn = tableSchema?.columns.find(col =>
        col.name.includes('created_at') || col.name.includes('timestamp') || col.name.includes('committed_at')
      );

      if (timeColumn) {
        if (queryFilters.dateRange.start) {
          filters.push(`${primaryTable}.${timeColumn.name} >= '${queryFilters.dateRange.start}'`);
        }
        if (queryFilters.dateRange.end) {
          filters.push(`${primaryTable}.${timeColumn.name} <= '${queryFilters.dateRange.end}'`);
        }
      }
    }
  }

  // File name filter
  if (queryFilters.fileName && primaryTable === 'interaction_diffs') {
    filters.push(`interaction_diffs.file_path ILIKE '%${queryFilters.fileName}%'`);
  }

  // Branch filter
  if (queryFilters.branch && primaryTable === 'commits') {
    filters.push(`commits.branch = '${queryFilters.branch}'`);
  }

  // Commit hash filter
  if (queryFilters.commitHash && primaryTable === 'commits') {
    filters.push(`commits.hash LIKE '${queryFilters.commitHash}%'`);
  }

  // Text search filter
  if (queryFilters.searchText) {
    if (primaryTable === 'interactions') {
      filters.push(`(interactions.prompt_text ILIKE '%${queryFilters.searchText}%' OR interactions.response_text ILIKE '%${queryFilters.searchText}%')`);
    } else if (primaryTable === 'commits') {
      filters.push(`commits.message ILIKE '%${queryFilters.searchText}%'`);
    } else if (primaryTable === 'conversations') {
      filters.push(`conversations.title ILIKE '%${queryFilters.searchText}%'`);
    }
  }

  return filters;
}

/**
 * Build ORDER BY clause
 */
function buildOrderByClause(plan: QueryPlan, primaryTable: string): string {
  const tableSchema = getTableSchema(primaryTable);

  // Default to ordering by timestamp columns
  const timeColumn = tableSchema?.columns.find(col =>
    col.name.includes('created_at') || col.name.includes('timestamp') || col.name.includes('committed_at')
  );

  if (timeColumn) {
    return `ORDER BY ${primaryTable}.${timeColumn.name} DESC`;
  }

  return '';
}

/**
 * Validate SQL for safety
 */
function validateSQL(sql: string, errors: string[], warnings: string[]): void {
  const upperSQL = sql.toUpperCase();

  // Must be SELECT only
  if (!upperSQL.startsWith('SELECT')) {
    errors.push('Only SELECT queries are allowed');
  }

  // Check for multiple statements
  if (sql.split(';').length > 2) {
    errors.push('Multiple SQL statements are not allowed');
  }

  // Check for comments (potential SQL injection)
  if (sql.includes('--') || sql.includes('/*')) {
    warnings.push('SQL comments detected, ensure they are intentional');
  }

  // Check for UNION (potential for bypassing restrictions)
  if (upperSQL.includes('UNION')) {
    warnings.push('UNION detected, ensure it is necessary');
  }
}

/**
 * Check for dangerous keywords
 */
function checkDangerousKeywords(sql: string, errors: string[]): void {
  const upperSQL = sql.toUpperCase();
  const dangerous = DATABASE_PERMISSIONS.dangerous_keywords;

  for (const keyword of dangerous) {
    // Use word boundary regex to match whole words only
    // This prevents matching "CREATE" in "created_at"
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(sql)) {
      errors.push(`Dangerous keyword detected: ${keyword}`);
    }
  }
}

/**
 * Validate multiple query plans
 */
export function validateMultiplePlans(
  plans: QueryPlan[],
  projectId: string
): ValidationResult[] {
  return plans.map(plan => validateAndBuildSQL(plan, projectId));
}

/**
 * Sanitize user input for SQL
 */
export function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  return input
    .replace(/[;'"\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .trim();
}

/**
 * Extract entities from natural language query
 */
export function extractEntitiesFromQuery(query: string): string[] {
  const entities: string[] = [];
  const lowerQuery = query.toLowerCase();

  // Look for table names or entity references
  const tableNames = Object.keys(TABLES);
  for (const tableName of tableNames) {
    if (lowerQuery.includes(tableName.replace('_', ' ')) || lowerQuery.includes(tableName)) {
      entities.push(tableName);
    }
  }

  // Look for domain keywords
  if (lowerQuery.includes('commit')) entities.push('commits');
  if (lowerQuery.includes('conversation') || lowerQuery.includes('chat')) entities.push('conversations');
  if (lowerQuery.includes('interaction') || lowerQuery.includes('prompt')) entities.push('interactions');
  if (lowerQuery.includes('diff') || lowerQuery.includes('change')) entities.push('interaction_diffs');
  if (lowerQuery.includes('user') || lowerQuery.includes('author')) entities.push('users');

  // Remove duplicates
  return [...new Set(entities)];
}

