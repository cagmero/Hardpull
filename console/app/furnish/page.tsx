"use client";

import { useState } from "react";
import { sealAnonymous, generateKeyPair, fromHex, toHex } from "@hardpull/types";
import { apiFetch, hmacHex } from "@/lib/api";
import { PageBody, PageHeader, StepLabel } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { JsonBlock, Mono } from "@/components/ui/result";

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
  const [registering, setRegistering] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [subjectId, setSubjectId] = useState("");
  const [principal, setPrincipal] = useState("50000");
  const [currency, setCurrency] = useState("USD");
  const [status, setStatus] = useState("ACTIVE");
  const [furnishResult, setFurnishResult] = useState<{ status: number; body: unknown } | null>(null);
  const [furnishing, setFurnishing] = useState(false);

  async function register() {
    setRegisterError(null);
    setRegistering(true);
    try {
      const { status: httpStatus, body } = await apiFetch("/v1/furnishers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // A furnisher registers its OWN X25519 public key as its registry identity. Sealing uses
        // the workflow key above; these are two different keys and must not be crossed.
        body: JSON.stringify({ operatorAddress, publicKeyHex: toHex(generateKeyPair().publicKey) }),
      });
      if (httpStatus !== 201) {
        setRegisterError(JSON.stringify(body, null, 2));
        return;
      }
      const result = body as Record<string, string>;
      setRegistration(result);
      setClientId(result.clientId);
      setClientSecret(result.clientSecret);
    } finally {
      setRegistering(false);
    }
  }

  async function getToken() {
    setTokenError(null);
    const { status: httpStatus, body } = await apiFetch("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    });
    if (httpStatus !== 200) {
      setTokenError(JSON.stringify(body, null, 2));
      return;
    }
    setToken((body as { access_token: string }).access_token);
  }

  async function furnish() {
    if (!registration) return;
    setFurnishing(true);
    try {
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
    } finally {
      setFurnishing(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Furnishing" title="Contribute a position">
        <p>
          The record is sealed to the enclave&apos;s public key in this browser, before it leaves.
          Hardpull stores the ciphertext and writes only{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem]">
            keccak256(ciphertext)
          </code>{" "}
          on-chain — the API never holds a key that could open it.
        </p>
        <p className="mt-3 text-sm">
          Demo flow only: a real furnisher client holds its own credentials securely and never
          re-enters them through a browser form.
        </p>
      </PageHeader>

      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>
              <StepLabel n={1}>Register as a furnisher</StepLabel>
            </CardTitle>
            <CardDescription>
              Returns a client id, a client secret and an HMAC secret — each shown exactly once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field
              label="Operator address"
              mono
              value={operatorAddress}
              onChange={(e) => setOperatorAddress(e.target.value)}
            />
            <Field
              label="CRE workflow public key"
              mono
              placeholder="run: cd cre && go run ./cmd/keygen"
              hint="Records are sealed to this key. A wrong value produces ciphertext the enclave cannot open — and it fails silently, at verdict time."
              value={workflowPublicKeyHex}
              onChange={(e) => setWorkflowPublicKeyHex(e.target.value)}
            />
            <Button onClick={register} loading={registering} disabled={!operatorAddress}>
              Register
            </Button>
            {registerError && (
              <p role="alert" className="text-[0.8125rem] font-medium text-critical">
                {registerError}
              </p>
            )}
            {registration && (
              <div className="space-y-3 rounded-md border border-clear/30 bg-clear/5 p-4">
                <p className="text-sm font-medium text-clear">Registered</p>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Furnisher ID
                  </p>
                  <Mono value={registration.furnisherId} />
                </div>
                <JsonBlock value={registration} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <StepLabel n={2}>Exchange credentials for a token</StepLabel>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Client ID" mono value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <Field
              label="Client secret"
              mono
              type="password"
              autoComplete="off"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
            <Button variant="secondary" onClick={getToken} disabled={!clientId || !clientSecret}>
              Get access token
            </Button>
            {tokenError && (
              <p role="alert" className="text-[0.8125rem] font-medium text-critical">
                {tokenError}
              </p>
            )}
            {token && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Bearer token</p>
                <Mono value={token} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <StepLabel n={3}>Seal and furnish the position</StepLabel>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Field
              label="Subject ID"
              mono
              placeholder="0x…"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            />
            <div className="grid gap-5 sm:grid-cols-3">
              <Field
                label="Principal"
                inputMode="numeric"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
              <Field label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              <div className="space-y-2">
                <label htmlFor="status" className="block text-sm font-medium leading-none">
                  Status
                </label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm transition-[border-color,box-shadow] duration-[120ms] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {["ACTIVE", "REPAID", "DEFAULTED", "CLOSED"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              onClick={furnish}
              loading={furnishing}
              disabled={!registration || !token || !subjectId || !workflowPublicKeyHex}
            >
              Seal and furnish
            </Button>
            {furnishResult && (
              <div
                className={
                  "rounded-md border p-4 " +
                  (furnishResult.status === 201
                    ? "border-clear/30 bg-clear/5"
                    : "border-critical/30 bg-critical/5")
                }
              >
                <p
                  className={
                    "text-sm font-medium " +
                    (furnishResult.status === 201 ? "text-clear" : "text-critical")
                  }
                >
                  {furnishResult.status === 201 ? "Commitment written on-chain" : `HTTP ${furnishResult.status}`}
                </p>
                <JsonBlock value={furnishResult.body} className="mt-3" />
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
