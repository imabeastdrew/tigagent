# Unit67 - Multi-Agent Exploration System

Deep exploration of codebase context using parallel specialized agents.

## Overview

Unit67 is a multi-agent system designed to surface trapped knowledge from your team's conversation history. It answers ANY query about your codebase by exploring in parallel using specialized strategies:

- **Discovery Agent** (Haiku): Finds seeds - relevant conversations, commits, files, people
- **Thread Following Agent** (Sonnet): Traces connections - full conversation threads, commit-to-interaction mappings, file histories
- **Knowledge Mining Agent** (Sonnet): Extracts wisdom - decision rationale, warnings, constraints, patterns
- **Temporal Context Agent** (Haiku): Analyzes timeline - activity spikes, change frequency, urgency
- **Synthesis Agent** (Sonnet 4.5): Creates comprehensive brief combining all findings

## Architecture

```
Phase 1: Discovery (Sequential)
  ↓
Phase 2: Parallel Exploration
  ├─ Thread Following
  ├─ Knowledge Mining  
  └─ Temporal Context
  ↓
Phase 3: Synthesis (Sequential)
```

**Key Features:**
- Parallel agent execution (40% faster than sequential)
- S2 stream coordination for agent communication
- In-memory fallback when S2 is not configured
- Surfaces decision rationale and gotchas from conversations
- Works for ANY query (functions, commits, decisions, files, etc.)
- Full audit trail of exploration process

## Setup

### 1. Install Dependencies

```bash
cd Unit67
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root (parent of agent/) or set these environment variables:

```bash
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key
DATABASE_URL=postgresql://user:password@host:port/database

# Optional (for S2 stream coordination)
S2_API_KEY=your_s2_api_key
S2_ENDPOINT=https://api.s2.dev

# Optional (for debugging)
SHOW_AUDIT_TRAIL=true
```

**Getting API Keys:**
- Anthropic API: https://console.anthropic.com/
- S2 API: https://s2.dev (optional - uses in-memory fallback if not set)

### 3. Build

```bash
npm run build
```

## Usage

### Basic Usage

```bash
node run-exploration.js "your query"
```

### Examples

```bash
# Explore a feature
node run-exploration.js "Why does authentication timeout work this way?"

# Explore a function
node run-exploration.js "Tell me about the timeline function in page.tsx"

# Explore a commit
node run-exploration.js "What's the context around Henry's commit on Oct 7?"

# Explore a decision
node run-exploration.js "Why is localStorage used instead of cookies?"

# With specific project ID
node run-exploration.js "authentication timeout" 1071785897
```

### Programmatic Usage

```typescript
import { explore } from './dist/index';

const result = await explore("Why does auth timeout work this way?", 1071785897);

console.log(result.brief);          // Comprehensive context brief
console.log(result.sessionId);      // Unique session identifier
console.log(result.streamUrl);      // S2 stream URL for audit
console.log(result.auditTrail);     // Full event log
```

## Output Format

The synthesis agent creates a structured brief with:

1. **What This Is** - Quick explanation of the topic
2. **Why It Exists This Way** - Decision rationale and history
3. **Key Conversations** - Most relevant discussions with quotes
4. **Code Reality** - Files, changes, commits involved
5. **Critical Warnings** - Gotchas, constraints, edge cases
6. **People to Ask** - Who has expertise in this area
7. **Timeline** - When things happened, activity patterns
8. **Recommended Next Steps** - Based on all findings

## How It Works

### Phase 1: Discovery

The Discovery Agent casts a wide net using:
- Semantic search on interaction embeddings
- SQL queries across conversations, commits, files
- Identifies seeds: interaction IDs, conversation IDs, commit hashes, file paths, people

### Phase 2: Parallel Exploration

Three agents run simultaneously:

**Thread Following Agent:**
- Builds full conversation threads
- Traces commits back to discussions
- Creates file change histories
- Shows how interactions led to commits

**Knowledge Mining Agent:**
- Uses Claude to analyze conversation text
- Extracts decision rationale ("We chose X because...")
- Finds warnings and gotchas ("Safari requires...")
- Identifies constraints ("Must coordinate with backend")
- Detects recurring patterns

**Temporal Context Agent:**
- Analyzes timestamps on interactions and commits
- Identifies activity spikes
- Calculates change frequency
- Assesses urgency (low/moderate/high)

### Phase 3: Synthesis

The Synthesis Agent:
- Reads all findings from stream
- Uses Claude Sonnet 4.5 to synthesize
- Creates comprehensive, actionable brief
- Structured for both humans and AI agents

## Agent Coordination (S2 Streams)

Agents coordinate via S2 streams:
- Each exploration session gets a unique stream
- Agents write findings as events (small summaries)
- Large data stored separately (stream.put/get)
- Agents autonomously read stream to see other agents' work
- Full audit trail preserved

**Fallback:** If S2_API_KEY is not set, uses in-memory storage (no persistence, but fully functional).

## Cost Optimization

Model selection optimized per agent:
- Discovery: Haiku (fast, cheap for broad search)
- Thread Following: Sonnet (better reasoning for tracing)
- Knowledge Mining: Sonnet (better analysis)
- Temporal Context: Haiku (fast for timeline analysis)
- Synthesis: Sonnet 4.5 (best for final brief)

**Cost per exploration:** ~$0.32 (vs ~$0.68 for monolithic Sonnet 4.5)
**Savings:** 53%

## Development

### Watch Mode

```bash
npm run dev
```

### Test with Real Queries

```bash
npm run build
node run-exploration.js "test query"
```

### Debug Audit Trail

```bash
SHOW_AUDIT_TRAIL=true node run-exploration.js "test query"
```

## Database Schema

Unit67 queries these tables:
- `conversations` - Chat threads
- `interactions` - Individual messages (prompt + response)
- `interaction_diffs` - Code changes during interactions
- `interaction_embeddings` - Vector embeddings for semantic search
- `commits` - Git commits
- `commit_interactions` - Links commits to conversations
- `pull_requests` - PR metadata
- `users` - Developers

See `../schema.md` for full schema.

## Troubleshooting

### "ANTHROPIC_API_KEY environment variable is not set"

Set the environment variable or add to `.env` file in project root.

### "DATABASE_URL environment variable is not set"

Ensure DATABASE_URL points to your PostgreSQL database.

### "Using in-memory stream"

This is normal if S2_API_KEY is not set. In-memory mode is fully functional for single-process exploration.

### Slow performance

- Check network latency to database
- Ensure database has indexes on frequently queried columns
- Consider limiting query scope with specific project IDs

## Future Enhancements

- [ ] Real S2 API integration (currently using in-memory fallback)
- [ ] Vector embedding search (currently using text search)
- [ ] Agent SDK integration for advanced orchestration
- [ ] Stream branching for exploring alternative strategies
- [ ] Cached embeddings for faster semantic search
- [ ] Interactive follow-up question suggestions
- [ ] Web UI for exploration sessions

## License

MIT

