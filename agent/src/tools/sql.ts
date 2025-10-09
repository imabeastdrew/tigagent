import { getDb } from '../config';

/**
 * Execute SQL query with safety checks
 */
export async function executeSqlQuery(
  query: string,
  params: any[] = []
): Promise<any[]> {
  const db = getDb();

  // Basic safety checks
  const normalizedQuery = query.toLowerCase().trim();
  
  // Block dangerous operations
  const dangerousPatterns = [
    'drop table',
    'drop database',
    'truncate',
    'delete from',
    'update ',
    'insert into',
    'alter table',
    'create table'
  ];

  for (const pattern of dangerousPatterns) {
    if (normalizedQuery.includes(pattern)) {
      throw new Error(`Dangerous SQL operation not allowed: ${pattern}`);
    }
  }

  // Must be a SELECT query
  if (!normalizedQuery.startsWith('select') && !normalizedQuery.startsWith('with')) {
    throw new Error('Only SELECT queries are allowed');
  }

  try {
    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('[SQL] Query error:', error);
    console.error('[SQL] Query was:', query);
    console.error('[SQL] Params:', params);
    throw error;
  }
}

/**
 * Common query helpers
 */
export const queryHelpers = {
  /**
   * Get conversation threads by IDs (with truncated text to avoid payload size issues)
   */
  async getConversationThreads(conversationIds: string[]): Promise<any[]> {
    if (conversationIds.length === 0) return [];
    
    return executeSqlQuery(
      `
      SELECT 
        c.id as conversation_id,
        c.title,
        c.created_at,
        json_agg(
          json_build_object(
            'id', i.id,
            'prompt_preview', LEFT(i.prompt_text, 300),
            'response_preview', LEFT(i.response_text, 300),
            'author', i.author,
            'timestamp', i.prompt_ts
          ) ORDER BY i.prompt_ts
        ) as thread
      FROM conversations c
      JOIN interactions i ON c.id = i.conversation_id
      WHERE c.id = ANY($1)
      GROUP BY c.id
      `,
      [conversationIds]
    );
  },

  /**
   * Trace commits to interactions (metadata only, no full text)
   */
  async traceCommitsToInteractions(commitHashes: string[]): Promise<any[]> {
    if (commitHashes.length === 0) return [];

    return executeSqlQuery(
      `
      SELECT 
        c.hash,
        c.message,
        c.author,
        c.committed_at,
        json_agg(
          json_build_object(
            'interaction_id', i.id,
            'conversation_id', i.conversation_id,
            'author', i.author,
            'timestamp', i.prompt_ts
          )
        ) as related_interactions
      FROM commits c
      LEFT JOIN commit_interactions ci ON c.id = ci.commit_id
      LEFT JOIN interactions i ON ci.interaction_id = i.id
      WHERE c.hash = ANY($1)
      GROUP BY c.id
      `,
      [commitHashes]
    );
  },

  /**
   * Get file change history (with diff stats only, not full diffs)
   */
  async getFileHistory(filePaths: string[]): Promise<any[]> {
    if (filePaths.length === 0) return [];

    return executeSqlQuery(
      `
      SELECT 
        id2.file_path,
        json_agg(
          json_build_object(
            'interaction_id', i.id,
            'diff_size', LENGTH(id2.diff_chunks::text),
            'has_changes', CASE WHEN id2.diff_chunks IS NOT NULL THEN true ELSE false END,
            'author', i.author,
            'timestamp', i.prompt_ts,
            'conversation_id', i.conversation_id
          ) ORDER BY i.prompt_ts
        ) as change_history
      FROM interaction_diffs id2
      JOIN interactions i ON id2.interaction_id = i.id
      WHERE id2.file_path = ANY($1)
      GROUP BY id2.file_path
      `,
      [filePaths]
    );
  },

  /**
   * Analyze temporal patterns
   */
  async analyzeTimeline(interactionIds: string[]): Promise<any> {
    if (interactionIds.length === 0) return { timeline: [], commitTimeline: [] };

    const timeline = await executeSqlQuery(
      `
      SELECT 
        DATE(i.prompt_ts) as date,
        COUNT(*) as interaction_count,
        array_agg(DISTINCT i.author) as authors_active,
        array_agg(i.id) as interaction_ids
      FROM interactions i
      WHERE i.id = ANY($1)
      GROUP BY DATE(i.prompt_ts)
      ORDER BY date
      `,
      [interactionIds]
    );

    return { timeline };
  },

  /**
   * Get commit timeline
   */
  async getCommitTimeline(commitHashes: string[]): Promise<any[]> {
    if (commitHashes.length === 0) return [];

    return executeSqlQuery(
      `
      SELECT 
        DATE(committed_at) as date,
        COUNT(*) as commit_count,
        array_agg(message) as commit_messages,
        array_agg(author) as authors
      FROM commits
      WHERE hash = ANY($1)
      GROUP BY DATE(committed_at)
      ORDER BY date
      `,
      [commitHashes]
    );
  }
};

