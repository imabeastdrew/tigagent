import { OpenAI } from "openai";
import dotenv from "dotenv";

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });

/**
 * Shared OpenAI client instance
 */
export const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

/**
 * Guardrails configuration for content moderation
 */
export const guardrailsConfig = {
  guardrails: [
    {
      name: "Moderation",
      config: {
        categories: [
          "sexual",
          "sexual/minors", 
          "hate",
          "hate/threatening",
          "harassment",
          "harassment/threatening",
          "self-harm",
          "self-harm/intent",
          "self-harm/instructions",
          "violence",
          "violence/graphic",
          "illicit",
          "illicit/violent"
        ]
      }
    }
  ]
};

/**
 * Context for guardrails execution
 */
export const guardrailsContext = { 
  guardrailLlm: client 
};

/**
 * Model configuration for different agents
 */
export const MODEL_CONFIG = {
  routerModel: "gpt-5",
  plannerModel: "gpt-5", 
  synthesizerModel: "gpt-5",
  guardrailModel: "gpt-4o-mini"
};

/**
 * Model settings for reasoning effort
 */
export const MODEL_SETTINGS = {
  minimal: {
    reasoning: {
      effort: "minimal" as const
    },
    store: true
  },
  low: {
    reasoning: {
      effort: "low" as const
    },
    store: true
  },
  medium: {
    reasoning: {
      effort: "medium" as const
    },
    store: true
  }
};
