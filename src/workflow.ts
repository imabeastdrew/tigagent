import { Runner, AgentInputItem } from "@openai/agents";
import { WorkflowInput, Domain, QueryPlan, ExecutionResult, ContextAnalysis, MultiStageQueryPlan } from "./types.js";
import { routerAgent } from "./agents/routerAgent.js";
import { 
  commitPlannerAgent, 
  interactionPlannerAgent, 
  conversationPlannerAgent, 
  projectPlannerAgent, 
  userPlannerAgent,
  filePlannerAgent
} from "./agents/plannerAgents.js";
import { synthesizerAgent } from "./agents/synthesizerAgent.js";
import { contextAnalyzer } from "./agents/contextAnalyzer.js";
import { multiStagePlanner } from "./agents/multiStagePlanner.js";
import { contextualSynthesizer } from "./agents/contextualSynthesizer.js";
import { validateAndBuildSQL } from "./validator.js";
import { executeQueryWithParams } from "./executor.js";
import { executeMultiStageQueries } from "./parallelExecutor.js";
import { Pool } from "pg";

/**
 * Main workflow orchestrator for the Tig Agent SDK
 * 
 * Executes the full pipeline:
 * 1. Domain routing
 * 2. Query planning
 * 3. SQL validation
 * 4. Query execution
 * 5. Answer synthesis
 */
