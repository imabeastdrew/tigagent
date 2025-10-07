/**
 * Tig Database Ontology
 * 
 * Defines the schema structure for the Tig Agent SDK based on the Postgres tables.
 * This ontology is used by planner agents to understand available entities, columns,
 * and relationships for generating safe SQL queries.
 */

/**
 * Entity definitions with their columns and types
 */
export const ENTITY_DEFINITIONS = {
  commits: {
    table: "commits",
    columns: {
      id: "uuid",
      hash: "text",
      message: "text", 
      committed_at: "timestamp with time zone",
      created_at: "timestamp with time zone",
      project_id: "uuid",
      branch: "text",
      author: "text"
    },
    primary_key: "id",
    foreign_keys: {
      project_id: "projects.id"
    }
  },
  
  interactions: {
    table: "interactions",
    columns: {
      id: "uuid",
      conversation_id: "uuid",
      prompt_text: "text",
      response_text: "text",
      prompt_ts: "timestamp with time zone",
      request_id: "text",
      created_at: "timestamp with time zone",
      response_bubbles: "jsonb",
      model: "text",
      author: "text"
    },
    primary_key: "id",
    foreign_keys: {
      conversation_id: "conversations.id"
    }
  },
  
  conversations: {
    table: "conversations", 
    columns: {
      id: "uuid",
      composer_id: "text",
      title: "text",
      created_at: "timestamp with time zone",
      project_id: "uuid",
      platform: "text"
    },
    primary_key: "id",
    foreign_keys: {
      project_id: "projects.id"
    }
  },
  
  projects: {
    table: "projects",
    columns: {
      id: "uuid",
      created_at: "timestamp with time zone",
      github_repo_id: "bigint",
      repo_owner: "text",
      repo_name: "text"
    },
    primary_key: "id",
    foreign_keys: {}
  },
  
  users: {
    table: "users",
    columns: {
      id: "uuid",
      auth_user_id: "uuid",
      github_id: "bigint",
      github_username: "text",
      full_name: "text",
      email: "text",
      company: "text",
      created_at: "timestamp with time zone",
      updated_at: "timestamp with time zone",
      onboarding_completed: "boolean",
      chats_saved: "integer",
      show_tool_bubbles_beta: "boolean"
    },
    primary_key: "id",
    foreign_keys: {
      auth_user_id: "auth.users.id"
    }
  }
};

/**
 * Columns that should be redacted for privacy/security
 */
export const RESTRICTED_COLUMNS = [
  "users.email",
  "users.auth_user_id"
];

/**
 * Allowed joins between entities
 */
export const ALLOWED_JOINS = {
  "commits": ["projects"],
  "interactions": ["conversations", "projects"],
  "conversations": ["projects", "interactions"],
  "projects": ["commits", "conversations", "interactions"],
  "users": ["commits", "interactions"]
};

/**
 * Get columns for a specific entity
 */
export function getEntityColumns(entityName: string): string[] {
  const entity = ENTITY_DEFINITIONS[entityName as keyof typeof ENTITY_DEFINITIONS];
  return entity ? Object.keys(entity.columns) : [];
}

/**
 * Check if a join between two entities is allowed (bidirectional)
 */
export function isValidJoin(leftTable: string, rightTable: string): boolean {
  // Check left → right
  const allowedJoins = ALLOWED_JOINS[leftTable as keyof typeof ALLOWED_JOINS];
  if (allowedJoins && (allowedJoins as string[]).includes(rightTable)) {
    return true;
  }
  
  // Check right → left (bidirectional)
  const reverseAllowedJoins = ALLOWED_JOINS[rightTable as keyof typeof ALLOWED_JOINS];
  if (reverseAllowedJoins && (reverseAllowedJoins as string[]).includes(leftTable)) {
    return true;
  }
  
  return false;
}

/**
 * Get restricted columns list
 */
export function getRestrictedColumns(): string[] {
  return [...RESTRICTED_COLUMNS];
}

/**
 * Check if a column is restricted
 */
