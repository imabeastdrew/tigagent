import { ExplorationStream } from '../s2/client';
import { Finding } from '../types';
import { createAnthropicClient, AGENT_MODELS } from '../config';

/**
 * Incremental Synthesis Agent - Builds answer as findings arrive
 * 
 * Watches the stream for new findings from workers and continuously
 * updates the answer. Provides progress feedback and finalizes when
 * exploration completes.
 */
export class IncrementalSynthesisAgent {
  private currentAnswer: string = '';
  private findings: Finding[] = [];
  private lastProcessedEventId: string | null = null;
  private isFinalized: boolean = false;
  
  constructor(
    private query: string,
    private stream: ExplorationStream
  ) {}
  
  /**
   * Start synthesis - run in background, watching for findings
   */
  async start(): Promise<void> {
    console.log('[Synthesis] Starting incremental answer building...');
    
    await this.stream.append({
      agent: 'synthesis',
      phase: 'synthesis',
      action: 'started',
      output: {
        query: this.query,
        mode: 'incremental'
      }
    });
  }
  
  /**
   * Update answer with new findings (call periodically or when notified)
   */
  async checkForUpdates(): Promise<boolean> {
    if (this.isFinalized) {
      return false;
    }
    
    // Get new events since last check
    const newEvents = await this.stream.read({ 
      since_id: this.lastProcessedEventId || undefined 
    });
    
    if (newEvents.length === 0) {
      return false;
    }
    
    // Filter for new findings
    const newFindings = newEvents
      .filter(e => e.agent.startsWith('worker_') && e.action === 'finding')
      .map(e => e.output as Finding);
    
    if (newFindings.length === 0) {
      this.lastProcessedEventId = newEvents[newEvents.length - 1].event_id || null;
      return false;
    }
    
    console.log(`[Synthesis] Received ${newFindings.length} new findings`);
    this.findings.push(...newFindings);
    
    // Update answer with new information
    await this.updateAnswer(newFindings);
    
    this.lastProcessedEventId = newEvents[newEvents.length - 1].event_id || null;
    return true;
  }
  
  /**
   * Update the answer to incorporate new findings
   */
  private async updateAnswer(newFindings: Finding[]): Promise<void> {
    const client = createAnthropicClient();
    
    const isFirstUpdate = this.currentAnswer === '';
    
    const response = await client.messages.create({
      model: AGENT_MODELS.synthesis,
      max_tokens: 6000,
      system: `You are building an answer by incrementally incorporating findings from ongoing investigation.`,
      messages: [{
        role: 'user',
        content: `USER QUERY: "${this.query}"

${isFirstUpdate ? 
`CURRENT ANSWER: (This is the first update - create initial answer structure)` :
`CURRENT ANSWER DRAFT:
${this.currentAnswer}`}

NEW FINDINGS DISCOVERED:
${JSON.stringify(newFindings, null, 2)}

TOTAL FINDINGS SO FAR: ${this.findings.length}

---

YOUR TASK:

${isFirstUpdate ? 
`Create an initial answer structure that:
- Starts addressing the query with what we know so far
- Shows we're actively investigating
- Uses [INVESTIGATING] tags for incomplete areas` :
`Update the existing answer to:
- Integrate the new findings smoothly
- Maintain narrative flow
- Add new details and connections
- Keep [INVESTIGATING] tags for areas still being explored`}

FORMAT REQUIREMENTS:
- Conversational and clear
- Specific with evidence (quote findings, cite authors/dates)
- Use [INVESTIGATING: topic] for incomplete areas
- Connect findings temporally and causally when relevant

RESPOND WITH THE UPDATED ANSWER (plain text, not JSON):`
      }]
    });
    
    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in synthesis update response');
    }
    
    this.currentAnswer = textContent.text;
    
    // Write intermediate answer to stream
    await this.stream.append({
      agent: 'synthesis',
      phase: 'synthesis',
      action: 'intermediate_update',
      output: {
        answer_preview: this.currentAnswer.slice(0, 500) + '...',
        findings_count: this.findings.length,
        word_count: this.currentAnswer.split(/\s+/).length,
        completeness: this.estimateCompleteness()
      }
    });
    
