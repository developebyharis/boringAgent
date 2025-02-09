import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { configDotenv } from "dotenv";
import { DynamicTool } from "@langchain/core/tools";
import officeparser from "officeparser";
configDotenv();

export async function generateCode(prompt) {
  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/Salesforce/codet5-base",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_length: 1000,
            num_beams: 4,
            early_stopping: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error: ${errorText}`);
    }

    const data = await response.json();
    return data[0]?.generated_text || "No code generated.";
  } catch (error) {
    console.error("Error generating code:", error);
    return "An error occurred while generating code.";
  }
}

async function loadOfficeFile(filePath) {
  return new Promise((resolve, reject) => {
    officeparser.parseOffice(filePath, (data, err) => {
      if (err) {
        console.error("Error parsing file:", err);
        reject(err);
      } else {
        // console.log("Parsed Data:", data);
        resolve(data);
      }
    });
  });
}

export async function processFile(filePath) {
  
  console.log("file:", filePath);
  try {
    const content = await loadOfficeFile(filePath);
    // console.log("content:", content);
    const relevantData = content.slice(0, 1000); // Adjust slicing logic if needed
    // console.log("reve:", relevantData);

    const prompt = `
      You are a helpful AI assistant with expertise in any subject.
      
      Here is the assignment data: ${JSON.stringify(relevantData)}
      
      Please:
      1. Read through the assignment carefully
      2. For each question, provide:
         - A clear solution with step-by-step explanations
      3. Format your response clearly with proper headings and sections
      4. If there are multiple questions, answer them one by one
      Don't just analyze the assignment - solve it completely with detailed explanations.
    `;

    const programmingTool = new DynamicTool({
      name: "programming_assistant",
      description:
        "Use this tool for solving programming tasks, generating code, debugging, or any task involving coding.",
      func: async (input) => {
        console.log("Programming Tool Invoked");
        return await generateCode(input);
      },
    });

    const generalAssistant = new DynamicTool({
      name: "general_assistant",
      description:
        "Use this tool for general-purpose tasks, including explanations, analysis, or summarization.",
      func: async (input) => {
        console.log("General Assistant Tool Invoked");
        const assistantModal = new ChatGoogleGenerativeAI({
          model: "gemini-1.5-flash",
          temperature: 0.2,
          maxOutputTokens: 2048,
        });
        const response = await assistantModal.invoke(input);
        return response.content;
      },
    });

    const agentTools = [
      new TavilySearchResults({
        maxResults: 5,
      }),
      programmingTool,
      generalAssistant,
    ];

    const agentModel = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-flash",
      temperature: 0.2,
      maxOutputTokens: 2048,
    });
    const systemPrompt = `
    You are an AI agent equipped with multiple tools. Each tool is designed for a specific type of task:
    - "programming_assistant": Use this for tasks that involve writing, debugging, or explaining code.
    - "general_assistant": Use this for general-purpose tasks, including explanations or analysis.
    - "search_tool": Use this for finding information online.
  
    Analyze the task and select the most appropriate tool. If unsure, explain your reasoning.
  `;

    const agentCheckpointer = new MemorySaver();
    const agent = createReactAgent({
      llm: agentModel,
      tools: agentTools,
      systemMessage: systemPrompt,
      checkpointSaver: agentCheckpointer,
      tracing: true,
    });

    try {
      const agentFinalState = await agent.invoke(
        {
          messages: [new HumanMessage(prompt)],
        },
        { configurable: { thread_id: "1" } }
      );

      // console.log(
      //   "Final Response:",
      //   agentFinalState.messages[agentFinalState.messages.length - 1].content
      // );
      return agentFinalState.messages[agentFinalState.messages.length - 1].content;
    } catch (err) {
      console.error("Error invoking agent:", err);
    }
  } catch (err) {
    console.error("Error loading file:", err);
    console.error("Error loading file:", err.message);
    console.error("Stack Trace:", err.stack);
  }
}

processFile();
