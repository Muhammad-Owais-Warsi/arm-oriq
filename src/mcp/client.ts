import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig } from "./config.js";

export type ConnectedMcpClient = {
    id: string;
    client: Client;
};

function toUrl(url: string): URL {
    return new URL(url);
}

export async function connectMcpServers(
    configs: McpServerConfig[],
): Promise<ConnectedMcpClient[]> {
    const connected: ConnectedMcpClient[] = [];

    for (const cfg of configs) {
        const client = new Client({
            name: `armiq-agent-${cfg.id}`,
            version: "1.0.0",
        });

        if (cfg.transport === "streamable-http") {
            const transport = new StreamableHTTPClientTransport(
                toUrl(cfg.url),
                cfg.headers
                    ? {
                          requestInit: {
                              headers: cfg.headers,
                          },
                      }
                    : undefined,
            );
            await client.connect(transport);
        } else if (cfg.transport === "sse") {
            const transport = new SSEClientTransport(
                toUrl(cfg.url),
                cfg.headers
                    ? {
                          requestInit: {
                              headers: cfg.headers,
                          },
                          eventSourceInit: {
                              fetch: (url, init) =>
                                  fetch(url, {
                                      ...(init ?? {}),
                                      headers: {
                                          ...((init?.headers as
                                              | Record<string, string>
                                              | undefined) ?? {}),
                                          ...cfg.headers,
                                      },
                                  }),
                          },
                      }
                    : undefined,
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
