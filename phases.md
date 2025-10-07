🧩 Phase 0 — Business Intent & Context

Goal: Define what the agent is for and what it is not.

The Agent SDK is Tig’s search and reasoning engine, not a marketing or metrics product.

Purpose: enable users to ask natural-language questions about their repos, commits, and conversations — and receive contextual, conversational answers.

Focus: context retrieval and knowledge transfer, not improving model performance or running integration tests.

The agent operates over Tig’s schema (commits, interactions, conversations, projects, users, etc.) — essentially a database of how people and models collaborate on code.

Business intent: give vibecoders and teams AI-native visibility into why and how code changed — “what was happening when this commit was made?”

⚙️ Phase 1 — Schema Understanding

Goal: Ground the agent in the data reality.

Schema mirrors Tig’s Postgres tables (users, commits, interactions, conversations, projects, etc.).

Each entity is defined with foreign keys, timestamps, and relationships:

commits link to projects

interactions link to conversations (and then projects)

api_keys, pull_requests, etc., are excluded for v1.0.

Agent queries must operate within this relational graph.

All joins must be explicitly defined in an ontology file (ontology.ts).

There is no vector search or embeddings-based retrieval in v1.0 — only SQL and file-based reasoning.

🧠 Phase 2 — Agent Architecture

Goal: Define modular architecture and flow of control.

Modular system: each sub-agent (router, planner, validator, executor, synthesizer) is its own module.

The main orchestrator (AgentSDK) calls each in order.

Each step produces typed, structured data that flows to the next (e.g., QueryPlan → SQL → Results → Answer).

State is carried in-memory per request — no long-term memory.

Determinism: same input = same output, enforced through normalized planning and schema validation.

Read-only database access (no mutations).

Observability hooks (query hash, runtime, etc.) baked in for debugging.

🧩 Phase 3 — Safety and Guardrails

Goal: Create the moderation and safety pipeline.

Guardrails run twice:

Before query planning (input moderation)

After answer synthesis (output moderation)

Categories: sexual, hate, self-harm, violence, illicit, etc.

Also handles PII anonymization and hallucination detection.

Unsafe or unverifiable responses are rewritten or blocked.

Safe fallback: the agent rewrites the user query into a safe, equivalent phrasing instead of rejecting outright.

Tripwire mechanism: tripwireTriggered === true halts pipeline immediately.

Guardrail utilities: guardrailsHasTripwire, getGuardrailSafeText, and buildGuardrailFailOutput.

🧭 Phase 4 — Domain Routing

Goal: Classify what kind of data the question concerns.

Routes queries to one of Tig’s six core domains:
commit, interaction, conversation, file, project, user, or other.

Each route invokes a tailored ontology subset (schema + joins).

Routing is deterministic — single label per query (single-label-only).

Example:

“Who changed login last week?” → commit domain

“Show me the chats about onboarding” → conversation domain

“Which users contributed to auth.ts?” → user domain

Router uses a lightweight classification model (gpt-4.1-mini or similar) for minimal latency.

🧮 Phase 5 — Query Planning and Validation

Goal: Turn language into structured, safe, executable logic.

Planner

Converts natural language → structured QueryPlan object.

Includes: entities, filters, time windows, joins, and explanations.

Explains why each entity and filter was chosen.

Respects schema constraints and allowed columns.

No “fuzzy” logic or schema invention.

Validator

Converts QueryPlan → parameterized SQL.

Enforces:

Only whitelisted tables and columns.

No mutations (UPDATE, INSERT, etc.).

Row limit ≤ 200.

Default time window: 30 days if unspecified.

Mandatory project_id scoping.

Redaction of sensitive columns (email, api_keys.key_hash, etc.).

Fails closed: any unrecognized column, alias, or function halts execution.

Returns structured validation report (isValid, issues[], safeSQL).

🧱 Phase 6 — Execution and Synthesis

Goal: Execute safely and return an intelligent, human-style answer.

Executor

Uses pg.Pool to connect via process.env.DATABASE_URL.

Executes safeSQL read-only.

Returns structured JSON (rows, columns, stats).

Logs query hash, row count, latency, and timestamp.

No raw string interpolation — all parameterized queries.

Synthesizer

Converts structured data → insightful, conversational text.

Tone: confident, analytical, natural (developer-analyst style).

Avoids numeric dumps — focuses on patterns and explanations.

If no data: gracefully say so.

Example output:

“auth.ts was modified twice last week — once by Shreyas fixing validation, and once by Henry refactoring the session middleware.”

Runs output guardrails before final return (to filter PII/hallucination).

🧩 Phase 7 — Config and Multi-Model Hooks

Goal: Make the agent configurable for model selection and scaling.

Central config.ts defines model mapping:

export const MODEL_CONFIG = {
  plannerModel: "gpt-5-reasoning",
  validatorModel: "gpt-4.1-mini",
  synthesizerModel: "gpt-5",
  guardrailModel: "gpt-4o-mini"
};


Each module reads its model from this config.

OpenAI client initialized once per instance (AgentSDK).

Configurable max tokens, reasoning effort, and temperature.

🧩 Phase 8 — Output Behavior

Goal: Define how final responses should sound and behave.

Output type: natural text only (no tables, no links).

Style: conversational analyst tone — “explains what happened.”

Purpose: help users understand context, not just retrieve it.

Consistency: deterministic, factual, human-readable.

Failsafe: if data empty or ambiguous, summarize state clearly:

“I couldn’t find any related commits in the last 30 days.”