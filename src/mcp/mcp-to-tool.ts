import type { ConnectedMcpClient } from "./client.js";
import type { Tool } from "../tools.js";

function safeToolName(serverId: string, toolName: string) {
    return `${serverId}__${toolName}`;
}

export async function discoverToolsFromMcp(
    clients: ConnectedMcpClient[],
): Promise<Tool[]> {
    const all: Tool[] = [];

    for (const { id, client } of clients) {
        const listed = await client.listTools();

        for (const t of listed.tools ?? []) {
            const exposedName = safeToolName(id, t.name);

            all.push({
                declaration: {
                    name: exposedName,
                    description:
                        t.description ?? `MCP tool ${t.name} from ${id}`,
                    parameters: (t.inputSchema as any) ?? {
                        type: "object",
                        properties: {},
                    },
                },
                func: async (args: Record<string, unknown>) => {
                    const res = await client.callTool({
                        name: t.name, // real MCP tool name
                        arguments: args,
                    });

                    // return text/content in a model-friendly shape
                    return res;
                },
            });
        }
    }

    return all;
}
