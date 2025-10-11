import { ExplorationStream } from './src/simpleStream';
import { SearchRequest, Interaction, AgentV2Result, AgentV2Config, Finding, Lead, SQLDiscoveryResult } from './src/simpleTypes';
import { createAnthropicClient, AGENT_MODELS, getDb } from './src/simpleConfig';
import { executeSemanticSearch } from './src/semanticSearch';
import { SCHEMA_TEXT } from './src/ontology';

/**
 * Agent v2 - intelligent agent using SQL-driven discovery
 * 
 */

// Re-export interfaces for external use
export { AgentV2Config, AgentV2Result, Finding, Lead } from './src/simpleTypes';

/**
 * Query analysis interface
 */
export interface QueryAnalysis {
  key_concepts: string[];
  entities: string[];
  intent: string;
  search_terms: string[];
  domain: string;
  time_references?: string[];
  people_mentioned?: string[];
  files_mentioned?: string[];
}

/**
 * SQL query request interface
 */
export interface SQLQueryRequest {
  query: string;
  project_id?: string;
  context?: string;
  max_iterations?: number;
}

/**
 * SQL query result interface
 */
export interface SQLQueryResult {
  success: boolean;
  data?: any[];
  error?: string;
  iterations: number;
  final_query?: string;
  explanation?: string;
}

/**
 * Analyze user query to extract structured information
 */
