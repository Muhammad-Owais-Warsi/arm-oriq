import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
    getPolicySnapshot,
    setPolicy,
    getHumanApproval,
    updateHumanApproval,
} from "../../policy/policy";
import { getLogs, clearLogs } from "../../policy/logs";

// Load initial policy from test.json into memory
function loadInitialPolicy() {
    try {
        const configPath = join(__dirname, "../../policy/test.json");
        const raw = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        setPolicy({
            toolRules: parsed.toolRules ?? [],
            fileRules: parsed.fileRules ?? [],
        });
        console.log("[api] loaded initial policy from test.json");
    } catch (error: any) {
        console.warn("[api] failed to load initial policy:", error?.message);
    }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

function persistPolicy() {
    try {
        const configPath = join(__dirname, "../../policy/test.json");
        const snapshot = getPolicySnapshot();
        writeFileSync(configPath, JSON.stringify(snapshot, null, 4), "utf-8");
        console.log("[api] policy persisted to test.json");
    } catch (error: any) {
        console.error("[api] failed to persist policy:", error?.message);
    }
}

app.get("/api/policy", (req, res) => {
    const snapshot = getPolicySnapshot();
    res.json(snapshot);
});

/**
 * PUT /api/policy
 * Updates tool and file rules in-memory and persists to disk
 * Body: { toolRules?: ToolRule[], fileRules?: FileRule[] }
 */
app.put("/api/policy", (req, res) => {
    try {
        const { toolRules, fileRules } = req.body;

        if (toolRules !== undefined || fileRules !== undefined) {
            setPolicy({
                toolRules: toolRules ?? undefined,
                fileRules: fileRules ?? undefined,
            });
            console.log("[api] policy updated in memory");

            // Persist to file
            persistPolicy();
        }

        const updated = getPolicySnapshot();
        res.json({ success: true, policy: updated });
    } catch (error: any) {
        console.error("[api] error updating policy:", error?.message);
        res.status(400).json({
            success: false,
            error: error?.message ?? "Failed to update policy",
        });
    }
});

/**
 * GET /api/approvals/:convId/:toolName
 * Check if a tool call has been approved in this conversation
 */
app.get("/api/approvals/:convId/:toolName", (req, res) => {
    const { convId, toolName } = req.params;
    const approval = getHumanApproval(convId, toolName);
    res.json({ approval: approval ?? null });
});

/**
 * POST /api/approvals/:convId/:toolName
 * Record a human approval decision
 * Body: { status: "ALLOW" | "DENY" }
 */
app.post("/api/approvals/:convId/:toolName", (req, res) => {
    try {
        const { convId, toolName } = req.params;
        const { status } = req.body;

        if (status !== "ALLOW" && status !== "DENY") {
            return res
                .status(400)
                .json({ error: "status must be ALLOW or DENY" });
        }

        updateHumanApproval(status, convId, toolName);
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({
            success: false,
            error: error?.message ?? "Failed to record approval",
        });
    }
});

app.get("/api/logs", (req, res) => {
    const conversationId = req.query.conversationId as string | undefined;
    const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined;
    res.json(getLogs({ conversationId, limit }));
});

app.delete("/api/logs", (_req, res) => {
    clearLogs();
    res.json({ success: true });
});

const clientDist = join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.use((_req, res) => res.sendFile(join(clientDist, "index.html")));

loadInitialPolicy();

app.listen(3000, () => {
    console.log("running");
});
