import { Runner } from "@openai/agents";
import { routerAgent } from "./dist/agents/routerAgent.js";
import { commitPlannerAgent } from "./dist/agents/plannerAgents.js";
import { validateAndBuildSQL } from "./dist/validator.js";
import dotenv from 'dotenv';

dotenv.config();

async function debugWorkflowPlanner() {
  const runner = new Runner({
    traceMetadata: {
      __trace_source__: "debug-workflow-planner",
      workflow_id: "debug-workflow-planner",
      project_id: "bfd5c464-bd03-4748-8ea1-c79b38a155ce"
    }
  });

  const conversationHistory = [
    { role: "user", content: "Show me recent commits" }
  ];

  try {
    // Run router
    const routerResult = await runner.run(routerAgent, [...conversationHistory]);
    conversationHistory.push(...routerResult.newItems.map((item) => item.rawItem));
    
    // Run planner
    const plannerResult = await runner.run(commitPlannerAgent, [...conversationHistory]);
    const queryPlan = plannerResult.finalOutput;
    
    console.log('Planner output:');
    console.log(JSON.stringify(queryPlan, null, 2));
    
    // Validate and build SQL
    const validationResult = validateAndBuildSQL(queryPlan, "bfd5c464-bd03-4748-8ea1-c79b38a155ce");
    console.log('\nGenerated SQL:');
    console.log(validationResult.safeSQL);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugWorkflowPlanner();
