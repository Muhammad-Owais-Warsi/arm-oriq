import { watch, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FileRule, ToolRule } from "./types";

let toolRules: ToolRule[] = [];
let fileRules: FileRule[] = [];
let watcherActive = false;

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

export function reloadPolicyFromFile(filePath: string): void {
    try {
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        setPolicy({
            toolRules: parsed.toolRules ?? [],
            fileRules: parsed.fileRules ?? [],
        });
        console.log("[policy] reloaded from", filePath);
    } catch (error: any) {
        console.warn("[policy] failed to reload:", error?.message);
    }
}

export function watchPolicyFile(relativePath?: string): void {
    if (watcherActive) return;
    watcherActive = true;

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const filePath = relativePath
        ? join(__dirname, relativePath)
        : join(__dirname, "test.json");

    reloadPolicyFromFile(filePath);

    try {
        watch(filePath, (event) => {
            if (event === "change") {
                console.log("[policy] file changed, reloading...");
                reloadPolicyFromFile(filePath);
            }
        });
        console.log("[policy] watching", filePath);
    } catch (error: any) {
        console.warn("[policy] failed to watch:", error?.message);
    }
}
