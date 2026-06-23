import { useState, useEffect } from "react";
import "./App.css";

interface ToolRule {
    id: string;
    enabled: boolean;
    priority: number;
    toolPattern: string;
    action: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
    reason?: string;
}

interface Policy {
    toolRules: ToolRule[];
    fileRules: any[];
}

function App() {
    const [policy, setPolicy] = useState<Policy>({
        toolRules: [],
        fileRules: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const API_BASE = "";

    // Fetch current policy on mount
    useEffect(() => {
        fetchPolicy();
    }, []);

    async function fetchPolicy() {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/api/policy`);
            if (!res.ok) throw new Error("Failed to fetch policy");
            const data: Policy = await res.json();
            setPolicy(data);
            setError(null);
        } catch (err: any) {
            setError(err.message);
            console.error("Failed to fetch policy:", err);
        } finally {
            setLoading(false);
        }
    }

    async function savePolicy(updatedPolicy: Policy) {
        try {
            setSaving(true);
            const res = await fetch(`${API_BASE}/api/policy`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedPolicy),
            });
            if (!res.ok) throw new Error("Failed to save policy");
            console.log("[dashboard] policy saved and applied to agent");
            setError(null);
        } catch (err: any) {
            setError(err.message);
            console.error("Failed to save policy:", err);
        } finally {
            setSaving(false);
        }
    }

    async function toggleRuleEnabled(id: string) {
        const updated = policy.toolRules.map((r) =>
            r.id === id ? { ...r, enabled: !r.enabled } : r,
        );
        setPolicy({ ...policy, toolRules: updated });
        await savePolicy({ ...policy, toolRules: updated });
    }

    async function toggleAction(id: string) {
        const actions: Array<"ALLOW" | "DENY" | "REQUIRE_APPROVAL"> = [
            "ALLOW",
            "DENY",
            "REQUIRE_APPROVAL",
        ];

        const updated = policy.toolRules.map((r) => {
            if (r.id !== id) return r;
            const current = actions.indexOf(r.action);
            const next = actions[(current + 1) % actions.length];
            return { ...r, action: next };
        });
        setPolicy({ ...policy, toolRules: updated });
        await savePolicy({ ...policy, toolRules: updated });
    }

    async function deleteRule(id: string) {
        const updated = policy.toolRules.filter((r) => r.id !== id);
        setPolicy({ ...policy, toolRules: updated });
        await savePolicy({ ...policy, toolRules: updated });
    }

    if (loading) {
        return (
            <div className="container">
                <div className="header">
                    <h1>🛡️ Guardrails</h1>
                </div>
                <p>Loading policy...</p>
            </div>
        );
    }

    return (
        <div className="container">
            <div className="header">
                <h1>🛡️ Guardrails</h1>
                <p>Tool access rules (auto-saves)</p>
            </div>

            {error && <div className="error-box">{error}</div>}

            <div className="rules-container">
                {policy.toolRules.length === 0 ? (
                    <p className="empty">No rules configured</p>
                ) : (
                    policy.toolRules.map((rule) => (
                        <div
                            key={rule.id}
                            className={`rule-item ${!rule.enabled ? "disabled" : ""}`}
                        >
                            <div className="rule-name">
                                <code>{rule.toolPattern}</code>
                            </div>
                            <div className="rule-controls">
                                <button
                                    className={`action-btn ${rule.action.toLowerCase()}`}
                                    onClick={() => toggleAction(rule.id)}
                                    title="Cycle through: ALLOW → DENY → REQUIRE_APPROVAL"
                                    disabled={saving}
                                >
                                    {rule.action}
                                </button>
                                <button
                                    className={`toggle-btn ${rule.enabled ? "enabled" : "disabled"}`}
                                    onClick={() => toggleRuleEnabled(rule.id)}
                                    disabled={saving}
                                >
                                    {rule.enabled ? "ON" : "OFF"}
                                </button>
                                <button
                                    className="delete-btn"
                                    onClick={() => deleteRule(rule.id)}
                                    disabled={saving}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="info">
                <p>
                    <strong>ALLOW</strong> = No restrictions
                </p>
                <p>
                    <strong>DENY</strong> = Blocked
                </p>
                <p>
                    <strong>REQUIRE_APPROVAL</strong> = Need approval
                </p>
                <p
                    style={{
                        marginTop: "10px",
                        fontSize: "0.85rem",
                        color: "#666",
                    }}
                >
                    Changes apply immediately to the running agent
                </p>
            </div>
        </div>
    );
}

export default App;
