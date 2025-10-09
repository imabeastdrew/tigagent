import { VoyageAIClient } from 'voyageai';

let voyageClient: VoyageAIClient | null = null;

/**
 * Get or create Voyage AI client instance
 */
function getVoyageClient(): VoyageAIClient {
  if (!voyageClient) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error('VOYAGE_API_KEY environment variable not set');
    }
    voyageClient = new VoyageAIClient({ apiKey });
  }
  return voyageClient;
}

/**
 * Generate embedding for a search query using Voyage AI
 * 
 * Uses voyage-3-large model:
 * - 1024 dimensions (matches interaction_embeddings table)
 * - Optimized for semantic search
 * - Input type set to 'query' for search optimization
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  try {
    const client = getVoyageClient();
    
    const result = await client.embed({
      input: [text],
      model: 'voyage-3-large',
      inputType: 'query'  // Optimized for search queries vs documents
    });
    
    if (!result.data || !result.data[0] || !result.data[0].embedding) {
      throw new Error('Invalid response from Voyage AI');
    }
    
    return result.data[0].embedding;
  } catch (error) {
    console.error('[VoyageAI] Error generating embedding:', error);
    throw new Error(`Failed to generate query embedding: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate embeddings for multiple texts (batch operation)
 * Useful for embedding documents or large datasets
 */
export async function generateBatchEmbeddings(
  texts: string[],
  inputType: 'query' | 'document' = 'document'
): Promise<number[][]> {
  try {
    const client = getVoyageClient();
    
    const result = await client.embed({
      input: texts,
      model: 'voyage-3-large',
      inputType
    });
    
    if (!result.data || result.data.length !== texts.length) {
      throw new Error('Invalid response from Voyage AI');
    }
    
    return result.data.map(item => {
      if (!item.embedding) {
        throw new Error('Missing embedding in Voyage AI response');
      }
      return item.embedding;
    });
  } catch (error) {
    console.error('[VoyageAI] Error generating batch embeddings:', error);
    throw new Error(`Failed to generate batch embeddings: ${error instanceof Error ? error.message : String(error)}`);
  }
}

