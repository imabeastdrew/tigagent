import { ExplorationStream } from '../s2/client';
import { KnowledgeMiningOutput, KnowledgeAnalysis } from '../types';
import { createAnthropicClient, AGENT_MODELS, AGENT_PROMPTS } from '../config';

/**
 * Knowledge Mining Agent - Extracts wisdom from conversations
 * 
 * Strategy: Analyze conversation text for trapped knowledge:
 * - Decision rationale
 * - Warnings and gotchas
 * - Constraints
 * - Recurring patterns
 */
export async function knowledgeMiningAgent(
  stream: ExplorationStream,
  projectId: string
): Promise<void> {
  console.log(`[KnowledgeMining] Starting knowledge extraction...`);
  const agentStart = Date.now();

  try {
    // 1. Read Discovery event from stream
    const streamReadStart = Date.now();
    const events = await stream.read();
    const discoveryEvent = events.find(e => e.agent === 'discovery' && e.action === 'find_seeds');
    
    if (!discoveryEvent) {
      throw new Error('No discovery event found in stream');
    }
    
    const streamReadTime = Date.now() - streamReadStart;
    console.log(`[KnowledgeMining] Stream read completed in ${(streamReadTime / 1000).toFixed(2)}s`);

    // 2. Get full interaction text from storage
    console.log('[KnowledgeMining] Retrieving interaction data...');
    const dataFetchStart = Date.now();
    const semanticResults = await stream.get(discoveryEvent.storage!.semantic_results);
    const dataFetchTime = Date.now() - dataFetchStart;
    console.log(`[KnowledgeMining] Data fetch completed in ${(dataFetchTime / 1000).toFixed(2)}s`);
    
    if (!semanticResults || semanticResults.length === 0) {
      console.log('[KnowledgeMining] No interactions to analyze');
      
      await stream.append({
        agent: 'knowledge_mining',
        phase: 'parallel',
        action: 'extract_knowledge',
        output: {
          decisions_found: 0,
          warnings_found: 0,
          constraints_found: 0,
          patterns_found: 0,
          summary: 'No interactions to analyze'
        }
      });
      
      return;
    }

    // 3. Prepare interaction text for analysis (limit to prevent token overflow)
    const interactionsToAnalyze = semanticResults.slice(0, 20).map((r: any) => ({
      id: r.id,
      author: r.author,
      conversation_title: r.conversation_title,
      prompt: r.prompt_text?.substring(0, 1000) || '',
      response: r.response_text?.substring(0, 2000) || '',
      timestamp: r.prompt_ts
    }));

    console.log(`[KnowledgeMining] Analyzing ${interactionsToAnalyze.length} interactions with Claude...`);

    // 4. Use Claude to extract knowledge
    const apiCallStart = Date.now();
    const client = createAnthropicClient();
    
    const analysisResponse = await client.messages.create({
      model: AGENT_MODELS.knowledgeMining,
      max_tokens: 4000,
      system: AGENT_PROMPTS.knowledgeMining,
      messages: [{
        role: 'user',
        content: `Analyze these conversation interactions and extract trapped knowledge:

${JSON.stringify(interactionsToAnalyze, null, 2)}

Provide structured output in JSON format:
{
  "decisions": [
    {
      "what": "Brief description of what was decided",
      "when": "When it happened (from timestamp)",
      "who": ["authors involved"],
      "why": "The rationale behind the decision",
      "alternatives": ["other options that were considered"]
    }
  ],
  "warnings": [
    {
      "severity": "info|warning|critical",
      "message": "The warning or gotcha",
      "source": "interaction_id or conversation_title",
      "context": "Additional context"
    }
  ],
  "constraints": [
    {
      "type": "technical|business|coordination",
      "description": "The constraint",
      "context": "Why it matters"
    }
  ],
  "patterns": [
    {
      "type": "bug|discussion|refactor",
      "description": "The recurring pattern",
      "occurrences": number,
      "examples": ["interaction IDs or quotes"]
    }
  ]
}

Focus on actionable insights that would help someone understand WHY code exists the way it does.`
      }]
    });
    
    const apiCallTime = Date.now() - apiCallStart;
    console.log(`[KnowledgeMining] Claude API call completed in ${(apiCallTime / 1000).toFixed(1)}s`);

    // 5. Parse the analysis
    const parseStart = Date.now();
    let analysis: KnowledgeAnalysis;
    try {
      const textContent = analysisResponse.content.find(block => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }
      
      // Try to extract JSON from the response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[KnowledgeMining] Failed to parse Claude response:', parseError);
      // Fallback to empty analysis
      analysis = {
        decisions: [],
        warnings: [],
        constraints: [],
        patterns: []
      };
    }
    
    const parseTime = Date.now() - parseStart;
    console.log(`[KnowledgeMining] Response parsing completed in ${(parseTime / 1000).toFixed(2)}s`);

    // 6. Create output summary
    const output: KnowledgeMiningOutput = {
      decisions_found: analysis.decisions?.length || 0,
      warnings_found: analysis.warnings?.length || 0,
      constraints_found: analysis.constraints?.length || 0,
      patterns_found: analysis.patterns?.length || 0,
      summary: `Extracted ${analysis.warnings?.length || 0} warnings, ` +
               `${analysis.decisions?.length || 0} key decisions, ` +
               `${analysis.patterns?.length || 0} patterns`
    };

    console.log(`[KnowledgeMining] Results:`, output);

    // 7. Store full analysis in stream storage
    const streamWriteStart = Date.now();
    const analysisKey = await stream.put('knowledge_analysis', analysis);

    // 8. Write findings to stream
    await stream.append({
      agent: 'knowledge_mining',
      phase: 'parallel',
      action: 'extract_knowledge',
      output,
      storage: {
        analysis: analysisKey
      },
      references: [discoveryEvent.event_id!]
    });
    
    const streamWriteTime = Date.now() - streamWriteStart;
    console.log(`[KnowledgeMining] Stream write completed in ${(streamWriteTime / 1000).toFixed(2)}s`);
    
    const totalTime = Date.now() - agentStart;
    console.log(`[KnowledgeMining] Total agent time: ${(totalTime / 1000).toFixed(1)}s (API: ${(apiCallTime / 1000).toFixed(1)}s, Parse: ${(parseTime / 1000).toFixed(2)}s, Stream: ${(streamWriteTime / 1000).toFixed(2)}s)`);
    console.log('[KnowledgeMining] Analysis written to stream');
  } catch (error) {
    console.error('[KnowledgeMining] Error:', error);
    
    // Write error event to stream
    await stream.append({
      agent: 'knowledge_mining',
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

