"use client";

import { useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { buildConsentGrantMessage, buildConsentRevokeMessage } from "@hardpull/types";
import { apiFetch } from "@/lib/api";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { JsonBlock, Mono, ResultPanel } from "@/components/ui/result";
import { VerdictBadge, type VerdictLevel } from "@/components/ui/verdict";

// Demo-only: signs with a pasted private key instead of an injected wallet (MetaMask/wagmi).
// A real deployment would use wagmi's useSignMessage against a connected wallet -- pasting a
// private key into a form is never acceptable outside a testnet demo. See docs/plan.md T-081.

interface Inquiry {
  inquiry_id: string;
  puller_hash: string;
  verdict: VerdictLevel;
  exposure_bucket: string;
  occurred_at: string;
}

export default function FilePage() {
  const [privateKey, setPrivateKey] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [pullerId, setPullerId] = useState("");
  const [expiresAt, setExpiresAt] = useState("2027-01-01T00:00:00.000Z");
  const [maxPulls, setMaxPulls] = useState(5);
  const [grant, setGrant] = useState<{ grantId: string } | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);

  const [grantIdToRevoke, setGrantIdToRevoke] = useState("");
  const [revokeResult, setRevokeResult] = useState<{ status: number; body: unknown } | null>(null);

  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [inquiryState, setInquiryState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [inquiryError, setInquiryError] = useState<string>();

  function account() {
    const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    return privateKeyToAccount(key as `0x${string}`);
  }

  async function grantConsent() {
    setGrantError(null);
    setGranting(true);
    try {
      const timestamp = Date.now();
      const message = buildConsentGrantMessage({ subjectId, pullerId, expiresAt, maxPulls, timestamp });
      const signature = await account().signMessage({ message });

      const { status, body } = await apiFetch("/v1/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId, pullerId, expiresAt, maxPulls, timestamp, signature }),
      });
      if (status !== 201) {
        setGrantError(JSON.stringify(body, null, 2));
        return;
      }
      const result = body as { grantId: string };
      setGrant(result);
      setGrantIdToRevoke(result.grantId);
    } catch (err) {
      setGrantError((err as Error).message);
    } finally {
      setGranting(false);
    }
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
    setInquiryState("loading");
    setInquiryError(undefined);
    const { status, body } = await apiFetch(`/v1/subjects/${subjectId}/inquiries`);
    if (status !== 200) {
      setInquiryError(JSON.stringify(body, null, 2));
      setInquiryState("error");
      return;
    }
    setInquiries((body as { inquiries: Inquiry[] }).inquiries);
    setInquiryState("ready");
  }

  return (
    <>
      <PageHeader eyebrow="Borrower" title="Your credit file">
        <p>
          You decide who may read your file, for how long, and how many times. A pull without a
          live grant is refused before any lender is charged and before the enclave runs.
        </p>
      </PageHeader>

      <PageBody>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="space-y-5 pt-6">
            <div>
              <p className="text-sm font-semibold text-warning">Testnet demo only</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                This form signs with a pasted key. Real deployments sign with a connected wallet —
                never paste a key holding anything you care about.
              </p>
            </div>
            <Field
              label="Wallet private key"
              mono
              type="password"
              autoComplete="off"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
            />
            <Field
              label="Subject ID"
              mono
              placeholder="0x…"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grant access to a lender</CardTitle>
            <CardDescription>
              Signed by your wallet, scoped to one lender, and time-boxed. The{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">grantId</code> you
              get back is the consent token that lender must present on every pull.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field
              label="Lender (puller) ID"
              mono
              placeholder="0x…"
              value={pullerId}
              onChange={(e) => setPullerId(e.target.value)}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Expires at"
                mono
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <Field
                label="Max pulls"
                type="number"
                min={1}
                value={maxPulls}
                onChange={(e) => setMaxPulls(Number(e.target.value))}
              />
            </div>
            <Button
              onClick={grantConsent}
              loading={granting}
              disabled={!privateKey || !subjectId || !pullerId}
            >
              Sign and grant
            </Button>
            {grantError && (
              <p role="alert" className="text-[0.8125rem] font-medium text-critical">
                {grantError}
              </p>
            )}
            {grant && (
              <div className="rounded-md border border-clear/30 bg-clear/5 p-4">
                <p className="text-sm font-medium text-clear">Access granted</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                  Consent token — give this to the lender
                </p>
                <div className="mt-1.5">
                  <Mono value={grant.grantId} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revoke</CardTitle>
            <CardDescription>Takes effect on the lender&apos;s very next pull.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field
              label="Grant ID"
              mono
              value={grantIdToRevoke}
              onChange={(e) => setGrantIdToRevoke(e.target.value)}
            />
            <Button
              variant="danger"
              onClick={revokeConsent}
              disabled={!privateKey || !subjectId || !grantIdToRevoke}
            >
              Sign and revoke
            </Button>
            {revokeResult && <JsonBlock value={revokeResult.body} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who has pulled on you</CardTitle>
            <CardDescription>
              Every inquiry is logged, including ones that returned nothing useful. Puller identity
              is hashed — you see that someone pulled, not a name the API could sell.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={loadInquiries} disabled={!subjectId}>
              Load inquiry history
            </Button>

            <ResultPanel
              state={inquiryState}
              error={inquiryError}
              empty="No inquiries loaded yet."
            >
              {inquiries && inquiries.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Nobody has pulled on this subject yet.
                </p>
              ) : (
                <ul className="stagger divide-y divide-border overflow-hidden rounded-md border border-border">
                  {inquiries?.map((inquiry) => (
                    <li
                      key={inquiry.inquiry_id}
                      className="flex flex-wrap items-center justify-between gap-3 bg-card p-4"
                    >
                      <div className="min-w-0">
                        <VerdictBadge verdict={inquiry.verdict} />
                        <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                          puller {inquiry.puller_hash.slice(0, 18)}…
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm tabular">{inquiry.exposure_bucket}</p>
                        <p className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
                          {new Date(inquiry.occurred_at).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ResultPanel>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
