"use client";

import { useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { buildConsentGrantMessage, buildConsentRevokeMessage } from "@hardpull/types";
import { apiFetch } from "@/lib/api";

// Demo-only: signs with a pasted private key instead of an injected wallet (MetaMask/wagmi).
// A real deployment would use wagmi's useSignMessage against a connected wallet -- pasting a
// private key into a form is never acceptable outside a testnet demo. See docs/plan.md T-081.

export default function FilePage() {
  const [privateKey, setPrivateKey] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [pullerId, setPullerId] = useState("");
  const [expiresAt, setExpiresAt] = useState("2027-01-01T00:00:00.000Z");
  const [maxPulls, setMaxPulls] = useState(5);
  const [grantResult, setGrantResult] = useState<unknown>(null);

  const [grantIdToRevoke, setGrantIdToRevoke] = useState("");
  const [revokeResult, setRevokeResult] = useState<unknown>(null);

  const [inquiries, setInquiries] = useState<unknown>(null);

  function account() {
    const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    return privateKeyToAccount(key as `0x${string}`);
  }

  async function grantConsent() {
    const timestamp = Date.now();
    const message = buildConsentGrantMessage({ subjectId, pullerId, expiresAt, maxPulls, timestamp });
    const signature = await account().signMessage({ message });

    const { status, body } = await apiFetch("/v1/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectId, pullerId, expiresAt, maxPulls, timestamp, signature }),
    });
    setGrantResult({ status, body });
  }

  async function revokeConsent() {
    const timestamp = Date.now();
    const message = buildConsentRevokeMessage({ grantId: grantIdToRevoke, timestamp });
    const signature = await account().signMessage({ message });

    const { status, body } = await apiFetch(`/v1/consent/${grantIdToRevoke}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectId, timestamp, signature }),
    });
    setRevokeResult({ status, body });
  }

  async function loadInquiries() {
    const { body } = await apiFetch(`/v1/subjects/${subjectId}/inquiries`);
    setInquiries(body);
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Your credit file</h1>

      <label>
        Wallet private key (demo only — never do this with a real wallet)
        <input value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} style={{ width: "100%" }} />
      </label>
      <label>
        Subject ID
        <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ width: "100%" }} />
      </label>

      <section>
        <h2>Grant consent</h2>
        <label>
          Puller (lender) ID
          <input value={pullerId} onChange={(e) => setPullerId(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          Expires at
          <input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          Max pulls
          <input type="number" value={maxPulls} onChange={(e) => setMaxPulls(Number(e.target.value))} />
        </label>
        <button onClick={grantConsent}>Sign and grant</button>
        {grantResult !== null && <pre>{JSON.stringify(grantResult, null, 2)}</pre>}
      </section>

      <section>
        <h2>Revoke consent</h2>
        <label>
          Grant ID
          <input value={grantIdToRevoke} onChange={(e) => setGrantIdToRevoke(e.target.value)} style={{ width: "100%" }} />
        </label>
        <button onClick={revokeConsent}>Sign and revoke</button>
        {revokeResult !== null && <pre>{JSON.stringify(revokeResult, null, 2)}</pre>}
      </section>

      <section>
        <h2>Inquiry history</h2>
        <button onClick={loadInquiries}>Load inquiries</button>
        {inquiries !== null && <pre>{JSON.stringify(inquiries, null, 2)}</pre>}
      </section>
    </main>
  );
}
