import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
export declare function getDb(): Pool;
/**
 * Create Anthropic client
 */
export declare function createAnthropicClient(): Anthropic;
/**
 * Model configurations for each specialized agent
 */
export declare const AGENT_MODELS: {
    discovery: string;
    threadFollowing: string;
    knowledgeMining: string;
    temporalContext: string;
    synthesis: string;
    judge: string;
    worker: string;
};
/**
 * S2 Stream configuration
 * If S2_API_KEY is not set, will fall back to in-memory storage
 */
export declare const S2_CONFIG: {
    accessToken: string | undefined;
    basin: string | undefined;
    enabled: boolean;
};
/**
 * System prompts for each agent
 */
export declare const AGENT_PROMPTS: {
    discovery: string;
    threadFollowing: string;
    knowledgeMining: string;
    temporalContext: string;
    synthesis: string;
};
//# sourceMappingURL=config.d.ts.map