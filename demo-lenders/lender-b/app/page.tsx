"use client";

import { useState } from "react";

export default function LenderB() {
  const [subjectId, setSubjectId] = useState("");
  const [proposedPrincipal, setProposedPrincipal] = useState("40000");
  const [result, setResult] = useState<{ decision: string; trace: string[]; verdict?: unknown } | null>(null);
  const [running, setRunning] = useState(false);

  async function runAgent() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId, proposedPrincipal }),
      });
      setResult(await res.json());
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui", background: "#fef2f2", minHeight: "100vh" }}>
      <h1 style={{ color: "#b91c1c" }}>🤖 Lender B — Underwriting Agent</h1>
      <p>
        Second half of the stacking scenario. The agent below pays via x402, calls{" "}
        <code>/v1/pull</code>, and decides — with no human handling credentials in between.
      </p>

      <label>
        Subject ID (the same one Lender A originated to)
        <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ width: "100%" }} />
      </label>
      <label>
        Proposed principal
        <input value={proposedPrincipal} onChange={(e) => setProposedPrincipal(e.target.value)} />
      </label>

      <button onClick={runAgent} disabled={!subjectId || running} style={{ marginTop: 12 }}>
        {running ? "Agent running..." : "Run underwriting agent"}
      </button>

      {result && (
        <div style={{ marginTop: 16 }}>
          <h2>Decision: {result.decision}</h2>
          <pre style={{ background: "#fff", padding: 12, whiteSpace: "pre-wrap" }}>{result.trace.join("\n")}</pre>
          {result.verdict !== undefined && <pre style={{ background: "#fff", padding: 12 }}>{JSON.stringify(result.verdict, null, 2)}</pre>}
        </div>
      )}
    </main>
  );
}
