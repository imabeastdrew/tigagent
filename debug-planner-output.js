import { Runner } from "@openai/agents";
import { commitPlannerAgent } from './dist/agents/plannerAgents.js';

async function debugPlanner() {
  const runner = new Runner();
  
  const conversationHistory = [
    {
      role: "user",
      content: "give me a summary of the context from the last commit"
    }
  ];

  try {
    console.log("Running planner agent...");
    const result = await runner.run(commitPlannerAgent, conversationHistory);
    
    if (result.finalOutput) {
      console.log("Query plan:");
      console.log(JSON.stringify(result.finalOutput, null, 2));
    } else {
      console.log("No final output from planner");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

debugPlanner();