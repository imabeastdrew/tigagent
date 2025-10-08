# TigAgent Setup Prompt

## System Context
You are working with the TigAgent SDK - a modular TypeScript framework for intelligent querying of developer context data stored in a Postgres database. The system is built on OpenAI's Agent SDK framework and provides conversational analysis of development workflows.

## Current Setup Status
✅ **Working Components:**
- Database connection to Supabase (PostgreSQL)
- Router agent with domain classification (using gpt-5)
- SQL validator and executor
- Database ontology and schema understanding
- Core workflow pipeline

✅ **Fixed Issues:**
- Router agent outputType using proper JSON schema format
- Content format using simple strings instead of complex arrays
- Model configuration upgraded to gpt-5 with reasoning effort support

## Database Schema Context
Your Supabase database contains these core tables:

### Tables Available:
- **commits**: Code commits with messages, authors, timestamps (284 rows)
- **interactions**: AI interactions, prompts, responses (2,812 rows)  
- **conversations**: Grouped interactions by platform (288 rows)
- **projects**: Repository information (44 rows)
- **users**: Developer profiles and activity (7 rows)

### Key Relationships:
- `commits.project_id` → `projects.id`
- `interactions.conversation_id` → `conversations.id`
- `conversations.project_id` → `projects.id`

### Sample Project ID for Testing:
`bfd5c464-bd03-4748-8ea1-c79b38a155ce`

## Agent Pipeline Architecture
The system follows this workflow:
```
Input → Guardrails → Router → Planner → Validator → Executor → Synthesizer → Output Guardrails → Answer
```

### 1. Router Agent (✅ Working)
- **Model**: gpt-5 with reasoning effort
- **Purpose**: Classifies queries into domains (commit, interaction, conversation, project, user, other)
- **Output**: `{ domain: "commit" | "interaction" | "conversation" | "project" | "user" | "other" }`

### 2. Planner Agents (Ready to Test)
- **Models**: gpt-5 with reasoning effort
- **Purpose**: Convert natural language to structured query plans
- **Output**: QueryPlan with entities, columns, filters, joins, time_window, project_scope

### 3. Synthesizer Agent (Ready to Test)
- **Model**: gpt-5 with reasoning effort  
- **Purpose**: Convert query results to conversational answers
- **Output**: Natural language insights and analysis

## Available Commands

### Test Individual Components:
```bash
# Test router agent only
node test-router-only.js

# Test core database functionality
node test-simple.js

# Test full workflow (may have guardrails issues)
node test-agent.js
```

### Build and Run:
```bash
npm run build
npm start
```

## Key Configuration Files

### Model Configuration (src/config.ts):
```typescript
export const MODEL_CONFIG = {
  routerModel: "gpt-5",
  plannerModel: "gpt-5", 
  synthesizerModel: "gpt-5",
  guardrailModel: "gpt-4o-mini"
};
```

### Environment Variables (.env):
```env
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres
```

## Known Issues & Limitations

### Guardrails (⚠️ Intermittent Issues):
- Input/output guardrails may fail with API format errors
- System continues without guardrails if they fail
- Not critical for core functionality

### Current Limitations:
- No vector search (v1.0 limitation)
- Single project scope per query
- 200 row limit on all queries
- 30-day default time window
- Read-only access only

## Testing Strategy

### Phase 1: Component Testing ✅
- [x] Database connection
- [x] Router agent domain classification
- [x] SQL validator and executor
- [x] Core database queries

### Phase 2: Pipeline Testing (Next)
- [ ] Test planner agents with sample queries
- [ ] Test synthesizer agent with query results
- [ ] Test end-to-end workflow

### Phase 3: Integration Testing
- [ ] Test with real user queries
- [ ] Performance optimization
- [ ] Error handling improvements

## Sample Queries to Test

### Commit Queries:
- "Show me recent commits"
- "Who made the most commits last week?"
- "Which commits touched auth.ts?"

### Interaction Queries:
- "How many interactions do we have?"
- "Show me AI conversations about authentication"
- "Which AI model was used most?"

### Project Queries:
- "What projects are available?"
- "Which project has the most activity?"

## Next Steps
1. Test the planner agents with the working router
2. Test the synthesizer agent with query results
3. Test the complete end-to-end workflow
4. Handle any remaining guardrails issues
5. Optimize performance and error handling

## File Structure
```
src/
├── agents/
│   ├── routerAgent.ts      ✅ Working
│   ├── plannerAgents.ts    Ready to test
│   └── synthesizerAgent.ts Ready to test
├── workflow.ts             Main pipeline
├── validator.ts            SQL validation
├── executor.ts             Database execution
├── ontology.ts             Schema definitions
├── types.ts                Type definitions
└── config.ts               Model configuration
```

The system is ready for comprehensive testing of the full agent pipeline!
