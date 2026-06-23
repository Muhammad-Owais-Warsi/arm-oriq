import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

type Note = { id: string; title: string; body: string };
const notes = new Map<string, Note>();

const server = new Server(
    { name: "armiq-custom-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "create_note",
            description: "Create a new note",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    body: { type: "string" },
                },
                required: ["id", "title", "body"],
                additionalProperties: false,
            },
        },
        {
            name: "get_note",
            description: "Get a note by id",
            inputSchema: {
                type: "object",
                properties: { id: { type: "string" } },
                required: ["id"],
                additionalProperties: false,
            },
        },
        {
            name: "update_note",
            description: "Update title/body of a note",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    body: { type: "string" },
                },
                required: ["id"],
                additionalProperties: false,
            },
        },
        {
            name: "delete_note",
            description: "Delete note by id",
            inputSchema: {
                type: "object",
                properties: { id: { type: "string" } },
                required: ["id"],
                additionalProperties: false,
            },
        },
        {
            name: "list_notes",
            description: "List all notes",
            inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
        {
            name: "finish_task",
            description:
                "Signal that the agent has completed the task and should stop",
            inputSchema: {
                type: "object",
                properties: {
                    message: { type: "string" },
                },
                additionalProperties: false,
            },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    try {
        if (name === "create_note") {
            const { id, title, body } = args as Record<string, string>;
            if (!id || !title || !body)
                throw new Error("id, title, body required");
            if (notes.has(id)) throw new Error(`note '${id}' already exists`);
            notes.set(id, { id, title, body });
            return { content: [{ type: "text", text: `created note ${id}` }] };
        }

        if (name === "get_note") {
            const { id } = args as Record<string, string>;
            const note = id ? notes.get(id) : undefined;
            if (!note) throw new Error(`note '${id}' not found`);
            return { content: [{ type: "text", text: JSON.stringify(note) }] };
        }

        if (name === "update_note") {
            const { id, title, body } = args as Record<string, string>;
            if (!id) throw new Error("id required");

            const note = notes.get(id);
            if (!note) throw new Error(`note '${id}' not found`);

            const updated = {
                ...note,
                ...(title ? { title } : {}),
                ...(body ? { body } : {}),
            };
            notes.set(id, updated);
            return { content: [{ type: "text", text: `updated note ${id}` }] };
        }

        if (name === "delete_note") {
            const { id } = args as Record<string, string>;
            if (!id) throw new Error("id required");
            const ok = notes.delete(id);
            if (!ok) throw new Error(`note '${id}' not found`);
            return { content: [{ type: "text", text: `deleted note ${id}` }] };
        }

        if (name === "list_notes") {
            return {
                content: [
                    { type: "text", text: JSON.stringify([...notes.values()]) },
                ],
            };
        }

        if (name === "finish_task") {
            const { message } = args as Record<string, string>;
            return {
                content: [
                    {
                        type: "text",
                        text: message?.trim() || "Task completed.",
                    },
                ],
            };
        }

        return {
            isError: true,
            content: [{ type: "text", text: `unknown tool: ${name}` }],
        };
    } catch (err) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: err instanceof Error ? err.message : "tool failed",
                },
            ],
        };
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
