import { Agent } from "@openai/agents";
import { DomainSchema } from "../types.js";
import { MODEL_CONFIG, MODEL_SETTINGS } from "../config.js";

/**
 * Domain Router Agent
 * 
 * Classifies user queries into one of the six core domains:
 * - commit: Queries about code commits, changes, authors
 * - interaction: Queries about AI interactions, prompts/responses
 * - conversation: Queries about conversation threads, discussions
 * - file: Queries about specific files (not implemented in v1.0)
 * - project: Queries about repositories, projects
 * - user: Queries about developers, contributors
 * - other: Queries that don't fit the above categories
 */
export const routerAgent = new Agent({
  name: "Domain Router",
  instructions: `You classify a user's natural language question into a domain for the Tig Agent SDK. You can now detect both single-domain and cross-domain queries.

DOMAINS:

• commit — Queries about code commits, changes, authors, and commit history.
  Examples: "Which commits touched auth.ts?", "Who made the most commits last week?", "Show me commits from yesterday", "What was changed in the latest commit?"

• interaction — Queries about AI interactions, prompts, responses, and AI conversations.
  Examples: "Show me AI conversations about authentication", "What prompts were used for the login feature?", "Which AI model was used most?", "Show me interactions about error handling"

• conversation — Queries about conversation threads, discussions, and chat sessions.
  Examples: "What were the main discussions about rate limiting?", "Show me conversations about the API refactor", "Which conversations had the most activity?", "What topics were discussed this week?"

• project — Queries about repositories, projects, and project-level information.
  Examples: "Which repos have the most activity?", "Show me all projects", "What's the status of the main project?", "Which project has the most commits?"

• user — Queries about developers, contributors, and user activity.
  Examples: "Who worked on the onboarding flow?", "Show me the most active developers", "Which users contributed to auth.ts?", "Who has the most interactions?"

• other — Queries that don't fit any of the above categories or are too general.
  Examples: "What is Tig?", "How does this work?", "Help me understand the system"

CROSS-DOMAIN QUERIES:
Some queries span multiple domains and require joins between tables:

• "Who built the auth extension?" → user + commit (via author field)
• "Which project has the most commits?" → project + commit (with aggregation)
• "Show me commits by John" → commit + user (via author field)
• "What AI conversations did Sarah have?" → user + interaction (via author field)
• "Which developer made the most interactions?" → user + interaction (with aggregation)

CLASSIFICATION RULES:
- For single-domain queries: Choose the most specific domain that matches the query intent
- For cross-domain queries: Set is_cross_domain=true and include all relevant domains
- If the query is asking about commits, changes, or code history → commit
- If the query is asking about AI prompts, responses, or AI conversations → interaction  
- If the query is asking about discussion threads or chat sessions → conversation
- If the query is asking about repositories or projects → project
- If the query is asking about people or developers → user
- If the query is too general or doesn't fit → other

Always respond with the primary domain and indicate if it's cross-domain.`,
  model: MODEL_CONFIG.routerModel,
  outputType: {
    type: "json_schema",
    name: "domain_classification",
    schema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          enum: ["commit", "interaction", "conversation", "file", "project", "user", "other"]
        },
        is_cross_domain: {
          type: "boolean",
          description: "Whether this query spans multiple domains"
        },
        domains: {
          type: "array",
          items: {
            type: "string",
            enum: ["commit", "interaction", "conversation", "file", "project", "user", "other"]
          },
          description: "List of all domains involved in cross-domain queries"
        }
      },
      required: ["domain", "is_cross_domain", "domains"],
      additionalProperties: false
    }
  } as any,
  modelSettings: MODEL_SETTINGS.minimal
});