async function analyzeUserQuery(userQuery: string): Promise<QueryAnalysis> {
  const client = createAnthropicClient();
  
  const systemPrompt = `You are an expert at analyzing user queries to extract structured information for database searches.

Your job is to analyze a user's question and extract:
1. Key concepts and topics (KEEP SHORT - 1-3 words each)
2. Named entities (people, files, systems)
3. The user's intent
4. Search terms that would be useful for finding similar content (KEEP SHORT - 1-3 words each)
5. Domain/area of the codebase
6. Any time references
7. Any people mentioned
8. Any files mentioned

IMPORTANT: Keep concepts and search terms SHORT and FOCUSED. Avoid long phrases or descriptive terms.
Examples of good concepts: "billing", "authentication", "database", "API", "pricing"
Examples of bad concepts: "billing system architecture", "authentication implementation details"

Be thorough but precise. Extract information that would help find relevant conversations, commits, and code.`;

  const response = await client.messages.create({
    model: AGENT_MODELS.synthesis,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Analyze this user query and extract structured information:

"${userQuery}"

Respond with JSON in this exact format:
{
  "key_concepts": ["concept1", "concept2"],
  "entities": ["entity1", "entity2"],
  "intent": "what the user wants to accomplish",
  "search_terms": ["term1", "term2"],
  "domain": "area of the codebase (e.g., authentication, billing, ui, etc.)",
  "time_references": ["time1", "time2"] or null,
  "people_mentioned": ["person1", "person2"] or null,
  "files_mentioned": ["file1", "file2"] or null
}`
    }]
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in response');
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  return JSON.parse(jsonMatch[0]);
}


/**
 * Run semantic search once to understand the query and extract key concepts
 */
async function analyzeQueryWithSemanticSearch(
  userQuery: string,
  projectId: string,
  stream: ExplorationStream
): Promise<{
  keyConcepts: string[];
  relevantInteractions: Interaction[];
  extractedMetadata: {
    people: string[];
    files: string[];
    topics: string[];
  };
}> {
  console.log(`[Agent v2] Running semantic search to understand query...`);
  
  // Run semantic search once to understand the query
  const semanticResults = await executeSemanticSearch(userQuery, projectId, 5);
  console.log(`[Agent v2] Semantic search found ${semanticResults.length} relevant interactions`);
  
  // Extract key concepts from semantic results
  const client = createAnthropicClient();
  const systemPrompt = `You are an expert at analyzing semantic search results to extract key concepts and metadata for database queries.

Your job is to:
1. Extract key concepts and terms from the semantic search results
2. Identify people, files, and topics mentioned
3. Create focused search terms for SQL queries

Be concise and focused. Extract the most important concepts that would help generate targeted SQL queries.`;

  const contextText = semanticResults.map(result => 
    `${result.interaction.author}: ${result.context_snippet}`
  ).join('\n');

  const response = await client.messages.create({
    model: AGENT_MODELS.synthesis,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `User Query: "${userQuery}"

Semantic Search Results:
${contextText}

Extract key concepts and metadata. Respond in JSON format:
{
  "key_concepts": ["concept1", "concept2", "concept3"],
  "people": ["person1", "person2"],
  "files": ["file1", "file2"],
  "topics": ["topic1", "topic2"]
}`
    }]
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in response');
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const extracted = JSON.parse(jsonMatch[0]);
  
  return {
    keyConcepts: extracted.key_concepts || [],
    relevantInteractions: semanticResults.map(result => result.interaction),
    extractedMetadata: {
      people: extracted.people || [],
      files: extracted.files || [],
      topics: extracted.topics || []
    }
  };
}

/**
 * Fetch full conversation threads from semantic search results
 */
async function fetchFullConversationThreads(
  semanticResults: Interaction[],
  projectId: string,
  stream: ExplorationStream
): Promise<Interaction[]> {
  console.log(`[Agent v2] Fetching full conversation threads for ${semanticResults.length} semantic results`);
  
  // Extract unique conversation IDs from semantic results
  const conversationIds = [...new Set(semanticResults.map(i => i.conversation_id))];
  console.log(`[Agent v2] Found ${conversationIds.length} unique conversation threads`);
  
  if (conversationIds.length === 0) {
    console.log(`[Agent v2] No conversation IDs found, returning semantic results as-is`);
    return semanticResults;
  }
  
  const db = getDb();
  
  try {
    // Fetch all interactions from these conversation threads
    const result = await db.query(`
      SELECT 
        i.id,
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
      FROM interactions i 
      JOIN conversations c ON i.conversation_id = c.id
      WHERE c.project_id = $1 
      AND i.conversation_id = ANY($2)
      ORDER BY i.conversation_id, i.created_at ASC
    `, [projectId, conversationIds]);
    
    console.log(`[Agent v2] Fetched ${result.rows.length} interactions from conversation threads`);
    
    // Convert to Interaction objects
    const fullThreads = result.rows.map(row => ({
      id: row.id,
      conversation_id: row.conversation_id,
      prompt_text: row.prompt_text,
      response_text: row.response_text,
      created_at: row.created_at,
      author: row.author,
      project_id: projectId,
      prompt_ts: row.prompt_ts,
      conversation_title: row.conversation_title,
      platform: row.platform
    }));
    
    return fullThreads;
    
  } catch (error) {
    console.error(`[Agent v2] Error fetching conversation threads:`, error);
    // Fallback to semantic results if database query fails
    return semanticResults;
  }
}

/**
 * Analyze SQL results and extract findings
 */
async function analyzeSQLResults(
  sqlResults: SQLDiscoveryResult,
  userQuery: string,
  stream: ExplorationStream
): Promise<{ findings: Finding[]; leads: Lead[] }> {
  const client = createAnthropicClient();
  
  const systemPrompt = `You are an expert analyst who examines database query results and extracts meaningful findings and leads.

Your job is to:
1. Analyze the SQL results in context of the user's question
2. Extract key findings (decisions, problems, solutions, technical details)
3. Identify leads for further investigation
4. Assess relevance and confidence

Be thorough but focused. Look for:
- Important decisions and their rationale
- Technical problems and solutions
- Key people and their expertise
- Timeline and causality
- Patterns and recurring themes`;

  const response = await client.messages.create({
    model: AGENT_MODELS.synthesis, // Use Sonnet 4.5
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `USER QUESTION: "${userQuery}"

SQL DISCOVERY RESULTS:
- Interactions: ${sqlResults.interactions.length}
- Conversations: ${sqlResults.conversations.length}
- Commits: ${sqlResults.commits.length}
- Files: ${sqlResults.files.length}
- People: ${sqlResults.people.length}

SAMPLE INTERACTIONS (first 3):
${sqlResults.interactions.slice(0, 3).map((i, idx) => `
--- Interaction ${idx + 1} ---
ID: ${i.id}
Author: ${i.author}
Created: ${i.created_at}
Prompt: ${i.prompt_text.substring(0, 200)}...
Response: ${i.response_text.substring(0, 300)}...
`).join('')}

Analyze these results and extract findings and leads. Respond in JSON format:
{
  "findings": [
    {
      "type": "decision" | "problem" | "solution" | "technical_detail" | "context",
      "summary": "One sentence summary",
      "details": "Full explanation with quotes",
      "entities": ["entity1", "entity2"],
      "relevance_to_query": "How this helps answer the query",
      "interaction_id": "uuid",
      "author": "author_name",
      "timestamp": "timestamp",
      "confidence": 0.8
    }
  ],
  "leads": [
    {
      "type": "commit" | "entity" | "person" | "temporal" | "conversation" | "file",
      "value": "specific_value",
      "search_query": "what to search for",
      "reason": "why we need to follow this lead",
      "priority": "high" | "medium" | "low",
      "context": "additional context"
    }
  ]
}`
    }]
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in response');
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  
  return {
    findings: parsed.findings || [],
    leads: parsed.leads || []
  };
}

/**
 * Generate comprehensive summary
 */
async function generateSummary(
  findings: Finding[],
  leads: Lead[],
  sqlResults: SQLDiscoveryResult,
  userQuery: string,
  semanticContext: {
    keyConcepts: string[];
    relevantInteractions: Interaction[];
    extractedMetadata: {
      people: string[];
      files: string[];
      topics: string[];
    };
  },
  stream: ExplorationStream
): Promise<string> {
  const client = createAnthropicClient();
  
  const systemPrompt = `You are analyzing conversation data to provide context and insights. Your job is to present the actual conversation content, not generic explanations.

CRITICAL INSTRUCTIONS:
- Present the ACTUAL conversation content from the interactions
- Quote specific prompts and responses from the conversations
- Show the conversation flow and context
- Extract key decisions, insights, and technical details from the actual dialogue
- Organize by conversation threads when relevant

Your responses should:
- Start with the actual conversation content that answers the user's question
- Quote specific prompts and responses with proper attribution
- Show conversation flow: "HenryQuillin asked: '...' and the AI responded: '...'"
- Extract and highlight key insights from the actual dialogue
- Mention specific people, files, and commits that were discussed
- Be conversational but focused on the actual data

When presenting conversation context:
- "In conversation X, HenryQuillin asked: '[actual prompt text]'"
- "The AI responded: '[actual response text]'"
- "This led to a discussion about [specific topic] where [person] mentioned: '[quote]'"
- "The conversation revealed that [specific insight from the actual dialogue]"

Focus on showing the actual conversation content and context, not generating generic explanations about topics.`;

  const response = await client.messages.create({
    model: AGENT_MODELS.synthesis, // Use Sonnet 4.5
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `The user asked: "${userQuery}"

SEMANTIC ANALYSIS FOUND:
- Key concepts: ${semanticContext.keyConcepts.join(', ')}
- People mentioned: ${semanticContext.extractedMetadata.people.join(', ')}
- Files mentioned: ${semanticContext.extractedMetadata.files.join(', ')}
- Topics: ${semanticContext.extractedMetadata.topics.join(', ')}

KEY FINDINGS:
${findings.map(f => `- ${f.summary} (${f.confidence} confidence) - ${f.details}`).join('\n')}

POTENTIAL LEADS TO INVESTIGATE:
${leads.map(l => `- ${l.value}: ${l.reason} (${l.priority} priority)`).join('\n')}

ACTUAL CONVERSATION DATA FOUND:

INTERACTIONS (${sqlResults.interactions.length} total):
${sqlResults.interactions.slice(0, 15).map((i, idx) => `
--- Interaction ${idx + 1} ---
ID: ${i.id}
Author: ${i.author}
Conversation: ${i.conversation_title || 'Unknown'}
Created: ${i.created_at}

PROMPT:
${i.prompt_text}

RESPONSE:
${i.response_text}
`).join('\n')}${sqlResults.interactions.length > 15 ? `\n... and ${sqlResults.interactions.length - 15} more interactions` : ''}

COMMITS (${sqlResults.commits.length} total):
${sqlResults.commits.slice(0, 10).map((c, idx) => `
--- Commit ${idx + 1} ---
Hash: ${c.hash}
Author: ${c.author}
Message: ${c.message}
Date: ${c.committed_at}
`).join('\n')}${sqlResults.commits.length > 10 ? `\n... and ${sqlResults.commits.length - 10} more commits` : ''}

PEOPLE INVOLVED (${sqlResults.people.length} total):
${sqlResults.people.map(p => `- ${p.author}: ${p.interaction_count} interactions, ${p.commit_count} commits`).join('\n')}

FILES MENTIONED (${sqlResults.files.length} total):
${sqlResults.files.slice(0, 10).map(f => `- ${f.file_path} (${f.interaction_count} interactions)`).join('\n')}${sqlResults.files.length > 10 ? `\n... and ${sqlResults.files.length - 10} more files` : ''}

The user asked for "interaction context" - they want to see the actual conversation content and context. Present the actual prompts and responses from the interactions, showing the conversation flow and extracting key insights from the actual dialogue. Quote specific conversations and show what was actually discussed.`
    }]
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return 'Summary generation failed';
  }

  return textContent.text;
}

/**
 * Main Agent v2 function
 */
export async function agentV2(
  userQuery: string,
  config: AgentV2Config,
  stream: ExplorationStream
): Promise<AgentV2Result> {
  console.log(`[Agent v2] Starting investigation: "${userQuery}"`);
  
  const result: AgentV2Result = {
    success: false,
    findings: [],
    leads: [],
    sqlResults: {
      interactions: [],
      conversations: [],
      commits: [],
      files: [],
      people: [],
      summary: ''
    },
    summary: '',
    iterations: 0,
    errors: []
  };
  
  try {
    // Log start to stream
    await stream.append({
      agent: 'agent_v2',
      phase: 'discovery',
      action: 'investigation_started',
      output: {
        query: userQuery,
        config
      }
    });
    
    // Step 1: Run semantic search once to understand the query
    const semanticContext = await analyzeQueryWithSemanticSearch(userQuery, config.projectId, stream);
    console.log(`[Agent v2] Semantic analysis complete - found ${semanticContext.keyConcepts.length} key concepts`);
    
    // Step 2: Fetch full conversation threads from semantic results
    console.log(`[Agent v2] Fetching full conversation threads...`);
    const fullConversationThreads = await fetchFullConversationThreads(
      semanticContext.relevantInteractions, 
      config.projectId, 
      stream
    );
    console.log(`[Agent v2] Retrieved ${fullConversationThreads.length} interactions from conversation threads`);
    
    // Step 3: Aggregate results
    console.log(`[Agent v2] Aggregating results...`);
    
    // Add all interactions from conversation threads
    result.sqlResults.interactions.push(...fullConversationThreads);
    console.log(`[Agent v2] Added ${fullConversationThreads.length} interactions from conversation threads`);
    
    // Step 4: Analyze results and extract findings
    console.log(`[Agent v2] Analyzing results and extracting findings...`);
    const analysis = await analyzeSQLResults(result.sqlResults, userQuery, stream);
    result.findings = analysis.findings;
    result.leads = analysis.leads;
    
    // Log data collection summary
    console.log(`[Agent v2] Data collection complete:`);
    console.log(`  - Interactions: ${result.sqlResults.interactions.length}`);
    console.log(`  - Conversations: ${result.sqlResults.conversations.length}`);
    console.log(`  - Commits: ${result.sqlResults.commits.length}`);
    console.log(`  - Files: ${result.sqlResults.files.length}`);
    console.log(`  - People: ${result.sqlResults.people.length}`);
    console.log(`  - Findings: ${result.findings.length}`);
    console.log(`  - Leads: ${result.leads.length}`);
    
    // Step 5: Generate comprehensive summary
    console.log(`[Agent v2] Generating comprehensive summary...`);
    result.summary = await generateSummary(
      result.findings,
      result.leads,
      result.sqlResults,
      userQuery,
      semanticContext,
      stream
    );
    
    result.success = true;
    result.iterations = 1; // For now, single iteration
    
    // Log completion to stream
    await stream.append({
      agent: 'agent_v2',
      phase: 'synthesis',
      action: 'investigation_complete',
      output: {
        query: userQuery,
        success: result.success,
        findings_count: result.findings.length,
        leads_count: result.leads.length,
        summary_length: result.summary.length,
        errors: result.errors
      }
    });
    
    console.log(`[Agent v2] Investigation complete: ${result.findings.length} findings, ${result.leads.length} leads`);
    
  } catch (error) {
    console.error(`[Agent v2] Error:`, error);
    
    result.errors.push(error instanceof Error ? error.message : String(error));
    
    // Log error to stream
    await stream.append({
      agent: 'agent_v2',
      phase: 'discovery',
      action: 'investigation_error',
      output: {
        query: userQuery,
        error: result.errors[result.errors.length - 1]
      }
    });
  }
  
  return result;
}

/**
 * Helper function for simple queries
 */
export async function queryWithAgentV2(
  query: string,
  projectId: string,
  stream: ExplorationStream,
  options?: Partial<AgentV2Config>
): Promise<AgentV2Result> {
  const config: AgentV2Config = {
    projectId,
    maxIterations: 3,
    enableSQLDiscovery: true,
    enableTraditionalDiscovery: false,
    debugMode: false,
    ...options
  };
  
  return agentV2(query, config, stream);
}
