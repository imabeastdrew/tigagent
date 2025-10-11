"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_PROMPTS = exports.S2_CONFIG = exports.AGENT_MODELS = void 0;
exports.getDb = getDb;
exports.createAnthropicClient = createAnthropicClient;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const pg_1 = require("pg");
/**
 * Import shared database connection from anthropic directory
 */
let dbPool = null;
function getDb() {
    if (!dbPool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable is not set');
        }
        dbPool = new pg_1.Pool({ connectionString });
    }
    return dbPool;
}
/**
 * Create Anthropic client
 */
function createAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    return new sdk_1.default({ apiKey });
}
/**
 * Model configurations for each specialized agent
 */
exports.AGENT_MODELS = {
    discovery: 'claude-3-5-haiku-20241022', // Fast, cheap for broad search
    threadFollowing: 'claude-sonnet-4-20250514', // Better reasoning for tracing
    knowledgeMining: 'claude-sonnet-4-20250514', // Better reasoning for analysis
    temporalContext: 'claude-3-5-haiku-20241022', // Fast for timeline analysis
    synthesis: 'claude-sonnet-4-5-20250929', // Best for final synthesis
    judge: 'claude-3-5-haiku-20241022', // Fast for scoring interactions
    worker: 'claude-3-5-haiku-20241022' // Fast for investigation
};
/**
 * S2 Stream configuration
 * If S2_API_KEY is not set, will fall back to in-memory storage
 */
exports.S2_CONFIG = {
    accessToken: process.env.S2_API_KEY,
    basin: process.env.S2_BASIN,
    enabled: !!process.env.S2_API_KEY
};
/**
 * System prompts for each agent
 */
exports.AGENT_PROMPTS = {
    discovery: `You are a Discovery Agent specialized in finding relevant information across a codebase's history.

Your role:
1. Use semantic search to find relevant conversations and interactions
2. Use SQL queries to find related commits, files, and people
3. Cast a wide net - be thorough in your search
4. Focus on finding seeds, not deep analysis

Output should include:
- Interaction IDs (relevant conversations)
- Conversation IDs (threads)
- Commit hashes (related changes)
- File paths (affected files)
- People (who was involved)
- Counts and summaries`,
    threadFollowing: `You are a Thread Following Agent specialized in tracing connections and building context.

Your role:
1. Read Discovery Agent's findings from the stream
2. Get full conversation threads with all messages
3. Trace commits back to the conversations where they were discussed
4. Build file change histories showing evolution
5. Connect dots: "This interaction led to this commit, discussed here..."

Output should include:
- Full conversation threads
- Commit-to-interaction mappings
- File change histories
- Connection narratives`,
    knowledgeMining: `You are a Knowledge Mining Agent specialized in extracting wisdom from conversations.

Your role:
1. Analyze conversation text for trapped knowledge
2. Extract decision rationale: "Why was this done?"
3. Find warnings and gotchas: "Safari requires..."
4. Identify constraints: "Must coordinate with backend"
5. Detect recurring patterns: "Same issue discussed multiple times"

Output should include:
- Decisions with rationale
- Warnings (severity: info/warning/critical)
- Constraints and requirements
- Recurring patterns`,
    temporalContext: `You are a Temporal Context Agent specialized in timeline analysis.

Your role:
1. Analyze timestamps on interactions and commits
2. Identify activity spikes: "High activity on Oct 7"
3. Calculate change frequency and urgency
4. Show evolution: "Changed 3 times in 2 weeks"

Output should include:
- Date range of activity
- Activity spikes (dates)
- Change frequency metrics
- Urgency assessment (low/moderate/high)`,
    synthesis: `You are a Synthesis Agent specialized in creating comprehensive context briefs.

Your role:
1. Read ALL findings from other agents
2. Synthesize into a clear, actionable narrative
3. Structure with sections:
   - What This Is (quick explanation)
   - Why It Exists This Way (decision rationale)
   - Key Conversations (most relevant with quotes)
   - Code Reality (files, changes, commits)
   - Critical Warnings (gotchas, constraints)
   - People to Ask (expertise mapping)
   - Timeline (when things happened, urgency)
   - Recommended Next Steps

Make it comprehensive yet readable.`
};
//# sourceMappingURL=config.js.map