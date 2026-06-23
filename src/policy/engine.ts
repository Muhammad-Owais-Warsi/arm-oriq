import type { ToolIntent, ToolRule, FileRule } from "./types";

export type PolicyDecision = {
    kind: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
    reason: string;
    matchedRuleId?: string;
};

function matchTool(pattern: string, toolName: string): boolean {
    if (pattern.startsWith("/") && pattern.endsWith("/")) {
        return new RegExp(pattern.slice(1, -1)).test(toolName);
    }
    return pattern === toolName;
}

function evaluateFileRules(
    fileRules: FileRule[],
    intent: ToolIntent,
): PolicyDecision | null {
    const path = intent.args.path;
    if (typeof path !== "string") return null; // no file path in this intent

    for (const r of fileRules) {
        const { maxLength, argPathPrefix } = r.conditions;

        if (typeof maxLength === "number" && path.length > maxLength) {
            return { kind: "DENY", reason: `Path too long (rule: ${r.name})` };
        }

        if (argPathPrefix && !path.startsWith(argPathPrefix)) {
            return {
                kind: "DENY",
                reason: `Path must start with ${argPathPrefix} (rule: ${r.name})`,
            };
        }
    }

    return null;
}

export function evaluatePolicy(
    toolRules: ToolRule[],
    fileRules: FileRule[],
    intent: ToolIntent,
): PolicyDecision {
    // 1) file constraints first (hard safety)
    const fileDecision = evaluateFileRules(fileRules, intent);
    if (fileDecision) return fileDecision;

    // 2) tool rules
    const matched = toolRules
        .filter((r) => r.enabled)
        .filter((r) => matchTool(r.toolPattern, intent.toolName))
        .sort((a, b) => b.priority - a.priority);

    if (matched.length === 0) {
        return { kind: "ALLOW", reason: "No matching rule" };
    }

    const deny = matched.find((r) => r.action === "DENY");
    if (deny)
        return {
            kind: "DENY",
            reason: deny.reason ?? "Blocked by policy",
            matchedRuleId: deny.id,
        };

    const approval = matched.find((r) => r.action === "REQUIRE_APPROVAL");
    if (approval) {
        return {
            kind: "REQUIRE_APPROVAL",
            reason: approval.reason ?? "Requires human approval",
            matchedRuleId: approval.id,
        };
    }

    const allow = matched.find((r) => r.action === "ALLOW");
    return {
        kind: "ALLOW",
        reason: allow?.reason ?? "Allowed by policy",
        matchedRuleId: allow?.id,
    };
}
