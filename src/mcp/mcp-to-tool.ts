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
                        name: t.name,
                        arguments: args,
                    });

                    const texts = (res.content as any[])
                        ?.filter((c: any) => c?.type === "text")
                        .map((c: any) => c.text)
                        .filter(Boolean);

                    const result = texts?.length === 1 ? texts[0] : (texts ?? []);
                    return { result, ...(res.isError ? { error: true } : {}) };
                },
            });
        }
    }

    return all;
}
