import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

type HeaderMap = Record<string, string>;

export type McpServerConfig =
    | {
          id: string;
          transport: "streamable-http";
          url: string;
          headers?: HeaderMap;
      }
    | {
          id: string;
          transport: "sse";
          url: string;
          headers?: HeaderMap;
      }
    | {
          id: string;
          transport: "stdio";
          command: string;
          args?: string[];
      };

export const MCP_SERVERS: McpServerConfig[] = [
    {
        id: "external",
        transport: "streamable-http",
        url: "https://mcp.exa.ai/mcp",
        headers: process.env.EXA_API_KEY
            ? { Authorization: `Bearer ${process.env.EXA_API_KEY}` }
            : undefined,
    },
    {
        id: "custom",
        transport: "stdio",
        command: "node",
        args: [join(__dirname, "../../dist/mcp/server.js")],
    },
];
