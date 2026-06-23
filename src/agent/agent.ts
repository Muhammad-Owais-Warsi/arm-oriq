import { createInterface } from "node:readline/promises";
import { Agent } from "./loop";
import type { Conversation } from "./types";
import { MCP_SERVERS } from "../mcp/config";
import { connectMcpServers } from "../mcp/client";
import { discoverToolsFromMcp } from "../mcp/mcp-to-tool";

import { readFileSync } from "node:fs";
import { setPolicy } from "../policy/policy";

function getLastAgentMessage(agent: Agent): string | undefined {
    for (const state of [...agent.states].reverse()) {
        if (state.kind === "TEXT_RESPONSE") return state.message;
        if (state.kind === "END") return state.message ?? "Done.";
        if (state.kind === "FAILED") return `Failed: ${state.message}`;
    }

    return undefined;
}

async function runTurn(
    agent: Agent,
    conversation: Conversation[],
    prompt: string,
    conversationId: string,
    rl: any,
): Promise<Conversation[]> {
    const nextConversation: Conversation[] = [
        ...conversation,
        { role: "user", parts: [{ text: prompt }] },
    ];

    await agent.agentLoop(nextConversation, { conversationId, rl });
    return agent.conversation;
}

async function main() {
    const apiKey = process.env.API;
    if (!apiKey)
        throw new Error("Missing API env var. Set API before running.");

    const clients = await connectMcpServers(MCP_SERVERS);
    const tools = await discoverToolsFromMcp(clients);

    console.log(
        "Discovered tools:",
        tools.map((t) => t.declaration.name),
    );

    const raw = readFileSync(
        new URL("../policy/test.json", import.meta.url),
        "utf-8",
    );
    const parsed = JSON.parse(raw);
    setPolicy({
        toolRules: parsed.toolRules ?? [],
        fileRules: parsed.fileRules ?? [],
    });

    const agent = new Agent({
        model: "gemini-3.1-flash-lite",
        apiKey,
        tools,
    });

    let conversation: Conversation[] = [];
    const conversationId = `conv-${Date.now()}`;

    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log('Interactive mode. Type "exit" to quit.');

    try {
        while (true) {
            const input = (await rl.question("you> ")).trim();
            if (!input) continue;

            const lower = input.toLowerCase();
            if (
                lower === "exit" ||
                lower === "quit" ||
                lower === "/exit" ||
                lower === "/quit"
            ) {
                console.log("Bye.");
                break;
            }

            conversation = await runTurn(
                agent,
                conversation,
                input,
                conversationId,
                rl,
            );
            const finalMessage = getLastAgentMessage(agent);
            if (finalMessage) console.log(`assistant: ${finalMessage}`);
        }
    } finally {
        rl.close();
    }
}

await main();
