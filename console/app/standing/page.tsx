"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

// Reciprocity standing dashboard (docs/spec.md #6.7, docs/plan.md T-080). Reads live from
// ReciprocityLedger via GET /v1/furnishers/:id/standing -- public, unauthenticated, since
// standing is meant to be independently verifiable onchain by anyone.
export default function StandingPage() {
  const [furnisherId, setFurnisherId] = useState("");
  const [standing, setStanding] = useState<{ active: boolean; pullAllowance: string; freshRecordCount: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkStanding() {
    setError(null);
    setStanding(null);
    const { status, body } = await apiFetch(`/v1/furnishers/${furnisherId}/standing`);
    if (status !== 200) {
      setError(JSON.stringify(body));
      return;
    }
    setStanding(body as { active: boolean; pullAllowance: string; freshRecordCount: string });
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Reciprocity standing</h1>
      <p>
        pullAllowance = BASE_ALLOWANCE + freshRecordCount × K, read live from ReciprocityLedger.
        Furnishing more, more recently, raises your daily pull allowance and lowers your x402
        price per pull (spec.md §6.7).
      </p>

      <label>
        Furnisher ID
        <input value={furnisherId} onChange={(e) => setFurnisherId(e.target.value)} style={{ width: "100%" }} />
      </label>
      <button onClick={checkStanding} disabled={!furnisherId}>
        Check standing
      </button>

      {error && <pre style={{ color: "crimson" }}>{error}</pre>}
      {standing && (
        <table style={{ marginTop: 16, borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: 4, fontWeight: "bold" }}>Active</td>
              <td style={{ padding: 4 }}>{standing.active ? "yes" : "no"}</td>
            </tr>
            <tr>
              <td style={{ padding: 4, fontWeight: "bold" }}>Pull allowance (today)</td>
              <td style={{ padding: 4 }}>{standing.pullAllowance}</td>
            </tr>
            <tr>
              <td style={{ padding: 4, fontWeight: "bold" }}>Fresh record count</td>
              <td style={{ padding: 4 }}>{standing.freshRecordCount}</td>
            </tr>
          </tbody>
        </table>
      )}
    </main>
  );
}
