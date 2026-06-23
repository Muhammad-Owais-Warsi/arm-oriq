export type ToolRule = {
    id: string;
    enabled: boolean;
    priority: number;
    toolPattern: string;
    action: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
    reason?: string;
};

export type FileRule = {
    name: string;
    conditions: {
        maxLength: number;
        argPathPrefix: string;
    };
};

export type ToolIntent = {
    conversationId: string;
    toolName: string;
    args: Record<string, unknown>;
};
