import { GeminiLayer } from "./ai";
import type { Tool } from "../tools";
import { z } from "zod";
import type { NormalizedResponse, State, Conversation } from "./types";

export const ModelOutputSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("TOOL_REQUEST"),
        tool: z.string().min(1),
        args: z.record(z.string(), z.unknown()).default({}),
    }),
    z.object({
        kind: z.literal("TEXT_RESPONSE"),
        message: z.string().min(1),
    }),
    z.object({
        kind: z.literal("END"),
        message: z.string().min(1).optional(),
    }),
]);

const MAX_CYCLES = 10;

const SYSTEM_PROMPT = `You are a coding agent with tool access.
Rules:
- Use tools only when needed.
- If a tool result already answers the user, respond with plain text.
- Do not repeat the same tool call with identical arguments unless the previous call clearly failed due to a transient error.
- If no more tool actions are required, respond with plain text.`;

function toResponseObject(value: unknown): Record<string, unknown> {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    return { value };
}

function normalizeResponse(raw: any): NormalizedResponse {
    const directFunc = raw?.functionCalls?.[0];
    const partFunc = raw?.candidates?.[0]?.content?.parts?.find(
        (p: any) => p?.functionCall,
    )?.functionCall;
    const func = directFunc ?? partFunc;

    if (func) {
        const toolName = typeof func?.name === "string" ? func.name : "";

        if (!toolName) {
            return { kind: "FAILED", message: "Tool call missing tool name" };
        }

        return {
            kind: "TOOL_REQUEST",
            tool: toolName,
            args: (func?.args as Record<string, unknown>) ?? {},
        };
    }

    const directText = typeof raw?.text === "string" ? raw.text.trim() : "";
    const partText =
        typeof raw?.candidates?.[0]?.content?.parts?.[0]?.text === "string"
            ? raw.candidates[0].content.parts[0].text.trim()
            : "";
    const text = directText || partText;

    if (!text) {
        return { kind: "FAILED", message: "Empty model response" };
    }

    try {
        const parsed = JSON.parse(text);
        const validated = ModelOutputSchema.safeParse(parsed);

        if (!validated.success) {
            return { kind: "TEXT_RESPONSE", message: text };
        }

        if (validated.data.kind === "TOOL_REQUEST") {
            return {
                kind: "TOOL_REQUEST",
                tool: validated.data.tool,
                args: validated.data.args,
            };
        }

        if (validated.data.kind === "TEXT_RESPONSE") {
            return {
                kind: "TEXT_RESPONSE",
                message: validated.data.message,
            };
        }

        return {
            kind: "END",
            message: validated.data.message,
        };
    } catch {
        return { kind: "TEXT_RESPONSE", message: text };
    }
}

class Agent {
    conversation: Conversation[];
    states: State[];
    cycles: number;
    maxCycles: number;
    ai: GeminiLayer;
    model: string;
    tools: Tool[];

    constructor(config: {
        model: string;
        apiKey: string;
        maxCycles?: number;
        tools?: Tool[];
    }) {
        this.ai = new GeminiLayer({
            apikey: config.apiKey,
        });
        this.tools = config.tools ?? [];
        this.maxCycles = config.maxCycles ?? MAX_CYCLES;
        this.model = config.model;
        this.cycles = 0;
        this.states = [];
        this.conversation = [];
    }

    private findTool(name: string): Tool | undefined {
        return this.tools.find((t) => t.declaration.name === name);
    }

