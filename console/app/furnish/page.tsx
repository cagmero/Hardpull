"use client";

import { useState } from "react";
import { sealAnonymous, generateKeyPair, fromHex, toHex } from "@hardpull/types";
import { apiFetch, hmacHex } from "@/lib/api";

export default function FurnishPage() {
  const [operatorAddress, setOperatorAddress] = useState("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  // The CRE workflow's public key -- what records are sealed TO, and the only key that can
  // open them. Comes from `cd cre && go run ./cmd/keygen`; prefilled from env when configured.
  // Distinct from the furnisher's own identity key, which is generated per registration below.
  const [workflowPublicKeyHex, setWorkflowPublicKeyHex] = useState(
    process.env.NEXT_PUBLIC_CRE_WORKFLOW_PUBLIC_KEY_HEX ?? "",
  );
  const [registration, setRegistration] = useState<Record<string, string> | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [subjectId, setSubjectId] = useState("");
  const [principal, setPrincipal] = useState("50000");
  const [currency, setCurrency] = useState("USD");
  const [status, setStatus] = useState("ACTIVE");
  const [furnishResult, setFurnishResult] = useState<unknown>(null);

  async function register() {
    setRegisterError(null);
    const { status: httpStatus, body } = await apiFetch("/v1/furnishers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A furnisher registers its OWN X25519 public key as its registry identity. Sealing uses
      // the workflow key above; these are two different keys and must not be crossed.
      body: JSON.stringify({ operatorAddress, publicKeyHex: toHex(generateKeyPair().publicKey) }),
    });
    if (httpStatus !== 201) {
      setRegisterError(JSON.stringify(body));
      return;
    }
    const result = body as Record<string, string>;
    setRegistration(result);
    setClientId(result.clientId);
    setClientSecret(result.clientSecret);
  }

  async function getToken() {
    setTokenError(null);
    const { status: httpStatus, body } = await apiFetch("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    });
    if (httpStatus !== 200) {
      setTokenError(JSON.stringify(body));
      return;
    }
    setToken((body as { access_token: string }).access_token);
  }

  async function furnish() {
    if (!registration) return;
    const plaintext = JSON.stringify({
      principal,
      currency,
      originatedAt: new Date().toISOString(),
      status,
    });
    const sealed = sealAnonymous(new TextEncoder().encode(plaintext), fromHex(workflowPublicKeyHex));
    const sealedBoxHex = toHex(sealed);

    const requestBody = JSON.stringify({ subjectId, sealedBoxHex });
    const signature = await hmacHex(requestBody, registration.hmacSecret);

    const { status: httpStatus, body } = await apiFetch("/v1/furnish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "hardpull-signature": signature,
        "idempotency-key": crypto.randomUUID(),
      },
      body: requestBody,
    });
    setFurnishResult({ status: httpStatus, body });
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Furnish a position</h1>
      <p>
        Demo flow only: a real furnisher client would hold its own client_secret/hmac_secret
        securely and never re-enter them through a browser form. See docs/plan.md T-080.
      </p>

      <section>
        <h2>1. Register as a furnisher</h2>
        <label>
          Operator address
          <input value={operatorAddress} onChange={(e) => setOperatorAddress(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          CRE workflow public key (hex, 32 bytes)
          <input value={workflowPublicKeyHex} onChange={(e) => setWorkflowPublicKeyHex(e.target.value)} style={{ width: "100%" }} />
        </label>
        <button onClick={register}>Register</button>
        {registerError && <pre style={{ color: "crimson" }}>{registerError}</pre>}
        {registration && <pre>{JSON.stringify(registration, null, 2)}</pre>}
      </section>

      <section>
        <h2>2. Get a bearer token</h2>
        <label>
          Client ID
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          Client secret
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} style={{ width: "100%" }} />
        </label>
        <button onClick={getToken}>Get token</button>
        {tokenError && <pre style={{ color: "crimson" }}>{tokenError}</pre>}
        {token && <pre style={{ overflowWrap: "anywhere" }}>{token}</pre>}
      </section>

      <section>
        <h2>3. Furnish a position</h2>
        <label>
          Subject ID (bytes32)
          <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          Principal
          <input value={principal} onChange={(e) => setPrincipal(e.target.value)} />
        </label>
        <label>
          Currency
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>ACTIVE</option>
            <option>REPAID</option>
            <option>DEFAULTED</option>
            <option>CLOSED</option>
          </select>
        </label>
        <button onClick={furnish} disabled={!registration || !token}>
          Furnish
        </button>
        {furnishResult !== null && <pre>{JSON.stringify(furnishResult, null, 2)}</pre>}
      </section>
    </main>
  );
}
