# TigAgent: Extremely Detailed Architecture and Operation Guide

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Core Components Deep Dive](#core-components-deep-dive)
4. [Workflow Execution Flow](#workflow-execution-flow)
5. [Agent System](#agent-system)
6. [Database Schema and Ontology](#database-schema-and-ontology)
7. [Security and Safety Mechanisms](#security-and-safety-mechanisms)
8. [Advanced Features](#advanced-features)
9. [Error Handling and Recovery](#error-handling-and-recovery)
10. [Performance Considerations](#performance-considerations)

## Overview

TigAgent is a sophisticated AI-powered query system built on OpenAI's Agent SDK framework. It provides intelligent, conversational access to developer context data stored in a PostgreSQL database. The system is designed to answer complex questions about code commits, AI interactions, conversations, files, projects, and users in a natural, insightful way.

### Key Capabilities
- **Natural Language Processing**: Converts human questions into structured database queries
- **Multi-Domain Intelligence**: Handles queries across commits, interactions, conversations, files, projects, and users
- **Contextual Analysis**: Provides rich context by connecting related information across domains
- **Safe Execution**: Ensures read-only access with comprehensive security validation
- **Conversational Output**: Synthesizes raw data into meaningful, actionable insights

## System Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Query    │───▶│  TigAgent SDK   │───▶│  PostgreSQL     │
│                 │    │                 │    │  Database       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  OpenAI Agents  │
                    │  (GPT-5 Models) │
                    └─────────────────┘
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TigAgent SDK                             │
├─────────────────────────────────────────────────────────────────┤
│  Entry Point (index.ts)                                         │
│  ├── runTigAgent() - Main entry point                           │
│  └── Database Connection Pool Management                        │
├─────────────────────────────────────────────────────────────────┤
│  Workflow Orchestration (workflow.ts)                          │
│  ├── runWorkflow() - Standard workflow                          │
│  └── runContextualWorkflow() - Advanced contextual workflow    │
├─────────────────────────────────────────────────────────────────┤
│  Agent System                                                   │
│  ├── Router Agent - Domain classification                       │
│  ├── Planner Agents - Query planning per domain                 │
│  ├── Synthesizer Agent - Answer generation                      │
│  ├── Context Analyzer - Context discovery                       │
│  ├── Multi-Stage Planner - Coordinated query planning           │
│  └── Contextual Synthesizer - Rich context synthesis            │
├─────────────────────────────────────────────────────────────────┤
│  Execution Engine                                               │
│  ├── Validator - SQL validation and generation                  │
│  ├── Executor - Safe database execution                         │
│  └── Parallel Executor - Multi-query coordination               │
├─────────────────────────────────────────────────────────────────┤
│  Safety & Security                                              │
│  ├── Ontology - Schema validation                               │
│  ├── Guardrails - Content moderation                            │
│  └── Security Utils - SQL injection protection                  │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components Deep Dive

### 1. Entry Point (`index.ts`)

The main entry point provides a clean API for external consumers:

```typescript
export async function runTigAgent(input: WorkflowInput): Promise<string>
```

**Key Responsibilities:**
- Database connection pool management
- Environment variable loading
- Main workflow orchestration
- Connection cleanup

**Database Pool Configuration:**
- Maximum 10 concurrent connections
- 30-second idle timeout
- 2-second connection timeout
- Automatic connection pooling and reuse

### 2. Workflow Orchestration (`workflow.ts`)

Two main workflow types handle different complexity levels:

#### Standard Workflow (`runWorkflow`)
**Pipeline Steps:**
1. **Domain Routing** - Classify query into appropriate domain
2. **Query Planning** - Generate structured query plan
3. **SQL Validation** - Convert plan to safe SQL
4. **Query Execution** - Execute against database
5. **Answer Synthesis** - Convert results to conversational response

#### Contextual Workflow (`runContextualWorkflow`)
**Enhanced Pipeline Steps:**
1. **Context Analysis** - Identify primary intent and related contexts
2. **Multi-Stage Planning** - Create coordinated query plans
3. **Parallel Execution** - Execute multiple queries simultaneously
4. **Contextual Synthesis** - Combine results with rich context

### 3. Agent System

#### Router Agent (`routerAgent.ts`)
**Purpose:** Classifies user queries into domains

**Supported Domains:**
- `commit` - Code commits, changes, authors, commit history
- `interaction` - AI interactions, prompts, responses, AI conversations
- `conversation` - Conversation threads, discussions, chat sessions
- `file` - Specific files, file changes, and code modifications
- `project` - Repositories, projects, project-level information
- `user` - Developers, contributors, user activity
- `other` - Queries that don't fit the above categories

**Cross-Domain Detection:**
- Identifies queries spanning multiple domains
- Examples: "Who built the auth extension?" (user + commit)
- Sets `is_cross_domain: true` and lists all involved domains

**Model Configuration:**
- Uses GPT-5 with minimal reasoning effort
- JSON schema output for structured classification
- Fast, accurate domain routing

#### Planner Agents (`plannerAgents.ts`)
**Purpose:** Convert natural language to structured query plans

**Agent Types:**
1. **Commit Planner** - Handles commit-related queries
2. **Interaction Planner** - Handles AI interaction queries
3. **Conversation Planner** - Handles conversation thread queries
4. **File Planner** - Handles file change and modification queries
5. **Project Planner** - Handles project and repository queries
6. **User Planner** - Handles developer and contributor queries

**Query Plan Structure:**
```typescript
interface QueryPlan {
  intent_summary: string;           // Brief description of query intent
  entities: string[];              // Database tables involved
  columns: string[];               // Specific columns to select
  filters: Filter[];               // Filter conditions
  joins: Join[];                   // Table relationships
  aggregations: Aggregation[];     // Aggregation functions
  group_by: string[];              // Grouping columns
  time_window: TimeWindow;         // Time range constraints
  project_scope: string;           // Project ID for scoping
  is_cross_domain: boolean;        // Cross-domain indicator
  domains: string[];               // All domains involved
  explanation: string;             // Reasoning for plan choices
}
```

**Planning Process:**
1. Analyze user intent and identify required entities
2. Select appropriate columns based on query needs
3. Define filters for time ranges, authors, topics, etc.
4. Specify joins for cross-domain relationships
5. Add aggregations for counting, averaging, etc.
6. Set time windows (default to current state unless historical)
7. Ensure project scoping for security
8. Explain reasoning for transparency

#### Synthesizer Agent (`synthesizerAgent.ts`)
**Purpose:** Convert structured results into conversational answers

**Synthesis Principles:**
- **Conversational Tone** - Natural, developer-friendly language
- **Pattern Recognition** - Identify trends and insights
- **Contextual Explanation** - Explain what data means
- **Specific Examples** - Use actual data points
- **Actionable Insights** - Provide useful information

**Output Quality Guidelines:**
- Focus on patterns rather than raw data dumps
- Group related information logically
- Highlight important trends or anomalies
- Provide context about significance
- Maintain professional, helpful tone

#### Advanced Agents

**Context Analyzer (`contextAnalyzer.ts`)**
- Identifies primary intent and related contextual information
- Discovers temporal, semantic, and causal relationships
- Prioritizes contextual intents (High/Medium/Low)
- Chooses connection strategies (time-based, commit-based, semantic, etc.)

**Multi-Stage Planner (`multiStagePlanner.ts`)**
- Creates coordinated query plans for primary and contextual queries
- Ensures all plans work together complementarily
- Maps conceptual entities to database entities
- Defines synthesis strategies for combining results

**Contextual Synthesizer (`contextualSynthesizer.ts`)**
- Combines results from multiple coordinated queries
- Highlights connections between different data sources
- Creates unified, rich responses with context
- Uses narrative, timeline, topical, and collaborative synthesis strategies

### 4. Execution Engine

#### Validator (`validator.ts`)
**Purpose:** Convert query plans to safe, executable SQL

**Validation Process:**
1. **Entity Validation** - Verify all entities exist in schema
2. **Column Validation** - Check column names and types
3. **Join Validation** - Ensure valid relationships between tables
4. **Aggregation Validation** - Verify aggregation functions and rules
5. **Security Validation** - Check for dangerous keywords
6. **SQL Generation** - Build parameterized, safe SQL

**Security Features:**
- **Dangerous Keyword Detection** - Blocks SQL injection attempts
- **Parameter Resolution** - Converts placeholders to actual values
- **Column Redaction** - Automatically redacts sensitive fields
- **Row Limits** - Maximum 200 rows per query
- **Read-Only Enforcement** - Only SELECT statements allowed

**SQL Generation Process:**
1. Build SELECT clause with aggregations
2. Construct FROM clause with main entity
3. Add JOIN clauses for relationships
4. Build WHERE clause with filters and project scoping
5. Add GROUP BY for aggregations
6. Add ORDER BY for result ordering
7. Add LIMIT for row constraints

#### Executor (`executor.ts`)
**Purpose:** Safely execute validated SQL queries

**Execution Process:**
1. **Connection Management** - Get client from pool
2. **Transaction Control** - Begin read-only transaction
3. **Query Execution** - Execute SQL with parameters
4. **Result Processing** - Extract rows and metadata
5. **Transaction Commit** - Commit read-only transaction
6. **Connection Release** - Return client to pool
7. **Error Handling** - Rollback on failure, log errors

**Safety Features:**
- **Read-Only Transactions** - Prevents any mutations
- **Connection Pooling** - Efficient resource management
- **Error Recovery** - Automatic rollback on failures
- **Query Logging** - Detailed execution logging
- **Performance Monitoring** - Execution time tracking

#### Parallel Executor (`parallelExecutor.ts`)
**Purpose:** Execute multiple coordinated queries simultaneously

**Parallel Execution Process:**
1. **Query Preparation** - Validate all query plans
2. **Promise Creation** - Create execution promises
3. **Parallel Execution** - Execute all queries simultaneously
4. **Result Aggregation** - Collect and organize results
5. **Error Handling** - Handle individual query failures
6. **Metadata Collection** - Track execution statistics

**Coordination Features:**
- **Promise.allSettled()** - Handle partial failures gracefully
- **Result Typing** - Distinguish primary, contextual, and connection results
- **Error Aggregation** - Collect all errors for reporting
- **Performance Tracking** - Measure total execution time

### 5. Database Schema and Ontology

#### Ontology (`ontology.ts`)
**Purpose:** Define database schema structure and relationships

**Entity Definitions:**
```typescript
const ENTITY_DEFINITIONS = {
  commits: {
    table: "commits",
    columns: {
      id: "uuid",
      hash: "text",
      message: "text",
      committed_at: "timestamp with time zone",
      created_at: "timestamp with time zone",
      project_id: "uuid",
      branch: "text",
      author: "text"
    },
    primary_key: "id",
    foreign_keys: {
      project_id: "projects.id"
    }
  },
  // ... other entities
};
```

**Supported Entities:**
- **commits** - Code commits with messages, authors, timestamps
- **interactions** - AI tool conversations (prompts/responses)
- **conversations** - Grouped interactions by platform
- **projects** - Repository information
- **users** - Developer profiles and activity
- **interaction_diffs** - File changes from AI interactions
- **pull_requests** - Pull request metadata

**Relationship Types:**
1. **Foreign Key Relationships** - Direct table relationships
2. **Text-Based Joins** - Author field matching (users.github_username = commits.author)
3. **Cross-Domain Relationships** - Multi-table queries

**Security Constraints:**
- **Restricted Columns** - Sensitive fields automatically redacted
- **Allowed Joins** - Whitelist of valid table relationships
- **Aggregation Rules** - Type-specific aggregation constraints

### 6. Security and Safety Mechanisms

#### SQL Injection Protection
**Multi-Layer Defense:**
1. **Parameterized Queries** - All values properly escaped
2. **Keyword Detection** - Blocks dangerous SQL keywords
3. **Schema Validation** - Only allows known entities/columns
4. **Join Validation** - Prevents unauthorized table relationships
5. **Read-Only Enforcement** - No mutation operations allowed

#### Data Privacy
**Automatic Redaction:**
- `users.email` - Email addresses redacted
- `users.auth_user_id` - Authentication IDs redacted
- Custom redaction rules for sensitive fields

#### Access Control
**Project Scoping:**
- All queries automatically scoped to specific project
- Cross-project access prevented
- Project ID validation on all operations

#### Content Moderation
**Guardrails Integration:**
- PII detection and anonymization
- Content moderation for inappropriate material
- Jailbreak detection for prompt injection
- Hallucination detection for AI responses

### 7. Advanced Features

#### Contextual Workflow
**Rich Context Discovery:**
- Analyzes queries for related contextual information
- Identifies temporal, semantic, and causal relationships
- Creates coordinated multi-query plans
- Synthesizes results with rich context

**Connection Strategies:**
- **Time-Based** - Connect events by temporal proximity
- **Commit-Based** - Link conversations to resulting commits
- **Semantic** - Connect related concepts and topics
- **File-Based** - Link conversations to file changes
- **Author-Based** - Connect activities by the same person

#### Multi-Stage Query Planning
**Coordinated Execution:**
- Primary query for main intent
- Contextual queries for related information
- Connection queries for explicit linking
- Synthesis strategy for combining results

#### Parallel Execution
**Performance Optimization:**
- Simultaneous query execution
- Graceful handling of partial failures
- Result aggregation and coordination
- Performance monitoring and logging

### 8. Error Handling and Recovery

#### Validation Errors
**Query Plan Validation:**
- Entity existence checks
- Column name validation
- Join relationship verification
- Aggregation function validation
- Security keyword detection

**Error Response:**
- Detailed error messages with specific issues
- Suggestions for query correction
- Graceful degradation to simpler queries

#### Execution Errors
**Database Errors:**
- Connection failure handling
- Query timeout management
- Transaction rollback on errors
- Detailed error logging

**Recovery Strategies:**
- Automatic retry for transient failures
- Fallback to simpler query plans
- Graceful error messages to users
- Comprehensive error logging

#### Agent Errors
**LLM Errors:**
- Model unavailability handling
- Response format validation
- Fallback to simpler models
- Error message synthesis

### 9. Performance Considerations

#### Database Optimization
**Connection Pooling:**
- Efficient connection reuse
- Configurable pool size
- Connection timeout management
- Automatic cleanup

**Query Optimization:**
- Row limits (200 max)
- Efficient JOIN strategies
- Index-friendly query patterns
- Time window constraints

#### Caching Strategy
**Model Response Caching:**
- Store agent responses for reuse
- Cache validation results
- Reuse query plans for similar queries
- Performance monitoring

#### Parallel Processing
**Multi-Query Execution:**
- Simultaneous query execution
- Resource sharing optimization
- Load balancing across queries
- Performance monitoring

### 10. Configuration and Environment

#### Model Configuration (`config.ts`)
**OpenAI Models:**
- Router Model: GPT-5 (minimal reasoning)
- Planner Model: GPT-5 (medium reasoning)
- Synthesizer Model: GPT-5 (low reasoning)
- Guardrail Model: GPT-4o-mini

**Reasoning Effort Levels:**
- Minimal: Fast, simple tasks
- Low: Basic reasoning required
- Medium: Complex reasoning needed

#### Environment Variables
**Required Configuration:**
- `OPENAI_API_KEY` - OpenAI API access
- `DATABASE_URL` - PostgreSQL connection string

**Optional Configuration:**
- Connection pool settings
- Model selection
- Guardrails configuration
- Logging levels

## Detailed Workflow Execution

### Standard Workflow Execution

1. **Input Processing**
   - User provides natural language query
   - System validates input format
   - Creates conversation history

2. **Domain Routing**
   - Router agent analyzes query
   - Classifies into appropriate domain(s)
   - Identifies cross-domain relationships
   - Returns domain classification

3. **Query Planning**
   - Selects appropriate planner agent
   - Analyzes query intent and requirements
   - Generates structured query plan
   - Validates plan against ontology

4. **SQL Validation**
   - Validates query plan structure
   - Checks entity and column existence
   - Verifies join relationships
   - Generates safe, parameterized SQL

5. **Query Execution**
   - Establishes database connection
   - Begins read-only transaction
   - Executes validated SQL
   - Processes and returns results

6. **Answer Synthesis**
   - Synthesizer agent processes results
   - Converts data to conversational format
   - Identifies patterns and insights
   - Generates natural language response

### Contextual Workflow Execution

1. **Context Analysis**
   - Analyzes query for related contexts
   - Identifies temporal, semantic relationships
   - Prioritizes contextual intents
   - Chooses connection strategies

2. **Multi-Stage Planning**
   - Creates primary query plan
   - Generates contextual query plans
   - Defines connection strategies
   - Coordinates all plans

3. **Parallel Execution**
   - Executes all queries simultaneously
   - Handles partial failures gracefully
   - Aggregates results and metadata
   - Tracks performance metrics

4. **Contextual Synthesis**
   - Combines primary and contextual results
   - Highlights connections between data sources
   - Creates unified, rich response
   - Provides comprehensive context

## Example Query Flows

### Simple Commit Query
**Input:** "Show me recent commits"

**Flow:**
1. Router → Domain: "commit"
2. Commit Planner → Query plan for recent commits
3. Validator → Safe SQL with time filter
4. Executor → Database query execution
5. Synthesizer → "I found 12 commits in the last 30 days..."

### Cross-Domain Query
**Input:** "Who built the auth extension?"

**Flow:**
1. Router → Domain: "user" + "commit" (cross-domain)
2. User Planner → Query plan with commit joins
3. Validator → SQL with user-commit relationships
4. Executor → Database query with joins
5. Synthesizer → "Sarah built the auth extension with 3 commits..."

### Contextual Query
**Input:** "Give me context about timeline function from page.tsx"

**Flow:**
1. Context Analyzer → Primary: file, Contextual: interactions, commits
2. Multi-Stage Planner → Coordinated query plans
3. Parallel Executor → Simultaneous execution
4. Contextual Synthesizer → Rich, connected response

## Conclusion

TigAgent represents a sophisticated approach to AI-powered database querying, combining the power of large language models with robust security, safety, and performance considerations. The system's modular architecture allows for easy extension and maintenance, while its comprehensive validation and execution layers ensure reliable, secure operation.

The agent system provides natural language access to complex developer data, transforming raw database queries into meaningful, actionable insights. Through its contextual analysis and multi-stage planning capabilities, TigAgent goes beyond simple query answering to provide rich, connected understanding of development workflows and team collaboration patterns.

This architecture demonstrates how AI agents can be safely and effectively integrated into production systems, providing powerful capabilities while maintaining security, performance, and reliability standards.

