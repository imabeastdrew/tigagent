# Tig Agent SDK v1.0

A modular TypeScript framework that enables intelligent, safe, and conversational querying of developer context data stored in a Postgres database. Built on OpenAI's Agent SDK framework.

## Overview

Tig is a YC-backed startup building an AI-native version control and collaboration platform for developers ("vibecoders"). The Agent SDK powers Tig's search and reasoning layer — a context-aware interface that can answer questions like:

- "Which commits touched auth.ts in the last week?"
- "What were the main conversations around the rate limiter refactor?"
- "Who worked on the onboarding flow most recently?"

This system provides conversational analysis rather than raw data dumps, helping users understand context and patterns across their development workflow.

## Status

✅ **Fully Working** - All components tested and operational
- Router Agent: ✅ Domain classification working
- Planner Agents: ✅ Query planning working  
- SQL Validator: ✅ Safe SQL generation working
- Database Executor: ✅ Query execution working
- Synthesizer Agent: ✅ Conversational output working

## Installation

```bash
npm install
```

## Environment Setup

Create a `.env` file with the following variables:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Database Configuration  
DATABASE_URL=postgresql://username:password@localhost:5432/tig_database
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
echo "OPENAI_API_KEY=your_key_here" > .env
echo "DATABASE_URL=your_db_url_here" >> .env

# 3. Build the project
npm run build

# 4. Test the complete workflow
node test-workflow-simple.js
```

## Usage

### Basic Usage

```typescript
import { runTigAgent } from './index.js';

const result = await runTigAgent({
  input_as_text: "Show me recent commits",
  project_id: "your-project-id"
});

console.log(result);
// Output: "I found 12 commits in the last 30 days. The most recent was by Sarah fixing the login validation..."
```

### Advanced Usage

```typescript
import { 
  runTigAgent, 
  runWorkflow, 
  commitPlannerAgent,
  validateAndBuildSQL 
} from './index.js';
import { Pool } from 'pg';

// Custom workflow with your own database pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const result = await runWorkflow({
  input_as_text: "Who made the most commits last week?",
  project_id: "project-123"
}, pool);

// Use individual components
const queryPlan = await commitPlannerAgent.run("Show me commits by John");
const validation = validateAndBuildSQL(queryPlan, "project-123");
```

## Architecture

The Agent SDK follows a modular pipeline architecture:

```
Input → Router → Planner → Validator → Executor → Synthesizer → Answer
```

### Components

1. **Router Agent** - Classifies queries into domains (commit, interaction, conversation, project, user, other)
2. **Planner Agents** - Convert natural language to structured query plans for each domain
3. **Validator** - Converts query plans to safe, parameterized SQL with security checks
4. **Executor** - Runs read-only database queries with connection pooling
5. **Synthesizer Agent** - Converts results to conversational, insight-style answers

### Domains

- **commit** - Code commits, changes, authors, commit history
- **interaction** - AI interactions, prompts, responses, AI conversations  
- **conversation** - Conversation threads, discussions, chat sessions
- **project** - Repositories, projects, project-level information
- **user** - Developers, contributors, user activity
- **other** - Queries that don't fit the above categories

## Database Schema

The SDK operates on a Postgres database with these core entities:

- **commits** - Code commits with messages, authors, timestamps
- **interactions** - AI tool conversations (prompts/responses)
- **conversations** - Grouped interactions by platform (Cursor, Claude Code)
- **projects** - Repository information
- **users** - Developer profiles and activity

## Safety Features

- **Read-only queries** - No mutations allowed (SELECT only)
- **SQL injection protection** - Parameterized queries with resolved values
- **Row limits** - Maximum 200 rows per query
- **Time windows** - Default 30-day scope if not specified
- **Project scoping** - All queries scoped to specific projects
- **Column redaction** - Sensitive fields (email, auth_user_id) automatically redacted
- **Dangerous keyword detection** - Blocks SQL injection attempts

## API Reference

### Main Functions

#### `runTigAgent(input: WorkflowInput): Promise<string>`

Main entry point for the SDK.

**Parameters:**
- `input.input_as_text` - Natural language query
- `input.project_id` - Project ID to scope the query

**Returns:** Conversational answer as string

#### `runWorkflow(input: WorkflowInput, pool: Pool): Promise<string>`

Advanced workflow with custom database pool.

### Types

#### `WorkflowInput`
```typescript
interface WorkflowInput {
  input_as_text: string;
  project_id: string;
}
```

#### `QueryPlan`
```typescript
interface QueryPlan {
  intent_summary: string;
  entities: string[];
  columns: string[];
  filters: Filter[];
  joins: Join[];
  time_window: TimeWindow;
  project_scope: string;
  explanation: string;
}
```

### Agents

#### Router Agent
```typescript
import { routerAgent } from './index.js';
const domain = await routerAgent.run("Show me recent commits");
```

#### Planner Agents
```typescript
import { commitPlannerAgent } from './index.js';
const plan = await commitPlannerAgent.run("Commits by John last week");
```

#### Synthesizer Agent
```typescript
import { synthesizerAgent } from './index.js';
const answer = await synthesizerAgent.run("Synthesize these results...");
```

## Examples

### Commit Queries
```typescript
// Recent commits
await runTigAgent({
  input_as_text: "Show me commits from yesterday",
  project_id: "proj-123"
});

// Commits by author
await runTigAgent({
  input_as_text: "Who made the most commits last week?",
  project_id: "proj-123"
});

// File-specific commits
await runTigAgent({
  input_as_text: "Which commits touched auth.ts?",
  project_id: "proj-123"
});
```

### Interaction Queries
```typescript
// AI conversations
await runTigAgent({
  input_as_text: "Show me AI conversations about authentication",
  project_id: "proj-123"
});

// Model usage
await runTigAgent({
  input_as_text: "Which AI model was used most?",
  project_id: "proj-123"
});
```

### User Queries
```typescript
// Developer activity
await runTigAgent({
  input_as_text: "Who are the most active developers?",
  project_id: "proj-123"
});

// Contributor analysis
await runTigAgent({
  input_as_text: "Show me users who contributed to auth.ts",
  project_id: "proj-123"
});
```

## Limitations

- **No vector search** in v1.0 - only SQL and file-based reasoning
- **Single project scope** per query
- **200 row limit** on all queries
- **30-day default time window** if not specified
- **Read-only access** - no mutations allowed
- **No guardrails** - Content moderation disabled for compatibility

## Current Status

The TigAgent SDK is fully operational with all core components working:
- ✅ Router Agent (domain classification)
- ✅ Planner Agents (query planning) 
- ✅ SQL Validator (safe SQL generation)
- ✅ Database Executor (query execution)
- ✅ Synthesizer Agent (conversational output)

Test with: `node test-workflow-simple.js`

## Development

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Testing

Test individual components:
```bash
# Test router agent only
node test-router-only.js

# Test core database functionality  
node test-simple.js

# Test full workflow
node test-agent.js
```

Test the complete pipeline:
```bash
# Build the project
npm run build

# Test with a simple query
node test-workflow-simple.js
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For questions or issues, please open an issue on GitHub or contact the Tig team.
