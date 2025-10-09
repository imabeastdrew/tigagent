import { getDb } from '../config';
import { generateQueryEmbedding } from './embeddings';

/**
 * Semantic search using interaction_embeddings table
 * Uses Voyage AI embeddings + pgvector cosine similarity
 */
export async function semanticSearch(
  query: string,
  projectId: string,
  limit: number = 20
): Promise<any[]> {
  const db = getDb();

  try {
    // Generate embedding for the query using Voyage AI
    const queryEmbedding = await generateQueryEmbedding(query);
    
    // Convert to pgvector format: '[1,2,3,...]'
    const vectorString = `[${queryEmbedding.join(',')}]`;

    // Vector similarity search using pgvector's cosine distance operator (<=>)
    // Lower distance = more similar (0 = identical, 2 = opposite)
    const result = await db.query(
      `
      SELECT 
        i.id,
        i.conversation_id,
        i.prompt_text,
        i.response_text,
        i.author,
        i.prompt_ts,
        c.title as conversation_title,
        c.platform,
        1 - (ie.embedding <=> $2::vector) as similarity
      FROM interaction_embeddings ie
      JOIN interactions i ON ie.interaction_id = i.id
      JOIN conversations c ON i.conversation_id = c.id
      WHERE c.project_id = $1
        AND ie.type = 'prompt_response'
      ORDER BY ie.embedding <=> $2::vector
      LIMIT $3
      `,
      [projectId, vectorString, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('[SemanticSearch] Error:', error);
    throw error;
  }
}

/**
 * Get embedding statistics for a query
 */
export async function getEmbeddingStats(projectId: string): Promise<any> {
  const db = getDb();

  try {
    const result = await db.query(
      `
      SELECT 
        COUNT(DISTINCT ie.interaction_id) as total_embedded_interactions,
        COUNT(*) as total_embeddings,
        COUNT(DISTINCT ie.type) as embedding_types
      FROM interaction_embeddings ie
      JOIN interactions i ON ie.interaction_id = i.id
      JOIN conversations c ON i.conversation_id = c.id
      WHERE c.project_id = $1
      `,
      [projectId]
    );

    return result.rows[0];
  } catch (error) {
    console.error('[EmbeddingStats] Error:', error);
    return { total_embedded_interactions: 0, total_embeddings: 0, embedding_types: 0 };
  }
}

