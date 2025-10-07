import { Runner } from "@openai/agents";
import { routerAgent } from "./dist/agents/routerAgent.js";
import { commitPlannerAgent } from "./dist/agents/plannerAgents.js";
import dotenv from 'dotenv';

dotenv.config();

async function debugPlannerOutput() {
  const runner = new Runner({
    traceMetadata: {
      __trace_source__: "debug-planner-output",
      workflow_id: "debug-planner",
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
    console.log('Planner output:');
    console.log(JSON.stringify(plannerResult.finalOutput, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

debugPlannerOutput();
