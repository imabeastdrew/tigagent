import { ExplorationStream } from '../s2/client';
import { Interaction, JudgeScore, WorkItem } from '../types';
import { createAnthropicClient, AGENT_MODELS } from '../config';

/**
 * Judge Agent - Scores interactions for relevance
 * 
 * Evaluates a batch of interactions and determines which ones
 * deserve deep investigation by workers.
 */
export async function judgeAgent(
  judgeId: number,
  iteration: number,
  interactions: Interaction[],
  query: string,
  stream: ExplorationStream
): Promise<void> {
  console.log(`[Judge ${judgeId}] Iteration ${iteration}: Scoring ${interactions.length} interactions`);
  
  try {
    // Send full text to judge for accurate scoring
    const interactionSummaries = interactions.map(i => ({
      id: i.id,
      conversation_id: i.conversation_id,
      author: i.author,
      timestamp: i.prompt_ts,
      conversation_title: i.conversation_title,
      prompt_text: i.prompt_text,
      response_text: i.response_text,
      similarity: i.similarity
    }));
    
    // Use Claude to score all interactions in batch
    const client = createAnthropicClient();
    const response = await client.messages.create({
      model: AGENT_MODELS.judge,
      max_tokens: 2000,
      system: `You are evaluating conversation interactions for relevance to a user's query. Your job is to score each interaction 0-10 for how likely it contains information that would help answer the query.`,
      messages: [{
        role: 'user',
        content: `USER QUERY: "${query}"

SCORING CRITERIA:
- 9-10: Directly answers query or contains critical context
- 7-8: Highly relevant but indirect
- 5-6: Related but tangential
- 3-4: Loosely connected
- 0-2: Not relevant

Consider:
- Direct mentions of entities in query (people, features, dates, files)
- Temporal proximity to events in query
- Causal relationships (discussions → decisions → implementations)
- Technical context that would help understand the query topic

INTERACTIONS TO SCORE:
${JSON.stringify(interactionSummaries, null, 2)}

Respond with JSON only (no markdown):
{
  "scores": [
    { "interaction_id": "uuid", "score": 8, "reason": "Brief reason" }
  ]
}`
      }]
    });
    
    // Parse response
    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in judge response');
    }
    
    // Extract JSON from response (handle markdown code blocks if present)
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in judge response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    const scores: JudgeScore[] = parsed.scores;
    
    console.log(`[Judge ${judgeId}] Scored ${scores.length} interactions`);
    
    // Write scores to stream
    await stream.append({
      agent: `judge_${judgeId}`,
      phase: 'judging',
      action: 'scored_batch',
      output: {
        iteration,
        batch_size: interactions.length,
        scores_count: scores.length,
        high_scores: scores.filter(s => s.score >= 7).length,
        average_score: scores.reduce((sum, s) => sum + s.score, 0) / scores.length
      }
    });
    
    // Add high-scoring interactions to investigation queue
    const highScores = scores.filter(s => s.score >= 7);
    console.log(`[Judge ${judgeId}] Adding ${highScores.length} high-scoring interactions to queue`);
    
    for (const score of highScores) {
      const interaction = interactions.find(i => i.id === score.interaction_id);
      if (!interaction) continue;
      
      const workItem: WorkItem = {
        interaction_id: interaction.id,
        conversation_id: interaction.conversation_id,
        priority: score.score,
        source: iteration === 0 ? 'initial_embedding' : 'discovered_reference',
        context: score.reason,
        iteration,
        claimed: false
      };
      
      await stream.append({
        agent: `judge_${judgeId}`,
        phase: 'judging',
        action: 'add_to_queue',
        output: workItem
      });
    }
    
    console.log(`[Judge ${judgeId}] Complete`);
    
  } catch (error) {
    console.error(`[Judge ${judgeId}] Error:`, error);
    
    // Write error to stream
    await stream.append({
      agent: `judge_${judgeId}`,
      phase: 'judging',
      action: 'error',
      output: {
        error: error instanceof Error ? error.message : String(error),
        iteration,
        batch_size: interactions.length
      }
    });
    
    throw error;
  }
}

/**
 * Spawn judges dynamically based on interaction count
 */
export async function spawnJudges(
  interactions: Interaction[],
  iteration: number,
  query: string,
  stream: ExplorationStream
): Promise<void> {
  if (interactions.length === 0) {
    console.log('[JudgeSpawner] No interactions to judge');
    return;
  }
  
  const judgeCount = Math.ceil(interactions.length / 10);
  const batchSize = Math.ceil(interactions.length / judgeCount);
  
  console.log(`[JudgeSpawner] Spawning ${judgeCount} judges for ${interactions.length} interactions`);
  
  // Spawn judges in parallel
  const judgePromises: Promise<void>[] = [];
  
  for (let i = 0; i < judgeCount; i++) {
    const batch = interactions.slice(i * batchSize, (i + 1) * batchSize);
    if (batch.length === 0) continue;
    
    judgePromises.push(judgeAgent(i, iteration, batch, query, stream));
  }
  
  // Wait for all judges to complete
  await Promise.all(judgePromises);
  
  console.log(`[JudgeSpawner] All ${judgeCount} judges complete`);
}

