import { Agent } from "./loop";
import { MCP_SERVERS } from "../mcp/config";
import { connectMcpServers } from "../mcp/client";
import { discoverToolsFromMcp } from "../mcp/mcp-to-tool";

async function main() {
    const apiKey = process.env.API;
    if (!apiKey)
        throw new Error("Missing API env var. Set API before running.");

    const prompt = process.argv.slice(2).join(" ").trim();
    if (!prompt)
        throw new Error('Usage: bun run src/agent/agent.ts "your prompt"');

    const clients = await connectMcpServers(MCP_SERVERS);
    const tools = await discoverToolsFromMcp(clients);

    console.log(
        "Discovered tools:",
        tools.map((t) => t.declaration.name),
    );

    const agent = new Agent({
        model: "gemini-3.1-flash-lite",
        apiKey,
        tools,
    });

    await agent.agentLoop([{ role: "user", parts: [{ text: prompt }] }]);
}

await main();
