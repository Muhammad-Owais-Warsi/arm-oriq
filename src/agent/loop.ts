import { GeminiLayer } from "./ai";
import type { Tool } from "../tools";
import type { NormalizedResponse, State, Conversation } from "./types";
import { evaluatePolicy } from "../policy/engine";
import {
    clearHumanApproval,
    getHumanApproval,
    getPolicySnapshot,
    updateHumanApproval,
} from "../policy/policy";
import { buildSystemPrompt } from "./prompt";
import { ModelOutputSchema } from "./types";

const MAX_CYCLES = 10;

async function runHumanApproval(toolName: string, rl: any) {
    const decision = (
        await rl.question(`Approval required for ${toolName}. Allow? (y/n): `)
    )
        .trim()
        .toLowerCase();

    if (decision === "y" || decision === "yes") {
        return "ALLOW";
    }

    if (decision === "n" || decision === "no") {
        return "DENY";
    }

    return undefined;
}

function isFinishToolName(toolName: string): boolean {
    return toolName.split("__").pop() === "finish_task";
}

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

    async agentLoop(
        conversation: Conversation | Conversation[],
        opts?: {
            conversationId?: string;
            rl: any;
        },
    ) {
        this.cycles = 0;
        this.states = [];

        console.log("[agent] loop start", {
            model: this.model,
            maxCycles: this.maxCycles,
            tools: this.tools.map((t) => t.declaration.name),
        });
        console.log("---");
        // Use `any[]` so we can push raw SDK Content objects (which carry
        // thought_signature and other metadata) alongside our typed messages.
        const contents: any[] = Array.isArray(conversation)
            ? [...conversation]
            : [conversation];

        this.conversation = contents;
        const systemPrompt = buildSystemPrompt();
        const conversationId =
            opts?.conversationId && opts.conversationId.trim().length > 0
                ? opts.conversationId
                : "conv-default";

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
                    systemInstruction: systemPrompt,
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
                const isFinishTool = isFinishToolName(normalized.tool);
                this.states.push({
                    kind: "TOOL_REQUEST",
                    cycle: this.cycles,
                    tool: normalized.tool,
                    args: normalized.args,
                });

                const modelContent = response.candidates?.[0]?.content;
                if (modelContent) {
                    contents.push(modelContent);
                }

                try {
                    const { toolRules, fileRules } = getPolicySnapshot();
                    const decision = evaluatePolicy(toolRules, fileRules, {
                        conversationId,
                        toolName: normalized.tool,
                        args: normalized.args,
                    });

                    let approval = getHumanApproval(
                        conversationId,
                        normalized.tool,
                    );

                    if (decision.kind === "REQUIRE_APPROVAL" && !approval) {
                        const userDecision = await runHumanApproval(
                            normalized.tool,
                            opts?.rl,
                        );

                        if (
                            userDecision === "ALLOW" ||
                            userDecision === "DENY"
                        ) {
                            updateHumanApproval(
                                userDecision,
                                conversationId,
                                normalized.tool,
                            );
                            approval = getHumanApproval(
                                conversationId,
                                normalized.tool,
                            );
                        }
                    }

                    const effectiveDecision =
                        decision.kind === "REQUIRE_APPROVAL" &&
                        approval?.status === "ALLOW"
                            ? { ...decision, kind: "ALLOW" as const }
                            : decision.kind === "REQUIRE_APPROVAL" &&
                                approval?.status === "DENY"
                              ? {
                                    ...decision,
                                    kind: "DENY" as const,
                                    reason: "Human denied this tool call",
                                }
                              : decision;

                    if (effectiveDecision.kind !== "ALLOW") {
                        const blockedResult = {
                            error: true,
                            policy: {
                                decision: effectiveDecision.kind,
                                reason: effectiveDecision.reason,
                                matchedRuleId: effectiveDecision.matchedRuleId,
                                approvalRequired:
                                    effectiveDecision.kind ===
                                    "REQUIRE_APPROVAL",
                                conversationId,
                                toolName: normalized.tool,
                            },
                        };

                        this.states.push({
                            kind: "TOOL_OUTPUT",
                            cycle: this.cycles,
                            results: {
                                tool: normalized.tool,
                                output: blockedResult,
                            },
                        });

                        contents.push({
                            role: "user",
                            parts: [
                                {
                                    functionResponse: {
                                        name: normalized.tool,
                                        response:
                                            toResponseObject(blockedResult),
                                    },
                                },
                            ],
                        });

                        this.conversation = contents;
                        console.log(
                            `[agent] tool blocked by policy (${effectiveDecision.kind})`,
                            normalized.tool,
                        );
                        console.log("---");
                        this.cycles += 1;
                        continue;
                    }

                    const toolResult = await this.runToolCall(
                        normalized.tool,
                        normalized.args,
                    );

                    // Consume ALLOW approval once used, so approval stays per-conversation
                    // and per-request action, not a permanent bypass.
                    if (
                        decision.kind === "REQUIRE_APPROVAL" &&
                        approval?.status === "ALLOW"
                    ) {
                        clearHumanApproval(conversationId, normalized.tool);
                    }
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

                    if (isFinishTool) {
                        const message =
                            typeof normalized.args.message === "string" &&
                            normalized.args.message.trim().length > 0
                                ? normalized.args.message.trim()
                                : "Task completed.";
                        this.states.push({
                            kind: "END",
                            cycle: this.cycles,
                            message,
                        });
                        console.log("[agent] finish_task called; ending loop");
                        console.log("[states]", this.states);
                        console.log("---");
                        return;
                    }

                    // Feed tool result back to model as a user functionResponse turn.
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