    private async runToolCall(toolName: string, args: Record<string, unknown>) {
        const tool = this.findTool(toolName);

        if (!tool) {
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return await tool.func(args);
    }

    async agentLoop(conversation: Conversation | Conversation[]) {
        this.cycles = 0;
        this.states = [];

        console.log("[agent] loop start", {
            model: this.model,
            maxCycles: this.maxCycles,
            tools: this.tools.map((t) => t.declaration.name),
        });
        console.log("---");
        const contents = Array.isArray(conversation)
            ? [...conversation]
            : [conversation];

        contents.unshift({
            role: "user",
            parts: [{ text: SYSTEM_PROMPT }],
        });

        this.conversation = contents;

        const recentToolCalls: string[] = [];

        while (this.cycles < this.maxCycles) {
            console.log("[agent] cycle", this.cycles);
            console.log("---");
            if (this.cycles === 0) {
                this.states.push({
                    kind: "START",
                    cycle: this.cycles,
                });
            }

            console.log("[agent] requesting model response");
            console.log("---");
            const response = await this.ai.ai.models.generateContent({
                model: this.model,
                contents,
                config: {
                    tools: [
                        {
                            functionDeclarations: this.tools.map(
                                (t) => t.declaration,
                            ),
                        },
                    ],
                },
            });

            const normalized = normalizeResponse(response);
            console.log("[agent] normalized", normalized.kind);
            console.log("---");

            if (normalized.kind === "TOOL_REQUEST") {
                this.states.push({
                    kind: "TOOL_REQUEST",
                    cycle: this.cycles,
                    tool: normalized.tool,
                    args: normalized.args,
                });

                try {
                    const callSignature = JSON.stringify({
                        tool: normalized.tool,
                        args: normalized.args,
                    });
                    recentToolCalls.push(callSignature);
                    if (recentToolCalls.length > 3) recentToolCalls.shift();

                    if (
                        recentToolCalls.length === 3 &&
                        recentToolCalls.every((s) => s === callSignature)
                    ) {
                        this.states.push({
                            kind: "FAILED",
                            cycle: this.cycles,
                            message:
                                "Detected repeated identical tool call loop",
                        });
                        console.log(
                            "[agent] stopping due to repeated identical tool calls",
                        );
                        console.log("---");
                        return;
                    }

                    const toolResult = await this.runToolCall(
                        normalized.tool,
                        normalized.args,
                    );
                    console.log("[agent] tool executed", normalized.tool);
                    console.log("---");

                    this.states.push({
                        kind: "TOOL_OUTPUT",
                        cycle: this.cycles,
                        results: {
                            tool: normalized.tool,
                            output: toolResult,
                        },
                    });

                    // feed tool result back to model context
                    contents.push({
                        role: "user",
                        parts: [
                            {
                                functionResponse: {
                                    name: normalized.tool,
                                    response: toResponseObject(toolResult),
                                },
                            },
                        ],
                    });

                    this.conversation = contents;
                    console.log(
                        "[agent] conversation updated with tool response",
                    );
                    console.log("---");
                } catch (error: any) {
                    this.states.push({
                        kind: "FAILED",
                        cycle: this.cycles,
                        message: error?.message ?? "Tool execution failed",
                    });
                    console.log(
                        "[agent] failed at tool execution",
                        error?.message,
                    );
                    console.log("---");
                    return;
                }
            } else if (normalized.kind === "TEXT_RESPONSE") {
                this.states.push({
                    kind: "TEXT_RESPONSE",
                    cycle: this.cycles,
                    message: normalized.message,
                });

                contents.push({
                    role: "model",
                    parts: [{ text: normalized.message }],
                });
                this.conversation = contents;
                console.log("[agent] text response received; ending loop");
                console.log("[states]", this.states);
                console.log("---");
                return;
            } else if (normalized.kind === "END") {
                this.states.push({
                    kind: "END",
                    cycle: this.cycles,
                    message: normalized.message,
                });
                console.log(normalized?.message);
                console.log("[states]", this.states);
                console.log("[agent] end signal received");
                console.log("---");
                return;
            } else {
                this.states.push({
                    kind: "FAILED",
                    cycle: this.cycles,
                    message: normalized.message,
                });
                console.log("[agent] normalize failed", normalized.message);
                console.log("---");
                return;
            }

            this.cycles += 1;
        }

        this.states.push({
            kind: "FAILED",
            cycle: this.cycles,
            message: "Max cycles reached",
        });
        console.log("[agent] failed: max cycles reached");
        console.log("---");
    }
}

export { Agent };
