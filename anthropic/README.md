# TigAgent - Anthropic Claude Implementation

Advanced contextual workflow implementation of TigAgent using Anthropic's Claude API.

## Overview

This implementation provides a sophisticated query analysis and execution system that:
- Analyzes user queries to discover primary intent and contextual relationships
- Creates coordinated, multi-stage query plans
- Executes queries in parallel for optimal performance
- Synthesizes results into rich, contextual responses

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Query    │───▶│  Anthropic      │───▶│  PostgreSQL     │
│                 │    │  TigAgent SDK   │    │  Database       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Claude Models  │
                    │  (Claude 3.5)   │
                    └─────────────────┘
```

## Core Components

### 1. **Context Analyzer** (`agents/contextAnalyzer.ts`)
- Identifies primary intent and domain
- Discovers related contextual information
- Assigns priorities and connection strategies

### 2. **Multi-Stage Planner** (`agents/multiStagePlanner.ts`)
- Creates coordinated query plans
- Maps conceptual entities to database entities
- Runs multiple planners in parallel

### 3. **Contextual Synthesizer** (`agents/contextualSynthesizer.ts`)
- Combines results into coherent narratives
- Highlights connections and relationships
- Provides insights and context

### 4. **Parallel Executor** (`parallelExecutor.ts`)
- Executes multiple queries simultaneously
- Handles errors gracefully
- Tracks performance metrics

### 5. **Workflow Orchestrator** (`workflow.ts`)
- Coordinates all agents
- Manages the complete workflow
- Provides multiple synthesis modes

## Installation

```bash
cd anthropic
npm install
```

## Configuration

The API key is already configured in the parent directory's `.env` file:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DATABASE_URL=postgresql://username:password@localhost:5432/tig_database
```

## Building

```bash
npm run build
```

This will compile TypeScript to JavaScript in the `dist/` directory.

## Usage

### Basic Usage

```javascript
const { runTigAgent } = require('./dist/index');

const result = await runTigAgent({
  query: 'Show me recent conversations about the timeline function',
  projectId: 'your-project-id'
});

console.log(result);
```

### Streaming Mode

```javascript
const { runTigAgentStreaming } = require('./dist/index');

await runTigAgentStreaming(
  {
    query: 'What commits were made recently?',
    projectId: 'your-project-id'
  },
  (chunk) => {
    process.stdout.write(chunk);
  }
);
```

### Progress Tracking

```javascript
const { runTigAgentWithProgress } = require('./dist/index');

const result = await runTigAgentWithProgress(
  {
    query: 'Show me the history of page.tsx',
    projectId: 'your-project-id'
  },
  (stage, progress) => {
    console.log(`${stage}: ${progress}%`);
  }
);
```

### Narrative Mode

```javascript
const { runTigAgentNarrative } = require('./dist/index');

const story = await runTigAgentNarrative({
  query: 'Tell me the story of how we built the authentication system',
  projectId: 'your-project-id'
});
```

### Timeline Mode

```javascript
const { runTigAgentTimeline } = require('./dist/index');

const timeline = await runTigAgentTimeline({
  query: 'Show me a timeline of all activity on the dashboard',
  projectId: 'your-project-id'
});
```

## Workflow Pipeline

1. **Context Analysis** - Identify primary intent and related contexts
2. **Parallel Multi-Stage Planning** - Create coordinated query plans in parallel
3. **Parallel Execution** - Execute multiple queries simultaneously
4. **Contextual Synthesis** - Combine results with rich context

## Key Features

### Session Management
- Maintains conversation context across interactions
- Enables natural follow-up queries
- Improves synthesis quality through conversation history

### Custom Tools
- Database execution tools with built-in security
- Analysis tools for pattern detection
- Synthesis tools for combining results

### Permissions System
- Granular control over database access
- Query limits and project scoping
- Restricted column protection

### Parallel Processing
- Multiple planner instances run simultaneously
- Queries execute in parallel for optimal performance
- Graceful error handling with fallbacks

## Security

- **Read-Only**: Only SELECT queries are allowed
- **Project Scoping**: All queries are scoped to a specific project
- **Row Limits**: Maximum 200 rows per query
- **Column Restrictions**: Sensitive columns are automatically filtered
- **SQL Injection Protection**: Comprehensive validation and sanitization

## Performance

- **Parallel Execution**: Multiple queries run simultaneously
- **Optimized Planning**: Parallel planner instances reduce total time
- **Connection Pooling**: Efficient database connection management
- **Streaming Support**: Large results can be streamed

## Testing

Validate your setup:

```javascript
const { validateSetup } = require('./dist/index');

const isValid = await validateSetup();
console.log('Setup valid:', isValid);
```

## Development

Watch mode for development:

```bash
npm run dev
```

## Database Schema

See `schema.md` in the parent directory for the complete database schema.

Key tables:
- `conversations` - AI conversation sessions
- `interactions` - Individual prompt/response pairs
- `interaction_diffs` - Code changes from interactions
- `commits` - Git commits
- `commit_interactions` - Links between commits and interactions

## Error Handling

All errors are caught and handled gracefully:
- Database connection errors
- API rate limits
- Invalid queries
- Timeout errors

Errors are logged with context and helpful messages for debugging.

## Performance Monitoring

The system logs execution times for each stage:
- Context analysis time
- Planning time
- Query execution time
- Synthesis time
- Total workflow time

## Extending

### Adding New Agents

Create a new agent in `src/agents/`:

```typescript
import Anthropic from '@anthropic-ai/sdk';

export class MyCustomAgent {
  private client: Anthropic;

  constructor(client: Anthropic) {
    this.client = client;
  }

  async execute(input: any): Promise<any> {
    // Your agent logic here
  }
}
```

### Adding New Synthesis Modes

Add methods to `ContextualSynthesizerAgent`:

```typescript
async synthesizeCustomMode(
  results: MultiStageQueryResults,
  plan: MultiStageQueryPlan,
  originalQuery: string
): Promise<string> {
  // Your custom synthesis logic
}
```

## Support

For issues or questions:
1. Check the logs for detailed error information
2. Validate your setup with `validateSetup()`
3. Verify database connectivity
4. Ensure API key is properly configured

## License

MIT

