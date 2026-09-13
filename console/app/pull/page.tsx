"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function PullPage() {
  const [token, setToken] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [proposedPrincipal, setProposedPrincipal] = useState("50000");
  const [currency, setCurrency] = useState("USD");
  const [consentToken, setConsentToken] = useState("");
  const [paymentHeader, setPaymentHeader] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function pull() {
    setLoading(true);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "idempotency-key": crypto.randomUUID(),
      };
      if (paymentHeader) headers["X-PAYMENT"] = paymentHeader;

      const { status, body } = await apiFetch("/v1/pull", {
        method: "POST",
        headers,
        body: JSON.stringify({ subjectId, proposedPrincipal, currency, consentToken }),
      });
      setResult({ status, body });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Pull a verdict</h1>
      <p>
        Runs the full short-circuit chain: consent → reciprocity standing → x402 payment → CRE
        compute. A 402 response here is the x402 challenge, not an error — see
        docs/architecture.md §2.3.
      </p>

      <label>
        Bearer token (from Furnish page step 2)
        <input value={token} onChange={(e) => setToken(e.target.value)} style={{ width: "100%" }} />
      </label>
      <label>
        Subject ID
        <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ width: "100%" }} />
      </label>
      <label>
        Proposed principal
        <input value={proposedPrincipal} onChange={(e) => setProposedPrincipal(e.target.value)} />
      </label>
      <label>
        Currency
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
      </label>
      <label>
        Consent token — the grantId the borrower received from POST /v1/consent. The pull is
        rejected unless this names a live, unexhausted grant for this exact subject and puller.
        <input value={consentToken} onChange={(e) => setConsentToken(e.target.value)} style={{ width: "100%" }} />
      </label>
      <label>
        X-PAYMENT header (paste after settling the 402 challenge; leave blank to see the challenge)
        <input value={paymentHeader} onChange={(e) => setPaymentHeader(e.target.value)} style={{ width: "100%" }} />
      </label>

      <button onClick={pull} disabled={loading || !consentToken}>
        {loading ? "Pulling..." : "Pull"}
      </button>

      {result !== null && <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}
