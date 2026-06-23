import type { FileRule, ToolRule } from "./types";

let toolRules: ToolRule[] = [];
let fileRules: FileRule[] = [];

type HumanApprovalStatus = "ALLOW" | "DENY";
type HumanApprovalRecord = {
    status: HumanApprovalStatus;
    convId: string;
    toolName: string;
    updatedAt: number;
};

const humanApprovals = new Map<string, HumanApprovalRecord>();

function approvalKey(convId: string, toolName: string): string {
    return `${convId}::${toolName}`;
}

export function getPolicySnapshot(): {
    toolRules: ToolRule[];
    fileRules: FileRule[];
} {
    return {
        toolRules,
        fileRules,
    };
}

export function setToolRules(next: ToolRule[]): void {
    toolRules = next;
}

export function setFileRules(next: FileRule[]): void {
    fileRules = next;
}

export function updateHumanApproval(
    status: HumanApprovalStatus,
    convId: string,
    toolName: string,
): void {
    const normalizedConvId = convId.trim();
    const normalizedToolName = toolName.trim();

    if (!normalizedConvId) {
        throw new Error("convId is required");
    }

    if (!normalizedToolName) {
        throw new Error("toolName is required");
    }

    const key = approvalKey(normalizedConvId, normalizedToolName);
    humanApprovals.set(key, {
        status,
        convId: normalizedConvId,
        toolName: normalizedToolName,
        updatedAt: Date.now(),
    });
}

export function getHumanApproval(
    convId: string,
    toolName: string,
): HumanApprovalRecord | undefined {
    return humanApprovals.get(approvalKey(convId.trim(), toolName.trim()));
}

export function clearHumanApproval(convId: string, toolName: string): void {
    humanApprovals.delete(approvalKey(convId.trim(), toolName.trim()));
}

export function setPolicy(next: {
    toolRules?: ToolRule[];
    fileRules?: FileRule[];
}): void {
    if (next.toolRules) toolRules = next.toolRules;
    if (next.fileRules) fileRules = next.fileRules;
}
