export type McpServerConfig =
    | {
          id: string;
          transport: "sse";
          url: string;
      }
    | {
          id: string;
          transport: "stdio";
          command: string;
          args?: string[];
      };

export const MCP_SERVERS: McpServerConfig[] = [
    {
        id: "custom",
        transport: "stdio",
        command: "node",
        args: ["dist/mcp/server.js"],
    },
];
