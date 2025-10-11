/**
 * Semantic Search Tool for SQL Agent
 * 
 * Uses Voyage AI embeddings and existing interaction_embeddings table
 * for proper vector similarity search.
 */

import { VoyageAIClient } from 'voyageai';
import { getDb, createAnthropicClient } from './simpleConfig';
import { Interaction } from './simpleTypes';

// Initialize Voyage AI client
const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

export interface SemanticSearchResult {
  interaction: Interaction;
  similarity_score: number;
  matched_text: string;
  context_snippet: string;
}

export interface SemanticSearchTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: {
      query: {
        type: string;
        description: string;
      };
      project_id: {
        type: string;
        description: string;
      };
      limit: {
        type: string;
        description: string;
        default: number;
      };
    };
    required: string[];
  };
}

export const semanticSearchTool: SemanticSearchTool = {
  name: 'semantic_search',
  description: 'Find interactions that are semantically similar to a query using Voyage AI embeddings and vector similarity search.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The natural language query to search for semantically similar interactions.'
      },
      project_id: {
        type: 'string',
        description: 'The ID of the project to search within.'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 3).',
        default: 3
      }
    },
    required: ['query', 'project_id']
  }
};

/**
 * Generate embedding for text using Voyage AI
 */
async function generateVoyageEmbedding(text: string): Promise<number[]> {
  try {
    const response = await voyage.embed({
      input: [text],
      model: 'voyage-3-large',
      inputType: 'query'
    });
    
    if (response.data && response.data.length > 0 && response.data[0].embedding) {
      return response.data[0].embedding;
    }
    
    throw new Error('No embedding returned from Voyage AI');
  } catch (error) {
    console.error('Voyage AI embedding error:', error);
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Execute iterative semantic search - runs 3 searches in sequence, reformulating query based on results
 */
export async function executeSemanticSearch(
  query: string,
  projectId: string,
  limit: number = 3
): Promise<SemanticSearchResult[]> {
  const db = getDb();
  
  try {
    console.log(`[Semantic Search] Starting iterative search for: "${query}" in project ${projectId}`);
    
    let currentQuery = query;
    let allResults: SemanticSearchResult[] = [];
    const seenInteractionIds = new Set<string>();
    
    // Run 3 iterative searches
    for (let iteration = 1; iteration <= 3; iteration++) {
      console.log(`[Semantic Search] Iteration ${iteration}: "${currentQuery}"`);
      
      // Generate embedding for the current query
      const queryEmbedding = await generateVoyageEmbedding(currentQuery);
      
      // Get all existing embeddings for the project
      const result = await db.query(`
        SELECT 
          ie.embedding_id,
          ie.type,
          ie.chunk_id,
          ie.embedding,
          i.id as interaction_id,
          i.conversation_id,
          i.prompt_text,
          i.response_text,
          i.prompt_ts,
          i.request_id,
          i.created_at,
          i.response_bubbles,
          i.model,
          i.author,
          c.title as conversation_title,
          c.platform
        FROM interaction_embeddings ie
        JOIN interactions i ON ie.interaction_id = i.id
        JOIN conversations c ON i.conversation_id = c.id
        WHERE c.project_id = $1
        AND ie.type = 'prompt_response'
        ORDER BY i.created_at DESC
        LIMIT 1000
      `, [projectId]);
      
      if (result.rows.length === 0) {
        console.log(`[Semantic Search] No embeddings found in iteration ${iteration}`);
        break;
      }
      
      // Calculate similarities with existing embeddings
      const similarities: SemanticSearchResult[] = [];
      
      for (const row of result.rows) {
        try {
          // Skip if we've already seen this interaction
          if (seenInteractionIds.has(row.interaction_id)) {
            continue;
          }
          
          // Parse the stored embedding
          let storedEmbedding: number[];
          
          if (typeof row.embedding === 'string') {
            storedEmbedding = JSON.parse(row.embedding);
          } else if (Array.isArray(row.embedding)) {
            storedEmbedding = row.embedding;
          } else {
            console.warn(`[Semantic Search] Unknown embedding format for ${row.embedding_id}`);
            continue;
          }
          
          const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);
          
          // Create interaction object
          const interaction: Interaction = {
            id: row.interaction_id,
            conversation_id: row.conversation_id,
            prompt_text: row.prompt_text,
            response_text: row.response_text,
            created_at: row.created_at,
            author: row.author,
            project_id: projectId,
            prompt_ts: row.prompt_ts,
            conversation_title: row.conversation_title,
            platform: row.platform
          };
          
          const combinedText = `${row.prompt_text} ${row.response_text}`;
          const contextSnippet = combinedText.substring(0, 200) + '...';
          
          similarities.push({
            interaction,
            similarity_score: similarity,
            matched_text: 'prompt_response',
            context_snippet: contextSnippet
          });
        } catch (error) {
          console.warn(`[Semantic Search] Error processing embedding ${row.embedding_id}:`, error);
          continue;
        }
      }
      
      // Sort by similarity and get top results for this iteration
      const iterationResults = similarities
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, limit);
      
      console.log(`[Semantic Search] Iteration ${iteration} found ${iterationResults.length} new results`);
      
      // Add new results to our collection (avoid duplicates)
      for (const result of iterationResults) {
        if (!seenInteractionIds.has(result.interaction.id)) {
          allResults.push(result);
          seenInteractionIds.add(result.interaction.id);
          console.log(`[Semantic Search] Added new result: ${result.interaction.id} (similarity: ${result.similarity_score.toFixed(4)})`);
        } else {
          console.log(`[Semantic Search] Skipped duplicate: ${result.interaction.id}`);
        }
      }
      
      // If this is not the last iteration, reformulate the query based on results
      if (iteration < 3 && iterationResults.length > 0) {
        currentQuery = await reformulateQuery(query, iterationResults, iteration);
        console.log(`[Semantic Search] Reformulated query for iteration ${iteration + 1}: "${currentQuery}"`);
      }
    }
    
    // Sort all results by similarity and return top N
    const finalResults = allResults
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, limit);
    
    console.log(`[Semantic Search] Completed iterative search: ${finalResults.length} total unique results`);
    
    return finalResults;
    
  } catch (error) {
    console.error('[Semantic Search] Error:', error);
    throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Reformulate the search query based on previous results
 */
async function reformulateQuery(
  originalQuery: string, 
  previousResults: SemanticSearchResult[], 
  iteration: number
): Promise<string> {
  const client = createAnthropicClient();
  
  try {
    // Extract key terms from the previous results
    const contextTerms = previousResults.map(result => {
      const text = `${result.interaction.prompt_text} ${result.interaction.response_text}`;
      return text.substring(0, 100) + '...';
    }).join('\n');
    
    const systemPrompt = `You are an expert at reformulating search queries. Create a new search query based on the original query and results found.

IMPORTANT: Return ONLY the search query (2-4 words max), no explanations or rationale.

Examples:
- Original: "authentication" → New: "login security"
- Original: "billing" → New: "pricing subscription"  
- Original: "UI changes" → New: "components interface"`;

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 20,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Original: "${originalQuery}"

Results: ${contextTerms.substring(0, 200)}...

New query (2-4 words only):`
      }]
    });

    let newQuery = response.content[0].type === 'text' ? response.content[0].text.trim() : originalQuery;
    
    // Clean up the response - extract just the query if it contains explanations
    const lines = newQuery.split('\n');
    for (const line of lines) {
      const cleanLine = line.trim().replace(/^["']|["']$/g, ''); // Remove quotes
      if (cleanLine.length > 0 && cleanLine.length < 50 && !cleanLine.includes(':')) {
        newQuery = cleanLine;
        break;
      }
    }
    
    // Fallback to original query if reformulation fails
    return newQuery || originalQuery;
    
  } catch (error) {
    console.warn('[Semantic Search] Failed to reformulate query:', error);
    return originalQuery;
  }
}

/**
 * Find semantically similar interactions (legacy function for compatibility)
 */
export async function findSimilarInteractions(
  query: string,
  projectId: string,
  limit: number = 3
): Promise<SemanticSearchResult[]> {
  return executeSemanticSearch(query, projectId, limit);
}