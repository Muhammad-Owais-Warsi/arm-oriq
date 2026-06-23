import express from "express";
import cors from "cors";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
    getPolicySnapshot,
    setPolicy,
    getHumanApproval,
    updateHumanApproval,
} from "../../policy/policy.js";

const app = express();
const PORT = process.env.PORT || 3000;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Middleware
app.use(cors());
app.use(express.json());

// Persist policy to test.json
function persistPolicy() {
    try {
        const configPath = join(__dirname, "../../policy/test.json");

        const snapshot = getPolicySnapshot();

        writeFileSync(configPath, JSON.stringify(snapshot, null, 4), "utf-8");

        console.log("[api] policy persisted to test.json");
    } catch (error) {
        console.error("[api] failed to persist policy:", error.message);
    }
}

// GET /api/policy
app.get("/api/policy", (req, res) => {
    const snapshot = getPolicySnapshot();
    res.json(snapshot);
});

// PUT /api/policy
app.put("/api/policy", (req, res) => {
    try {
        const { toolRules, fileRules } = req.body;

        if (toolRules !== undefined || fileRules !== undefined) {
            setPolicy({
                toolRules: toolRules ?? undefined,
                fileRules: fileRules ?? undefined,
            });

            console.log("[api] policy updated in memory");

            persistPolicy();
        }

        const updated = getPolicySnapshot();

        res.json({
            success: true,
            policy: updated,
        });
    } catch (error) {
        console.error("[api] error updating policy:", error.message);

        res.status(400).json({
            success: false,
            error: error.message ?? "Failed to update policy",
        });
    }
});

// GET /api/approvals/:convId/:toolName
app.get("/api/approvals/:convId/:toolName", (req, res) => {
    const { convId, toolName } = req.params;

    const approval = getHumanApproval(convId, toolName);

    res.json({
        approval: approval ?? null,
    });
});

// POST /api/approvals/:convId/:toolName
app.post("/api/approvals/:convId/:toolName", (req, res) => {
    try {
        const { convId, toolName } = req.params;
        const { status } = req.body;

        if (status !== "ALLOW" && status !== "DENY") {
            return res.status(400).json({
                error: "status must be ALLOW or DENY",
            });
        }

        updateHumanApproval(status, convId, toolName);

        res.json({
            success: true,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message ?? "Failed to record approval",
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`[api] server running on http://localhost:${PORT}`);
});