export async function runWorkflow(
  workflow: WorkflowInput, 
  pool: Pool
): Promise<string> {
  const conversationHistory: AgentInputItem[] = [
    {
      role: "user",
      content: workflow.input_as_text
    }
  ];

  const runner = new Runner({
    traceMetadata: {
      __trace_source__: "tig-agent-sdk",
      workflow_id: "tig-agent-workflow-v1",
      project_id: workflow.project_id
    }
  });

  try {
    // Step 1: Domain Routing
    console.log("Routing domain...");
    const routerResult = await runner.run(routerAgent, [...conversationHistory]);
    conversationHistory.push(...routerResult.newItems.map((item) => item.rawItem));

    if (!routerResult.finalOutput) {
      throw new Error("Router agent result is undefined");
    }

    const domainResult = routerResult.finalOutput as { domain: Domain; is_cross_domain?: boolean; domains?: string[] };
    const domain = domainResult.domain;
    const isCrossDomain = domainResult.is_cross_domain || false;
    const allDomains = domainResult.domains || [domain];
    
    console.log(`Routed to domain: ${domain}${isCrossDomain ? ` (cross-domain: ${allDomains.join(', ')})` : ''}`);

    // Step 2: Query Planning
    console.log("Planning query...");
    let plannerAgent;
    
    switch (domain) {
      case "commit":
        plannerAgent = commitPlannerAgent;
        break;
      case "interaction":
        plannerAgent = interactionPlannerAgent;
        break;
      case "conversation":
        plannerAgent = conversationPlannerAgent;
        break;
      case "file":
        plannerAgent = filePlannerAgent;
        break;
      case "project":
        plannerAgent = projectPlannerAgent;
        break;
      case "user":
        plannerAgent = userPlannerAgent;
        break;
      case "other":
        return "I'm not sure how to help with that type of query. Could you try asking about commits, interactions, conversations, files, projects, or users?";
      default:
        throw new Error(`Unknown domain: ${domain}`);
    }

    const plannerResult = await runner.run(plannerAgent, [...conversationHistory]);
    conversationHistory.push(...plannerResult.newItems.map((item) => item.rawItem));

    if (!plannerResult.finalOutput) {
      throw new Error("Planner agent result is undefined");
    }

    const queryPlan = plannerResult.finalOutput as QueryPlan;
    console.log(`Query plan created: ${queryPlan.intent_summary}`);

    // Step 3: SQL Validation
    console.log("Validating and building SQL...");
    const validationResult = validateAndBuildSQL(queryPlan, workflow.project_id);
    
    if (!validationResult.isValid) {
      console.error("Query validation failed:", validationResult.issues);
      return `I couldn't process that query safely. Issues: ${validationResult.issues.join(', ')}`;
    }

    const safeSQL = validationResult.safeSQL!;
    console.log(`Generated safe SQL: ${safeSQL.substring(0, 100)}...`);

    // Step 4: Query Execution
    console.log("Executing query...");
    const executionResult = await executeQueryWithParams(
      safeSQL, 
      [], // No parameters needed since SQL is fully resolved
      pool
    );
    
    console.log(`Query executed: ${executionResult.rowCount} rows in ${executionResult.executionTimeMs}ms`);

    // Step 5: Answer Synthesis
    console.log("Synthesizing answer...");
    const synthesisInput = [
      ...conversationHistory,
      {
        role: "user",
        content: `Query Results (${executionResult.rowCount} rows):\n${JSON.stringify(executionResult.rows, null, 2)}`
      }
    ];

    const synthesisResult = await runner.run(synthesizerAgent, synthesisInput as any);
    conversationHistory.push(...synthesisResult.newItems.map((item) => item.rawItem));

    if (!synthesisResult.finalOutput) {
      throw new Error("Synthesizer agent result is undefined");
    }

    const synthesizedAnswer = synthesisResult.finalOutput as string;
    
    console.log("Workflow completed successfully");
    return synthesizedAnswer;

  } catch (error) {
    console.error("Workflow error:", error);
    return `I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Enhanced contextual workflow that provides rich, cross-domain context
 * 
 * Executes the full pipeline with context analysis and multi-stage queries:
 * 1. Context Analysis - identifies primary intent and related contexts
 * 2. Multi-Stage Planning - creates coordinated query plans
 * 3. Parallel Execution - executes multiple queries simultaneously
 * 4. Contextual Synthesis - combines results with rich context
 */
export async function runContextualWorkflow(
  workflow: WorkflowInput, 
  pool: Pool
): Promise<string> {
  const runner = new Runner();
  const conversationHistory: AgentInputItem[] = [
    {
      role: "user",
      content: workflow.input_as_text
    }
  ];

  try {
    // Step 1: Context Analysis
    console.log("Analyzing context...");
    const contextResult = await runner.run(contextAnalyzer, [...conversationHistory]);
    conversationHistory.push(...contextResult.newItems.map((item) => item.rawItem));

    if (!contextResult.finalOutput) {
      throw new Error("Context analyzer result is undefined");
    }

    const contextAnalysis = contextResult.finalOutput as ContextAnalysis;
    console.log(`Context analysis: Primary=${contextAnalysis.primaryIntent.domain}, Contextual=${contextAnalysis.contextualIntents.length} intents`);

    // Step 2: Multi-Stage Planning
    console.log("Planning multi-stage queries...");
    const planningResult = await runner.run(multiStagePlanner, [...conversationHistory]);
    conversationHistory.push(...planningResult.newItems.map((item) => item.rawItem));

    if (!planningResult.finalOutput) {
      throw new Error("Multi-stage planner result is undefined");
    }

    const multiStagePlan = planningResult.finalOutput as MultiStageQueryPlan;
    console.log(`Multi-stage plan: Primary + ${multiStagePlan.contextualPlans.length} contextual queries`);

    // Step 3: Parallel Execution
    console.log("Executing parallel queries...");
    const executionResult = await executeMultiStageQueries(
      multiStagePlan,
      workflow.project_id,
      pool
    );

    if (!executionResult.success) {
      console.error("Query execution errors:", executionResult.errors);
      return `I encountered errors while processing your request: ${executionResult.errors.join(', ')}`;
    }

    console.log(`Parallel execution completed: ${executionResult.totalExecutionTimeMs}ms`);
    console.log(`Primary result rows: ${executionResult.primaryResult.result.rowCount}`);
    console.log(`Contextual results: ${executionResult.contextualResults.length} queries`);
    executionResult.contextualResults.forEach((result, index) => {
      console.log(`  Contextual ${index + 1}: ${result.result.rowCount} rows`);
    });

    // Step 4: Contextual Synthesis
    console.log("Synthesizing contextual results...");
    
    // Prepare execution results for synthesis
    const executionData = {
      contextAnalysis,
      multiStagePlan,
      executionResult: {
        primaryResult: executionResult.primaryResult,
        contextualResults: executionResult.contextualResults,
        connectionResult: executionResult.connectionResult,
        totalExecutionTimeMs: executionResult.totalExecutionTimeMs
      }
    };
    
    // Add execution results to conversation history for synthesis
    const synthesisInput = [
      ...conversationHistory,
      {
        role: "user",
        content: `EXECUTION RESULTS: Primary query found ${executionResult.primaryResult.result.rowCount} rows. Contextual queries found: ${executionResult.contextualResults.map(r => r.result.rowCount).join(', ')} rows. Total execution time: ${executionResult.totalExecutionTimeMs}ms.

PRIMARY DATA: ${JSON.stringify(executionResult.primaryResult.result.data, null, 2)}

CONTEXTUAL DATA: ${executionResult.contextualResults.map((result, index) => `Contextual ${index + 1}: ${JSON.stringify(result.result.data, null, 2)}`).join('\n\n')}`
      }
    ];
    
    const synthesisResult = await runner.run(contextualSynthesizer, synthesisInput as any);

    if (!synthesisResult.finalOutput) {
      throw new Error("Contextual synthesizer result is undefined");
    }

    console.log("Contextual workflow completed successfully");
    return synthesisResult.finalOutput as string;

  } catch (error) {
    console.error("Contextual workflow error:", error);
    return `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}`;
  }
}
