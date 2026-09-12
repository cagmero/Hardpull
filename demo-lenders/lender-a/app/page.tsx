"use client";

import { useEffect, useState } from "react";
import { sealAnonymous, fromHex, toHex } from "@hardpull/types";
import { apiFetch, hmacHex } from "@/lib/api";

const WORKFLOW_PUBLIC_KEY_HEX = "3333333333333333333333333333333333333333333333333333333333333333";
const STORAGE_KEY = "hardpull-lender-a-credentials";

interface Credentials {
  furnisherId: string;
  clientId: string;
  clientSecret: string;
  hmacSecret: string;
}

export default function LenderA() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [principal, setPrincipal] = useState("50000");
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setCredentials(JSON.parse(saved));
  }, []);

  function appendLog(line: string) {
    setLog((prev) => [...prev, line]);
  }

  async function ensureRegistered(): Promise<Credentials> {
    if (credentials) return credentials;

    appendLog("Registering Lender A as a furnisher...");
    const operatorAddress = "0x" + crypto.getRandomValues(new Uint8Array(20)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    const { status, body } = await apiFetch("/v1/furnishers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operatorAddress, publicKeyHex: WORKFLOW_PUBLIC_KEY_HEX }),
    });
    if (status !== 201) throw new Error(`registration failed: ${JSON.stringify(body)}`);

    const creds = body as Credentials;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    setCredentials(creds);
    appendLog(`Registered as furnisher ${creds.furnisherId}`);
    return creds;
  }

  async function originateLoan() {
    setLog([]);
    try {
      const creds = await ensureRegistered();

      appendLog("Requesting access token...");
      const tokenRes = await apiFetch("/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: "client_credentials", client_id: creds.clientId, client_secret: creds.clientSecret }),
      });
      const token = (tokenRes.body as { access_token: string }).access_token;

      appendLog(`Sealing loan record for subject ${subjectId}...`);
      const plaintext = JSON.stringify({ principal, currency: "USD", originatedAt: new Date().toISOString(), status: "ACTIVE" });
      const sealed = sealAnonymous(new TextEncoder().encode(plaintext), fromHex(WORKFLOW_PUBLIC_KEY_HEX));
      const sealedBoxHex = toHex(sealed);
      const requestBody = JSON.stringify({ subjectId, sealedBoxHex });
      const signature = await hmacHex(requestBody, creds.hmacSecret);

      appendLog("Furnishing position to Hardpull (commitment written onchain)...");
      const { status, body } = await apiFetch("/v1/furnish", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "hardpull-signature": signature,
          "idempotency-key": crypto.randomUUID(),
        },
        body: requestBody,
      });

      if (status === 201) {
        appendLog(`Loan originated. Commitment: ${(body as { commitment: string }).commitment}`);
        appendLog(`Onchain tx: ${(body as { txHash: string }).txHash}`);
      } else {
        appendLog(`Failed: ${JSON.stringify(body)}`);
      }
    } catch (err) {
      appendLog(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui", background: "#eef6ff", minHeight: "100vh" }}>
      <h1 style={{ color: "#1d4ed8" }}>🏦 Lender A</h1>
      <p>First half of the stacking scenario: originate a loan to a demo subject.</p>

      <label>
        Subject ID
        <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ width: "100%" }} />
      </label>
      <label>
        Principal
        <input value={principal} onChange={(e) => setPrincipal(e.target.value)} />
      </label>

      <button onClick={originateLoan} disabled={!subjectId} style={{ marginTop: 12 }}>
        Originate loan
      </button>

      <pre style={{ background: "#fff", padding: 12, marginTop: 16, whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>
    </main>
  );
}
