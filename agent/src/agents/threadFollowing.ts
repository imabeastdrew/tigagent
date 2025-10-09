import { ExplorationStream } from '../s2/client';
import { ThreadFollowingOutput, DiscoveryOutput } from '../types';
import { queryHelpers } from '../tools/sql';

/**
 * Thread Following Agent - Traces connections and builds context
 * 
 * Strategy: Follow the threads to understand relationships:
 * - Full conversation threads
 * - Commit-to-interaction mappings
 * - File change histories
 */
export async function threadFollowingAgent(
  stream: ExplorationStream,
  projectId: string
): Promise<void> {
  console.log(`[ThreadFollowing] Starting thread tracing...`);

  try {
    // 1. Read Discovery event from stream
    const events = await stream.read();
    const discoveryEvent = events.find(e => e.agent === 'discovery' && e.action === 'find_seeds');
    
    if (!discoveryEvent) {
      throw new Error('No discovery event found in stream');
    }

    const seeds = discoveryEvent.output as DiscoveryOutput;
    console.log(`[ThreadFollowing] Processing ${seeds.counts.conversations} conversations, ${seeds.counts.commits} commits, ${seeds.counts.files} files`);

    // 2. Get full conversation threads
    console.log('[ThreadFollowing] Fetching conversation threads...');
    const conversationThreads = await queryHelpers.getConversationThreads(seeds.conversation_ids);
    
    // 3. Trace commits to interactions
    console.log('[ThreadFollowing] Tracing commits to interactions...');
    const commitContext = await queryHelpers.traceCommitsToInteractions(seeds.commit_hashes);
    
    // 4. Get file change history
    console.log('[ThreadFollowing] Building file histories...');
    const fileHistory = await queryHelpers.getFileHistory(seeds.file_paths);

    // 5. Create output summary
    const output: ThreadFollowingOutput = {
      threads_found: conversationThreads.length,
      commits_traced: commitContext.length,
      files_traced: fileHistory.length,
      summary: `Traced ${conversationThreads.length} conversation threads, ` +
               `${commitContext.length} commits with context, ` +
               `${fileHistory.length} file histories`
    };

    console.log(`[ThreadFollowing] Results:`, output);

    // 6. Store full data in stream storage (check sizes first)
    const threadsSize = Buffer.byteLength(JSON.stringify(conversationThreads), 'utf8');
    const commitsSize = Buffer.byteLength(JSON.stringify(commitContext), 'utf8');
    const filesSize = Buffer.byteLength(JSON.stringify(fileHistory), 'utf8');
    
    console.log(`[ThreadFollowing] Data sizes:`);
    console.log(`  - Threads: ${(threadsSize / 1024).toFixed(1)} KB (${conversationThreads.length} items)`);
    console.log(`  - Commits: ${(commitsSize / 1024).toFixed(1)} KB (${commitContext.length} items)`);
    console.log(`  - Files: ${(filesSize / 1024).toFixed(1)} KB (${fileHistory.length} items)`);
    
    const threadsKey = await stream.put('conversation_threads', conversationThreads);
    const commitsKey = await stream.put('commit_context', commitContext);
    const filesKey = await stream.put('file_history', fileHistory);

    // 7. Write findings to stream (summary only)
    await stream.append({
      agent: 'thread_following',
      phase: 'parallel',
      action: 'trace_connections',
      output,
      storage: {
        threads: threadsKey,
        commits: commitsKey,
        files: filesKey
      },
      references: [discoveryEvent.event_id!]
    });

    console.log('[ThreadFollowing] Findings written to stream');
  } catch (error) {
    console.error('[ThreadFollowing] Error:', error);
    
    // Write error event to stream
    await stream.append({
      agent: 'thread_following',
      phase: 'parallel',
      action: 'error',
      output: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    
    throw error;
  }
}

