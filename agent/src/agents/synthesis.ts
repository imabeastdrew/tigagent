import { ExplorationStream } from '../s2/client';
import { createAnthropicClient, AGENT_MODELS, AGENT_PROMPTS } from '../config';

/**
 * Synthesis Agent - Directly answers the query using all findings
 * 
 * Strategy:
 * - Read findings from Discovery, Thread Following, Knowledge Mining, Temporal Context
 * - Use Claude Sonnet 4.5 to synthesize a direct, conversational answer
 * - Cite specific people, conversations, commits, files, and dates
 * - Suggest 3-5 follow-up questions based on discovered patterns
 * 
 * Output: Natural language answer + follow-up questions (not a structured brief)
 */
export async function synthesisAgent(
  stream: ExplorationStream,
  projectId: string,
  originalQuery: string
): Promise<string> {
  console.log(`[Synthesis] Starting synthesis for query: "${originalQuery}"`);

  try {
    // 1. Read entire stream (all events)
    const events = await stream.read();
    console.log(`[Synthesis] Processing ${events.length} events from stream`);

    // 2. Find all agent findings
    const discovery = events.find(e => e.agent === 'discovery' && e.action === 'find_seeds');
    const threadFollowing = events.find(e => e.agent === 'thread_following' && e.action === 'trace_connections');
    const knowledgeMining = events.find(e => e.agent === 'knowledge_mining' && e.action === 'extract_knowledge');
    const temporal = events.find(e => e.agent === 'temporal_context' && e.action === 'analyze_timeline');

    if (!discovery) {
      throw new Error('No discovery findings in stream');
    }

    // 3. Retrieve stored data
    console.log('[Synthesis] Retrieving detailed findings...');
    
    const discoveryOutput = discovery.output;
    
    // Get conversation threads (if available)
    let conversationThreads = null;
    if (threadFollowing?.storage?.threads) {
      conversationThreads = await stream.get(threadFollowing.storage.threads);
    }

    // Get commit context (if available)
    let commitContext = null;
    if (threadFollowing?.storage?.commits) {
      commitContext = await stream.get(threadFollowing.storage.commits);
    }

    // Get knowledge analysis (if available)
    let knowledgeAnalysis = null;
    if (knowledgeMining?.storage?.analysis) {
      knowledgeAnalysis = await stream.get(knowledgeMining.storage.analysis);
    }

    // Get timeline data (if available)
    let timelineData = null;
    if (temporal?.storage?.timeline) {
      timelineData = await stream.get(temporal.storage.timeline);
    }

    // 4. Prepare summary of findings for Claude
    const findingsSummary = {
      query: originalQuery,
      discovery: {
        counts: discoveryOutput.counts,
        people: discoveryOutput.people?.slice(0, 10) || [],
        files: discoveryOutput.file_paths?.slice(0, 10) || []
      },
      threads: conversationThreads ? {
        count: conversationThreads.length,
        sample: conversationThreads.slice(0, 3)
      } : null,
      commits: commitContext ? {
        count: commitContext.length,
        sample: commitContext.slice(0, 5)
      } : null,
      knowledge: knowledgeAnalysis,
      timeline: temporal?.output || null
    };

    console.log(`[Synthesis] Synthesizing with Claude Sonnet 4.5...`);

    // 5. Use Claude Sonnet 4.5 to synthesize comprehensive brief
    const client = createAnthropicClient();
    
    const briefResponse = await client.messages.create({
      model: AGENT_MODELS.synthesis,
      max_tokens: 8000,
      system: AGENT_PROMPTS.synthesis,
      messages: [{
        role: 'user',
        content: `You are synthesizing findings to answer this query: "${originalQuery}"

Project ID: ${projectId}

FINDINGS FROM EXPLORATION:
${JSON.stringify(findingsSummary, null, 2)}

Your task:
1. Directly answer the user's question using the findings
2. Be conversational and specific (cite people, conversations, commits, files, dates)
3. If the findings don't fully answer the question, explain what was found and what's missing
4. End with 3-5 follow-up questions the user might want to explore next

Format your response like this:

[Your direct answer to the query, 2-4 paragraphs, citing specific findings]

---
Follow-up questions:
• [Specific follow-up based on findings]
• [Specific follow-up based on findings]
• [Specific follow-up based on findings]
• [Optional: 2 more if relevant]

Be helpful and specific. Don't use generic section headers. Just answer the question.`
      }]
    });

    // 6. Extract the brief text
    const textContent = briefResponse.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in synthesis response');
    }

    const answerText = textContent.text;
    console.log(`[Synthesis] Answer created (${answerText.length} characters)`);

    // 7. Store final answer
    const answerKey = await stream.put('final_answer', answerText);

    // 8. Write synthesis event to stream
    await stream.append({
      agent: 'synthesis',
      phase: 'synthesis',
      action: 'synthesize_answer',
      output: {
        answer_preview: answerText.slice(0, 500) + '...',
        word_count: answerText.split(/\s+/).length,
        character_count: answerText.length
      },
      storage: {
        answer: answerKey
      },
      references: events
        .filter(e => e.event_id && e.agent !== 'synthesis')
        .map(e => e.event_id!)
    });

    console.log('[Synthesis] Complete');
    return answerText;

  } catch (error) {
    console.error('[Synthesis] Error:', error);
    
    // Write error event to stream
    await stream.append({
      agent: 'synthesis',
      phase: 'synthesis',
      action: 'error',
      output: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    
    throw error;
  }
}

