/**
 * Agent v2 Database Ontology
 * 
 * Defines the schema structure for Agent v2 based on the Postgres tables.
 * This ontology provides exact column names and relationships for Sonnet 4.5
 * to generate accurate SQL queries without guessing.
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
  
  interaction_diffs: {
    table: "interaction_diffs",
    columns: {
      id: "uuid",
      interaction_id: "uuid",
      file_path: "text",
      diff_chunks: "jsonb",
      created_at: "timestamp with time zone"
    },
    primary_key: "id",
    foreign_keys: {
      interaction_id: "interactions.id"
    }
  }
};

/**
 * Columns that should be redacted for privacy/security
 */
export const RESTRICTED_COLUMNS: string[] = [];

/**
 * Allowed joins between entities
 */
export const ALLOWED_JOINS = {
  "commits": ["projects"],
  "interactions": ["conversations", "interaction_diffs"],
  "conversations": ["projects", "interactions"],
  "projects": ["commits", "conversations"],
  "interaction_diffs": ["interactions"]
};

/**
 * Text-based join relationships (author field matching)
 */
export const TEXT_BASED_JOINS = {
  "commits.author": ["interactions.author"]
};

/**
 * Allowed aggregation functions
 */
export const ALLOWED_AGGREGATIONS = ["COUNT", "MAX", "MIN", "AVG", "SUM"];

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
  // Check if this is a text-based join (commits to interactions via author)
  if (leftTable === "commits" && rightTable === "interactions") {
    return {
      leftColumn: "author",
      rightColumn: "author",
      isTextBased: true
    };
  }
  
  // Check reverse direction
  if (leftTable === "interactions" && rightTable === "commits") {
    return {
      leftColumn: "author",
      rightColumn: "author",
      isTextBased: true
    };
  }
  
  return null;
}

/**
 * Formatted schema text for inclusion in Sonnet 4.5 prompts
 */
export const SCHEMA_TEXT = `
DATABASE SCHEMA:

TABLES AND COLUMNS:
- commits: id (uuid), hash (text), message (text), committed_at (timestamp), created_at (timestamp), project_id (uuid), branch (text), author (text)
- interactions: id (uuid), conversation_id (uuid), prompt_text (text), response_text (text), prompt_ts (timestamp), request_id (text), created_at (timestamp), response_bubbles (jsonb), model (text), author (text)
- conversations: id (uuid), composer_id (text), title (text), created_at (timestamp), project_id (uuid), platform (text)
- projects: id (uuid), created_at (timestamp), github_repo_id (bigint), repo_owner (text), repo_name (text)
- interaction_diffs: id (uuid), interaction_id (uuid), file_path (text), diff_chunks (jsonb), created_at (timestamp)

FOREIGN KEY RELATIONSHIPS:
- commits.project_id → projects.id
- interactions.conversation_id → conversations.id
- conversations.project_id → projects.id
- interaction_diffs.interaction_id → interactions.id

TEXT-BASED JOINS:
- commits.author = interactions.author (both are text fields containing github usernames)

CRITICAL COLUMN NAMES (use these exact names):
- interactions.prompt_text (NOT prompt, user_message, input, or content)
- interactions.response_text (NOT response, assistant_message, or content)
- commits.hash (NOT sha, commit_sha, or commit_hash)
- interaction_diffs.diff_chunks (NOT old_code, new_code, additions, or deletions - it's a single jsonb column)
- conversations.title (NOT name or subject)
- projects.repo_owner and projects.repo_name (NOT owner or name)

SECURITY RULES:
- Always include project_id filter in WHERE clause for security
- Use parameterized queries with $1, $2, etc.
- Maximum 200 rows per query
- No mutations allowed (SELECT only)
- Use ILIKE for case-insensitive text searches with % wildcards

QUERY EXAMPLES:
- Find interactions about auth: SELECT i.id, i.prompt_text, i.response_text FROM interactions i JOIN conversations c ON i.conversation_id = c.id WHERE c.project_id = $1 AND (i.prompt_text ILIKE '%auth%' OR i.response_text ILIKE '%auth%')
- Find commits by author: SELECT c.id, c.hash, c.message, c.author FROM commits c WHERE c.project_id = $1 AND c.message ILIKE '%auth%'
- Find files in auth discussions: SELECT id.file_path, id.diff_chunks FROM interaction_diffs id JOIN interactions i ON id.interaction_id = i.id JOIN conversations c ON i.conversation_id = c.id WHERE c.project_id = $1 AND (i.prompt_text ILIKE '%auth%' OR i.response_text ILIKE '%auth%')
`;

/**
 * Get a simplified schema description for quick reference
 */
export function getSchemaDescription(): string {
  return SCHEMA_TEXT;
}

/**
 * Validate that a column exists in a table
 */
export function isValidColumn(tableName: string, columnName: string): boolean {
  const entity = ENTITY_DEFINITIONS[tableName as keyof typeof ENTITY_DEFINITIONS];
  if (!entity) return false;
  return columnName in entity.columns;
}

/**
 * Get all available tables
 */
export function getAvailableTables(): string[] {
  return Object.keys(ENTITY_DEFINITIONS);
}
