import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, "logs.json");

export type LogEntry = {
    timestamp: number;
    conversationId: string;
    cycle: number;
    toolName: string;
    args: Record<string, unknown>;
    kind: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
    matchedRuleId?: string;
    reason?: string;
    executed: boolean;
    output?: unknown;
    error?: string;
};

let logs: LogEntry[] = [];

export function loadLogs(): void {
    try {
        if (existsSync(LOG_FILE)) {
            const raw = readFileSync(LOG_FILE, "utf-8");
            logs = JSON.parse(raw);
        }
    } catch { logs = []; }
}

function persist(): void {
    try {
        writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    } catch {}
}

loadLogs();

export function appendLog(entry: LogEntry): void {
    logs.push(entry);
    if (logs.length > 1000) logs = logs.slice(-1000);
    persist();
}

export function getLogs(opts?: {
    conversationId?: string;
    limit?: number;
}): LogEntry[] {
    loadLogs();
    let result = logs;
    if (opts?.conversationId) {
        result = result.filter((l) => l.conversationId === opts.conversationId);
    }
    if (opts?.limit && opts.limit > 0) {
        result = result.slice(-opts.limit);
    }
    return result;
}

export function clearLogs(): void {
    logs = [];
    persist();
}
