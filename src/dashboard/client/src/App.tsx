import { useState, useEffect, useCallback, useRef } from "react";

interface ToolRule {
    id: string; enabled: boolean; priority: number;
    toolPattern: string; action: "ALLOW" | "DENY" | "REQUIRE_APPROVAL"; reason?: string;
}

interface FileRule {
    name: string; conditions: { maxLength?: number; argPathPrefix?: string };
}

interface Policy { toolRules: ToolRule[]; fileRules: FileRule[]; }

interface LogEntry {
    timestamp: number; conversationId: string; cycle: number;
    toolName: string; args: Record<string, unknown>;
    kind: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
    matchedRuleId?: string; reason?: string; executed: boolean; output?: unknown; error?: string;
}

const ACTIONS = ["ALLOW", "DENY", "REQUIRE_APPROVAL"] as const;
const COLORS: Record<string, string> = { ALLOW: "#10b981", DENY: "#ef4444", REQUIRE_APPROVAL: "#f59e0b" };
const API = "";
let uid = Date.now();
const ruleId = () => `r-${uid++}-${Math.random().toString(36).slice(2, 4)}`;
const fmt = (ts: number) => new Date(ts).toLocaleTimeString();

function App() {
    const [policy, setPolicy] = useState<Policy>({ toolRules: [], fileRules: [] });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [online, setOnline] = useState(false);
    const [focus, setFocus] = useState<string | null>(null);
    const [pat, setPat] = useState("");
    const [rsn, setRsn] = useState("");
    const [curAct, setCurAct] = useState<"ALLOW" | "DENY" | "REQUIRE_APPROVAL">("DENY");
    const [fname, setFname] = useState("");
    const [fmax, setFmax] = useState("");
    const [fpre, setFpre] = useState("");
    const [convFilter, setConvFilter] = useState<string | null>(null);
    const logsEnd = useRef<HTMLDivElement>(null);

    const loadPolicy = useCallback(async () => {
        try { const r = await fetch(`${API}/api/policy`); if (!r.ok) throw Error(); setPolicy(await r.json()); setError(""); setOnline(true); }
        catch { setOnline(false); }
    }, []);
    const loadLogs = useCallback(async () => {
        try { const r = await fetch(`${API}/api/logs`); if (!r.ok) throw Error(); const data: LogEntry[] = await r.json(); setLogs(data); } catch {}
    }, []);

    useEffect(() => { loadPolicy(); loadLogs(); const t = setInterval(() => { loadPolicy(); loadLogs(); }, 2000); return () => clearInterval(t); }, [loadPolicy, loadLogs]);

    useEffect(() => { logsEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

    const allConvs = [...new Set(logs.map(l => l.conversationId).filter(Boolean))];
    useEffect(() => {
        if (allConvs.length > 0 && (!convFilter || !allConvs.includes(convFilter))) {
            setConvFilter(allConvs[allConvs.length - 1]);
        }
    }, [allConvs.join(",")]);

    const save = async (p: Policy) => {
        setBusy(true);
        try { const r = await fetch(`${API}/api/policy`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }); if (!r.ok) throw Error(); setPolicy(p); setError(""); }
        catch (e: any) { setError(e.message ?? "Save failed"); }
        finally { setBusy(false); }
    };

    const toggle = (id: string) => { const p = { ...policy, toolRules: policy.toolRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r) }; setPolicy(p); save(p); };
    const setAct = (id: string, a: typeof ACTIONS[number]) => { const p = { ...policy, toolRules: policy.toolRules.map(r => r.id === id ? { ...r, action: a } : r) }; setPolicy(p); save(p); };
    const setField = (id: string, f: string, v: any) => { const p = { ...policy, toolRules: policy.toolRules.map(r => r.id === id ? { ...r, [f]: v } : r) }; setPolicy(p); save(p); };
    const del = (id: string) => { const p = { ...policy, toolRules: policy.toolRules.filter(r => r.id !== id) }; setPolicy(p); save(p); };

    const addRule = () => {
        if (!pat.trim()) return;
        const rule: ToolRule = { id: ruleId(), enabled: true, priority: 100, toolPattern: pat.trim(), action: curAct, reason: rsn.trim() || undefined };
        const p = { ...policy, toolRules: [...policy.toolRules, rule] }; setPolicy(p); setPat(""); setRsn(""); setCurAct("DENY"); save(p);
    };

    const addFileRule = () => {
        if (!fname.trim()) return;
        const rule: FileRule = { name: fname.trim(), conditions: { maxLength: fmax ? Number(fmax) : undefined, argPathPrefix: fpre.trim() || undefined } };
        const p = { ...policy, fileRules: [...policy.fileRules, rule] }; setPolicy(p); setFname(""); setFmax(""); setFpre(""); save(p);
    };

    const delFile = (i: number) => { const p = { ...policy, fileRules: policy.fileRules.filter((_, idx) => idx !== i) }; setPolicy(p); save(p); };

    const filteredLogs = convFilter ? logs.filter(l => l.conversationId === convFilter) : logs;

    return (
        <div className="h-screen bg-[#0d0d0d] text-gray-200 font-sans text-sm flex flex-col">
            {/* Header */}
            <header className="shrink-0 border-b border-[#1a1a1a] px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-sm font-semibold text-gray-100">ArmorIQ Policy</h1>
                    <span className={`inline-block w-2 h-2 rounded-full ${online ? "bg-emerald-500" : "bg-red-500"}`} title={online ? "connected" : "disconnected"} />
                </div>
                <div className="flex items-center gap-2">
                    {error && <span className="text-red-400 text-xs">{error}</span>}
                    {busy && <span className="text-[#555] text-xs">saving</span>}
                </div>
            </header>

            {/* Split layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Rules */}
                <div className="w-[420px] shrink-0 overflow-y-auto border-r border-[#1a1a1a] p-3 space-y-3">
                    {/* Tool Rules */}
                    <section>
                        <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tool Rules</h2>
                        <div className="space-y-1">
                            {policy.toolRules.length === 0 && <p className="text-gray-600 text-xs italic py-3 text-center">No tool rules</p>}
                            {[...policy.toolRules].sort((a, b) => b.priority - a.priority).map(r => (
                                <div key={r.id} className={`flex items-center gap-1.5 px-2 py-1 rounded border ${r.enabled ? "bg-[#111] border-[#222]" : "bg-[#0a0a0a] border-[#1a1a1a] opacity-50"}`}>
                                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                        <code className="text-[11px] bg-[#1a1a1a] px-1.5 py-0.5 rounded text-gray-300 font-mono truncate">{r.toolPattern}</code>
                                        {r.reason && <span className="text-[#555] text-[10px] truncate">{r.reason}</span>}
                                    </div>
                                    <select value={r.action} onChange={e => setAct(r.id, e.target.value as any)} disabled={busy}
                                        className="text-[10px] font-semibold bg-transparent border border-[#222] rounded px-1 py-0.5 cursor-pointer outline-none"
                                        style={{ color: COLORS[r.action], borderColor: COLORS[r.action] }}>
                                        {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                    <button onClick={() => toggle(r.id)} disabled={busy}
                                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${r.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-[#1a1a1a] text-gray-600 border-[#222]"}`}>
                                        {r.enabled ? "ON" : "OFF"}
                                    </button>
                                    <button onClick={() => setFocus(focus === r.id ? null : r.id)} disabled={busy}
                                        className="text-[10px] px-1 py-0.5 rounded text-gray-500 hover:text-gray-300 border border-transparent hover:border-[#333] transition-colors">E</button>
                                    {focus === r.id && (
                                        <div className="flex items-center gap-1">
                                            <input value={r.reason ?? ""} onChange={e => setField(r.id, "reason", e.target.value || undefined)} placeholder="reason"
                                                className="w-16 text-[10px] bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 outline-none text-gray-300 placeholder-gray-600" />
                                            <input type="number" value={r.priority} onChange={e => setField(r.id, "priority", Number(e.target.value))}
                                                className="w-10 text-[10px] bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 outline-none text-gray-300" />
                                            <button onClick={() => setFocus(null)} className="text-[10px] text-gray-500 hover:text-gray-300 px-1">X</button>
                                        </div>
                                    )}
                                    <button onClick={() => del(r.id)} disabled={busy}
                                        className="text-[10px] px-1 py-0.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">X</button>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded border border-[#222] bg-[#0a0a0a]">
                            <input value={pat} onChange={e => setPat(e.target.value)} placeholder="tool pattern"
                                className="flex-1 text-[11px] bg-transparent border-0 outline-none text-gray-300 placeholder-gray-600" />
                            <select value={curAct} onChange={e => setCurAct(e.target.value as any)}
                                className="text-[10px] bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 outline-none text-gray-300">
                                {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                            <input value={rsn} onChange={e => setRsn(e.target.value)} placeholder="reason"
                                className="w-20 text-[10px] bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 outline-none text-gray-300 placeholder-gray-600" />
                            <button onClick={addRule} disabled={!pat.trim() || busy}
                                className="text-[10px] font-bold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors">+</button>
                        </div>
                    </section>

                    {/* File Rules */}
                    <section>
                        <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">File Rules</h2>
                        <div className="space-y-1">
                            {policy.fileRules.length === 0 && <p className="text-gray-600 text-xs italic py-3 text-center">No file rules</p>}
                            {policy.fileRules.map((r, i) => (
                                <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#222] bg-[#111]">
                                    <div className="flex-1 flex items-center gap-2">
                                        <code className="text-[11px] bg-[#1a1a1a] px-1.5 py-0.5 rounded text-gray-300 font-mono">{r.name}</code>
                                        <div className="flex gap-1">
                                            {r.conditions.maxLength != null && <span className="text-[#555] text-[10px]">max:{r.conditions.maxLength}</span>}
                                            {r.conditions.argPathPrefix && <span className="text-[#555] text-[10px]">prefix:{r.conditions.argPathPrefix}</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => delFile(i)} className="text-[10px] px-1 py-0.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">X</button>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded border border-[#222] bg-[#0a0a0a]">
                            <input value={fname} onChange={e => setFname(e.target.value)} placeholder="rule name"
                                className="flex-1 text-[11px] bg-transparent border-0 outline-none text-gray-300 placeholder-gray-600" />
                            <input value={fmax} onChange={e => setFmax(e.target.value)} placeholder="max len"
                                className="w-14 text-[10px] bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 outline-none text-gray-300 placeholder-gray-600" type="number" />
                            <input value={fpre} onChange={e => setFpre(e.target.value)} placeholder="path prefix"
                                className="w-20 text-[10px] bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 outline-none text-gray-300 placeholder-gray-600" />
                            <button onClick={addFileRule} disabled={!fname.trim() || busy}
                                className="text-[10px] font-bold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors">+</button>
                        </div>
                    </section>
                </div>

                {/* Right: Live Logs */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a1a]">
                        <div className="flex items-center gap-2">
                            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Logs</h2>
                            {allConvs.length > 1 && (
                                <select value={convFilter ?? ""} onChange={e => setConvFilter(e.target.value || null)}
                                    className="text-[10px] bg-[#1a1a1a] border border-[#333] rounded px-1 py-0.5 outline-none text-gray-400">
                                    {allConvs.map(c => (
                                        <option key={c} value={c}>conv-{c.slice(-8)}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <button onClick={() => { fetch(`${API}/api/logs`, { method: "DELETE" }); setLogs([]); }}
                            className="text-[10px] text-gray-500 hover:text-red-400 transition-colors">Clear</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        {filteredLogs.length === 0 && <p className="text-gray-600 text-xs italic py-8 text-center">No logs for this conversation.</p>}
                        {[...filteredLogs].reverse().map((l, i) => {
                            const hasArgs = l.args && Object.keys(l.args).length > 0;
                            return (
                                <div key={i} className="flex items-start gap-2 px-2 py-0.5 rounded hover:bg-[#181818] transition-colors">
                                    <span className="text-[#555] text-[10px] font-mono w-14 shrink-0">{fmt(l.timestamp)}</span>
                                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${l.kind === "ALLOW" ? "text-emerald-400 bg-emerald-500/10" : l.kind === "DENY" ? "text-red-400 bg-red-500/10" : "text-amber-400 bg-amber-500/10"}`}>
                                        {l.kind}
                                    </span>
                                    <code className="text-[10px] bg-[#1a1a1a] px-1 py-0.5 rounded text-gray-300 font-mono">{l.toolName}</code>
                                    {l.matchedRuleId && <span className="text-[#555] text-[10px]">r:{l.matchedRuleId.replace(/^r-\d+-/, "")}</span>}
                                    {l.reason && l.reason !== "Blocked by policy" && <span className="text-[#555] text-[10px] truncate">{l.reason}</span>}
                                    {hasArgs && <code className="text-[#555] text-[10px] truncate font-mono max-w-[120px]">{JSON.stringify(l.args)}</code>}
                                </div>
                            );
                        })}
                        <div ref={logsEnd} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;