    console.log(`[Synthesis] Answer updated (${this.findings.length} findings incorporated, ${this.currentAnswer.length} chars)`);
  }
  
  /**
   * Finalize the answer when exploration completes
   */
  async finalize(): Promise<string> {
    if (this.isFinalized) {
      return this.currentAnswer;
    }
    
    console.log('[Synthesis] Finalizing answer...');
    
    // One last check for any remaining findings
    await this.checkForUpdates();
    
    // If we never got any findings, return a fallback
    if (this.findings.length === 0) {
      return this.createFallbackAnswer();
    }
    
    // Finalize the answer
    const client = createAnthropicClient();
    
    const response = await client.messages.create({
      model: AGENT_MODELS.synthesis,
      max_tokens: 8000,
      system: `You are finalizing an answer after a complete investigation.`,
      messages: [{
        role: 'user',
        content: `USER QUERY: "${this.query}"

DRAFT ANSWER (from incremental updates):
${this.currentAnswer}

ALL FINDINGS (${this.findings.length} total):
${JSON.stringify(this.findings.slice(0, 50), null, 2)}
${this.findings.length > 50 ? `\n... and ${this.findings.length - 50} more findings` : ''}

---

YOUR TASK: Create the final, polished answer.

1. Remove all [INVESTIGATING] tags
2. Fill any remaining gaps using the complete findings
3. Ensure coherent narrative flow
4. Add a brief summary if answer is long (>3 paragraphs)
5. Include 3-5 follow-up questions based on what was discovered

STRUCTURE:
[Direct answer to the query - 2-4 paragraphs with specific evidence]

[Optional: Timeline or technical details if relevant]

---
Follow-up questions:
• [Specific follow-up based on findings]
• [Specific follow-up based on findings]
• [Specific follow-up based on findings]

Be comprehensive but concise. Use evidence from findings.

RESPOND WITH FINAL ANSWER (plain text):`
      }]
    });
    
    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in synthesis finalize response');
    }
    
    this.currentAnswer = textContent.text;
    this.isFinalized = true;
    
    // Write final answer to stream
    const answerKey = await this.stream.put('final_answer', this.currentAnswer);
    
    await this.stream.append({
      agent: 'synthesis',
      phase: 'synthesis',
      action: 'finalized',
      output: {
        answer_preview: this.currentAnswer.slice(0, 500) + '...',
        word_count: this.currentAnswer.split(/\s+/).length,
        character_count: this.currentAnswer.length,
        findings_incorporated: this.findings.length
      },
      storage: {
        answer: answerKey
      }
    });
    
    console.log(`[Synthesis] Answer finalized (${this.currentAnswer.length} chars, ${this.findings.length} findings)`);
    
    return this.currentAnswer;
  }
  
  /**
   * Create fallback answer if no findings were discovered
   */
  private createFallbackAnswer(): string {
    return `I conducted an investigation for your query "${this.query}" but didn't find sufficient information in the available data.

This could mean:
- The topic isn't covered in the conversations and commits I have access to
- The relevant information might be in a different project or time period
- The query might need to be rephrased to match how developers discuss this topic

Could you provide more context or rephrase your question?`;
  }
  
  /**
   * Estimate how complete the answer is (0-1 scale)
   */
  private estimateCompleteness(): number {
    if (this.findings.length === 0) return 0;
    
    // Simple heuristic based on finding types and count
    const decisionCount = this.findings.filter(f => f.type === 'decision').length;
    const problemCount = this.findings.filter(f => f.type === 'problem').length;
    const solutionCount = this.findings.filter(f => f.type === 'solution').length;
    
    // Ideally we have problems, solutions, and decisions
    const hasProblems = problemCount > 0;
    const hasSolutions = solutionCount > 0;
    const hasDecisions = decisionCount > 0;
    
    const dimensions = [hasProblems, hasSolutions, hasDecisions].filter(Boolean).length;
    const baseLine = dimensions / 3;
    
    // Add bonus for quantity (diminishing returns)
    const quantityBonus = Math.min(0.3, this.findings.length / 30);
    
    // Check for [INVESTIGATING] tags in answer (indicates incompleteness)
    const investigatingCount = (this.currentAnswer.match(/\[INVESTIGATING/g) || []).length;
    const incompletenesspenalty = investigatingCount * 0.1;
    
    return Math.min(1, Math.max(0, baseLine + quantityBonus - incompletenesspenalty));
  }
  
  /**
   * Get current answer (even if not finalized)
   */
  getCurrentAnswer(): string {
    return this.currentAnswer;
  }
  
  /**
   * Get findings count
   */
  getFindingsCount(): number {
    return this.findings.length;
  }
}

