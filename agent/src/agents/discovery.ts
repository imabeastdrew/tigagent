import { ExplorationStream } from '../s2/client';
import { DiscoveryOutput } from '../types';
import { semanticSearch } from '../tools/semantic';
import { executeSqlQuery } from '../tools/sql';

/**
 * Discovery Agent - Finds seeds for exploration
 * 
 * Strategy: Cast a wide net to find all potentially relevant:
 * - Interactions (conversations)
 * - Commits
 * - Files
 * - People
 */
export async function discoveryAgent(
  query: string,
  stream: ExplorationStream,
  projectId: string
): Promise<void> {
  console.log(`[Discovery] Starting discovery for: "${query}"`);

  try {
    // 1. Semantic search for relevant interactions using Voyage AI embeddings
    console.log('[Discovery] Running semantic search...');
    const semanticResults = await semanticSearch(query, projectId, 50);
    console.log(`[Discovery] Semantic search found ${semanticResults.length} interactions`);
    
    if (semanticResults.length > 0) {
      const topSimilarity = (semanticResults[0].similarity * 100).toFixed(1);
      console.log(`[Discovery] Top similarity: ${topSimilarity}%`);
    }

    // 2. Extract unique entities from semantic search results
    const interaction_ids = [...new Set(semanticResults.map(r => r.id))];
    const conversation_ids = [...new Set(semanticResults.map(r => r.conversation_id).filter(Boolean))];
    const people = [...new Set(semanticResults.map(r => r.author).filter(Boolean))];

    // 3. Get related commits and files for these interactions
    console.log('[Discovery] Fetching related commits and files...');
    const relatedData = interaction_ids.length > 0 ? await executeSqlQuery(
      `
      SELECT DISTINCT 
        c.hash as commit_hash,
        c.author as commit_author,
        id2.file_path
      FROM interactions i
      LEFT JOIN commit_interactions ci ON i.id = ci.interaction_id
      LEFT JOIN commits c ON ci.commit_id = c.id
      LEFT JOIN interaction_diffs id2 ON i.id = id2.interaction_id
      WHERE i.id = ANY($1)
      `,
      [interaction_ids]
    ) : [];

    const commit_hashes = [...new Set(relatedData.map(r => r.commit_hash).filter(Boolean))];
    const file_paths = [...new Set(relatedData.map(r => r.file_path).filter(Boolean))];
    const commitAuthors = [...new Set(relatedData.map(r => r.commit_author).filter(Boolean))];
    
    // Combine all people and deduplicate
    people.push(...commitAuthors);
    const uniquePeople = [...new Set(people)];
    
    // 4. IMPORTANT: Also fetch commits directly by people found in semantic search
    // This ensures we get commits from people mentioned in conversations even if
    // those commits aren't linked to the top semantic search results
    if (uniquePeople.length > 0) {
      console.log(`[Discovery] Fetching commits by identified people: ${uniquePeople.join(', ')}`);
      const authorCommits = await executeSqlQuery(
        `
        SELECT DISTINCT
          c.hash as commit_hash,
          c.author as commit_author,
          c.message as commit_message,
          c.committed_at as commit_timestamp
        FROM commits c
        WHERE c.project_id = $1
          AND c.author = ANY($2)
        ORDER BY c.committed_at DESC
        LIMIT 50
        `,
        [projectId, uniquePeople]
      );
      
      console.log(`[Discovery] Found ${authorCommits.length} commits by identified authors`);
      
      // Debug: Show author breakdown
      const authorBreakdown: { [key: string]: number } = {};
      authorCommits.forEach(c => {
        authorBreakdown[c.commit_author] = (authorBreakdown[c.commit_author] || 0) + 1;
      });
      console.log(`[Discovery] Author breakdown:`, authorBreakdown);
      
      // Merge with existing commit data
      const newCommitHashes = authorCommits.map(r => r.commit_hash).filter(Boolean);
      const beforeMerge = commit_hashes.length;
      commit_hashes.push(...newCommitHashes.filter(h => !commit_hashes.includes(h)));
      console.log(`[Discovery] Added ${commit_hashes.length - beforeMerge} new commit hashes from author query`);
    }

    // 5. Create output summary
    const output: DiscoveryOutput = {
      interaction_ids,
      conversation_ids,
      commit_hashes,
      file_paths,
      people: uniquePeople,
      counts: {
        interactions: interaction_ids.length,
        conversations: conversation_ids.length,
        commits: commit_hashes.length,
        files: file_paths.length
      }
    };

    console.log(`[Discovery] Found:`, output.counts);
    console.log(`[Discovery] Commit hashes collected:`, commit_hashes.length);

    // 6. Store full semantic search results in stream storage
    const semanticStorageKey = await stream.put('semantic_results', semanticResults);
    const relatedDataStorageKey = await stream.put('related_data', relatedData);

    // 7. Write seed event to stream (summary only, not full data)
    await stream.append({
      agent: 'discovery',
      phase: 'discovery',
      action: 'find_seeds',
      output,
      storage: {
        semantic_results: semanticStorageKey,
        related_data: relatedDataStorageKey
      }
    });

    console.log('[Discovery] Seeds written to stream');
  } catch (error) {
    console.error('[Discovery] Error:', error);
    
    // Write error event to stream
    await stream.append({
      agent: 'discovery',
      phase: 'discovery',
      action: 'error',
      output: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    
    throw error;
  }
}

