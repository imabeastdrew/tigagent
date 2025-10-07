import { runGuardrails } from "@openai/guardrails";
import { Runner, AgentInputItem } from "@openai/agents";
import { WorkflowInput, Domain, QueryPlan, ExecutionResult } from "./types.js";
import { client, guardrailsConfig, guardrailsContext } from "./config.js";
import { guardrailsHasTripwire, getGuardrailSafeText, buildGuardrailFailOutput } from "./guardrailUtils.js";
import { routerAgent } from "./agents/routerAgent.js";
import { 
  commitPlannerAgent, 
  interactionPlannerAgent, 
  conversationPlannerAgent, 
  projectPlannerAgent, 
  userPlannerAgent 
} from "./agents/plannerAgents.js";
import { synthesizerAgent } from "./agents/synthesizerAgent.js";
import { validateAndBuildSQL } from "./validator.js";
import { executeQueryWithParams } from "./executor.js";
import { Pool } from "pg";

/**
 * Main workflow orchestrator for the Tig Agent SDK
 * 
 * Executes the full pipeline:
 * 1. Input guardrails
 * 2. Domain routing
 * 3. Query planning
 * 4. SQL validation
 * 5. Query execution
 * 6. Answer synthesis
 * 7. Output guardrails
 */
export async function runWorkflow(
  workflow: WorkflowInput, 
  pool: Pool
): Promise<string> {
  const conversationHistory: AgentInputItem[] = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: workflow.input_as_text
        }
      ]
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
    // Step 1: Input Guardrails
    console.log("Running input guardrails...");
    const guardrailsResult = await runGuardrails(
      workflow.input_as_text, 
      guardrailsConfig, 
      guardrailsContext
    );
    
    const guardrailsHastripwire = guardrailsHasTripwire(guardrailsResult);
    const guardrailsAnonymizedtext = getGuardrailSafeText(guardrailsResult, workflow.input_as_text);
    
    if (guardrailsHastripwire) {
      console.log("Input blocked by guardrails");
      return JSON.stringify(buildGuardrailFailOutput(guardrailsResult ?? []));
    }

    // Step 2: Domain Routing
    console.log("Routing domain...");
    const routerResult = await runner.run(routerAgent, [...conversationHistory]);
    conversationHistory.push(...routerResult.newItems.map((item) => item.rawItem));

    if (!routerResult.finalOutput) {
      throw new Error("Router agent result is undefined");
    }

    const domain = routerResult.finalOutput as Domain;
    console.log(`Routed to domain: ${domain}`);

    // Step 3: Query Planning
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
      case "project":
        plannerAgent = projectPlannerAgent;
        break;
      case "user":
        plannerAgent = userPlannerAgent;
        break;
      case "other":
        return "I'm not sure how to help with that type of query. Could you try asking about commits, interactions, conversations, projects, or users?";
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

    // Step 4: SQL Validation
    console.log("Validating and building SQL...");
    const validationResult = validateAndBuildSQL(queryPlan, workflow.project_id);
    
    if (!validationResult.isValid) {
      console.error("Query validation failed:", validationResult.issues);
      return `I couldn't process that query safely. Issues: ${validationResult.issues.join(', ')}`;
    }

    const safeSQL = validationResult.safeSQL!;
    console.log(`Generated safe SQL: ${safeSQL.substring(0, 100)}...`);

    // Step 5: Query Execution
    console.log("Executing query...");
    const executionResult = await executeQueryWithParams(
      safeSQL, 
      [workflow.project_id], // First parameter is always project_id
      pool
    );
    
    console.log(`Query executed: ${executionResult.rowCount} rows in ${executionResult.executionTimeMs}ms`);

    // Step 6: Answer Synthesis
    console.log("Synthesizing answer...");
    const synthesisInput = [
      ...conversationHistory,
      {
        role: "assistant",
        content: [
          {
            type: "input_text",
            text: `Query Results (${executionResult.rowCount} rows):\n${JSON.stringify(executionResult.rows, null, 2)}`
          }
        ]
      }
    ];

    const synthesisResult = await runner.run(synthesizerAgent, synthesisInput as any);
    conversationHistory.push(...synthesisResult.newItems.map((item) => item.rawItem));

    if (!synthesisResult.finalOutput) {
      throw new Error("Synthesizer agent result is undefined");
    }

    const synthesizedAnswer = synthesisResult.finalOutput as string;

    // Step 7: Output Guardrails
    console.log("Running output guardrails...");
    const outputGuardrailsResult = await runGuardrails(
      synthesizedAnswer,
      guardrailsConfig,
      guardrailsContext
    );

    const outputGuardrailsHastripwire = guardrailsHasTripwire(outputGuardrailsResult);
    
    if (outputGuardrailsHastripwire) {
      console.log("Output blocked by guardrails");
      return JSON.stringify(buildGuardrailFailOutput(outputGuardrailsResult ?? []));
    }

    const finalAnswer = getGuardrailSafeText(outputGuardrailsResult, synthesizedAnswer);
    
    console.log("Workflow completed successfully");
    return finalAnswer;

  } catch (error) {
    console.error("Workflow error:", error);
    return `I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}