export function isRestrictedColumn(tableName: string, columnName: string): boolean {
  const fullColumnName = `${tableName}.${columnName}`;
  return RESTRICTED_COLUMNS.includes(fullColumnName);
}

/**
 * Text-based join relationships (author field matching)
 */
export const TEXT_BASED_JOINS = {
  "users.github_username": ["commits.author", "interactions.author"]
};

/**
 * Allowed aggregation functions
 */
export const ALLOWED_AGGREGATIONS = ["COUNT", "MAX", "MIN", "AVG", "SUM"];

/**
 * Aggregation rules by data type
 */
export const AGGREGATION_RULES = {
  numeric_only: ["AVG", "SUM"],
  all_types: ["COUNT", "MAX", "MIN"]
};

/**
 * Get foreign key relationship between tables
 */
export function getForeignKeyRelationship(leftTable: string, rightTable: string): { leftColumn: string; rightColumn: string } | null {
  const leftEntity = ENTITY_DEFINITIONS[leftTable as keyof typeof ENTITY_DEFINITIONS];
  if (!leftEntity) return null;
  
  // Look for a foreign key that references the right table
  const foreignKeyEntry = Object.entries(leftEntity.foreign_keys).find(([column, reference]) => 
    reference.startsWith(`${rightTable}.`)
  );
  
  if (!foreignKeyEntry) return null;
  
  const [leftColumn, foreignKey] = foreignKeyEntry;
  const rightColumn = foreignKey.split('.')[1];
  
  return { leftColumn, rightColumn };
}

/**
 * Get text-based join condition between tables
 */
export function getTextJoinCondition(leftTable: string, rightTable: string): { leftColumn: string; rightColumn: string; isTextBased: boolean } | null {
  // Check if this is a text-based join (users to commits/interactions via author)
  if (leftTable === "users" && (rightTable === "commits" || rightTable === "interactions")) {
    return {
      leftColumn: "github_username",
      rightColumn: "author",
      isTextBased: true
    };
  }
  
  // Check reverse direction
  if ((leftTable === "commits" || leftTable === "interactions") && rightTable === "users") {
    return {
      leftColumn: "author",
      rightColumn: "github_username",
      isTextBased: true
    };
  }
  
  return null;
}

/**
 * Formatted ontology text for inclusion in agent instructions
 */
export const ONTOLOGY_TEXT = `
Tig Database Schema:

ENTITIES:
- commits: id, hash, message, committed_at, created_at, project_id, branch, author
- interactions: id, conversation_id, prompt_text, response_text, prompt_ts, request_id, created_at, response_bubbles, model, author  
- conversations: id, composer_id, title, created_at, project_id, platform
- projects: id, created_at, github_repo_id, repo_owner, repo_name
- users: id, auth_user_id, github_id, github_username, full_name, email, company, created_at, updated_at, onboarding_completed, chats_saved, show_tool_bubbles_beta

RELATIONSHIPS:
- commits.project_id → projects.id
- interactions.conversation_id → conversations.id  
- conversations.project_id → projects.id
- users.auth_user_id → auth.users.id

CROSS-DOMAIN RELATIONSHIPS:
- users.github_username = commits.author (text-based join)
- users.github_username = interactions.author (text-based join)
- projects.id ← commits.project_id (reverse join)
- projects.id ← conversations.project_id (reverse join)

AGGREGATION SUPPORT:
- COUNT: Count rows or non-null values
- MAX/MIN: Find maximum/minimum values
- AVG/SUM: Average and sum (numeric columns only)
- GROUP BY: Group results by specified columns

CROSS-DOMAIN QUERY EXAMPLES:
- "Who built X?" → users + commits (via author field)
- "Which project has most commits?" → projects + commits (with COUNT)
- "Show me commits by John" → commits + users (via author field)
- "What AI conversations did Sarah have?" → users + interactions (via author field)

RESTRICTED COLUMNS (must be redacted):
- users.email
- users.auth_user_id

SAFETY RULES:
- All queries must include project_id filter
- Default time window is 30 days if not specified
- Maximum 200 rows per query
- Maximum 3 table joins per query
- No mutations allowed (SELECT only)
- Use parameterized queries only
`;
