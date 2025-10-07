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
  "conversations": ["projects"],
  "projects": [],
  "users": []
};

/**
 * Get columns for a specific entity
 */
export function getEntityColumns(entityName: string): string[] {
  const entity = ENTITY_DEFINITIONS[entityName as keyof typeof ENTITY_DEFINITIONS];
  return entity ? Object.keys(entity.columns) : [];
}

/**
 * Check if a join between two entities is allowed
 */
export function isValidJoin(leftTable: string, rightTable: string): boolean {
  const allowedJoins = ALLOWED_JOINS[leftTable as keyof typeof ALLOWED_JOINS];
  return allowedJoins ? (allowedJoins as string[]).includes(rightTable) : false;
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
 * Get foreign key relationship between tables
 */
export function getForeignKeyRelationship(leftTable: string, rightTable: string): { leftColumn: string; rightColumn: string } | null {
  const leftEntity = ENTITY_DEFINITIONS[leftTable as keyof typeof ENTITY_DEFINITIONS];
  if (!leftEntity) return null;
  
  const foreignKey = (leftEntity.foreign_keys as any)[rightTable];
  if (!foreignKey) return null;
  
  // Extract the column name from the foreign key reference
  const rightColumn = foreignKey.split('.')[1];
  const leftColumn = Object.keys(leftEntity.foreign_keys).find(key => 
    (leftEntity.foreign_keys as any)[key] === foreignKey
  );
  
  return leftColumn && rightColumn ? { leftColumn, rightColumn } : null;
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

RESTRICTED COLUMNS (must be redacted):
- users.email
- users.auth_user_id

SAFETY RULES:
- All queries must include project_id filter
- Default time window is 30 days if not specified
- Maximum 200 rows per query
- No mutations allowed (SELECT only)
- Use parameterized queries only
`;
