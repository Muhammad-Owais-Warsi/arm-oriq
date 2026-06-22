import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig } from "./config.js";

export type ConnectedMcpClient = {
    id: string;
    client: Client;
};

export async function connectMcpServers(
    configs: McpServerConfig[],
): Promise<ConnectedMcpClient[]> {
    const connected: ConnectedMcpClient[] = [];

    for (const cfg of configs) {
        const client = new Client({
            name: `armiq-agent-${cfg.id}`,
            version: "1.0.0",
        });

        if (cfg.transport === "sse") {
            const transport = new SSEClientTransport(
                new (globalThis as any).URL(cfg.url),
            );
            await client.connect(transport);
        } else {
            const transport = new StdioClientTransport({
                command: cfg.command,
                args: cfg.args ?? [],
            });
            await client.connect(transport);
        }

        connected.push({ id: cfg.id, client });
    }

    return connected;
}
