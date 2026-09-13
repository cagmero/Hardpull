"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Badge, VerdictBadge, type VerdictLevel } from "@/components/ui/verdict";
import { JsonBlock, ResultPanel } from "@/components/ui/result";

interface Verdict {
  verdict: VerdictLevel;
  exposureBucket: string;
  originationVelocity48h: number;
  inquiryVelocity7d: number;
  distinctFurnishers: number;
  stackingFlags: string[];
  computedAt: string;
  attestation: string;
}

export default function PullPage() {
  const [token, setToken] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [proposedPrincipal, setProposedPrincipal] = useState("50000");
  const [currency, setCurrency] = useState("USD");
  const [consentToken, setConsentToken] = useState("");
  const [paymentHeader, setPaymentHeader] = useState("");

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [error, setError] = useState<string>();

  async function pull() {
    setState("loading");
    setError(undefined);
    setVerdict(null);
    setRaw(null);

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

    setRaw(body);
    if (status !== 200) {
      // A 402 is the x402 challenge, not a failure -- say so rather than rendering it as an error.
      const detail = typeof body === "string" ? body : JSON.stringify(body, null, 2);
      setError(
        status === 402
          ? `402 Payment Required — this is the x402 challenge, not a fault. Settle it, then paste the X-PAYMENT header below.\n\n${detail}`
          : `${status} — ${detail}`,
      );
      setState("error");
      return;
    }

    setVerdict(body as Verdict);
    setState("ready");
  }

  return (
    <>
      <PageHeader eyebrow="Underwriting" title="Pull a verdict">
        <p>
          Runs the full short-circuit chain: consent → reciprocity standing → x402 payment → CRE
          compute. Each gate returns before the next one runs, so a request that was always going
          to be rejected never reaches — or pays for — the enclave.
        </p>
      </PageHeader>

      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>
              The bearer token comes from step 2 on the Furnish page. The consent token is the{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">grantId</code> the
              borrower received when they granted you access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void pull();
              }}
              className="space-y-5"
            >
              <Field
                label="Bearer token"
                mono
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
              <Field
                label="Subject ID"
                mono
                placeholder="0x…"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Proposed principal"
                  inputMode="numeric"
                  value={proposedPrincipal}
                  onChange={(e) => setProposedPrincipal(e.target.value)}
                />
                <Field
                  label="Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </div>

              <Field
                label="Consent token"
                mono
                placeholder="the grantId from POST /v1/consent"
                hint="Rejected unless it names a live, unexhausted grant for this exact subject and this exact puller. Another lender's token will not work."
                value={consentToken}
                onChange={(e) => setConsentToken(e.target.value)}
              />
              <Field
                label="X-PAYMENT header"
                mono
                hint="Leave blank to see the x402 challenge; paste the receipt here after settling it."
                value={paymentHeader}
                onChange={(e) => setPaymentHeader(e.target.value)}
              />

              <Button
                type="submit"
                size="lg"
                loading={state === "loading"}
                disabled={!token || !subjectId || !consentToken}
              >
                Run pull
              </Button>
            </form>
          </CardContent>
        </Card>

        <ResultPanel
          state={state}
          error={error}
          empty="The verdict appears here. Everything a lender is permitted to learn fits in one small object."
        >
          {verdict && <VerdictResult verdict={verdict} raw={raw} />}
        </ResultPanel>
      </PageBody>
    </>
  );
}

function VerdictResult({ verdict, raw }: { verdict: Verdict; raw: unknown }) {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden shadow-lift">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-6 py-4">
          <VerdictBadge verdict={verdict.verdict} />
          <span className="font-mono text-xs tabular text-muted-foreground">
            {verdict.computedAt}
          </span>
        </div>

        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat label="Exposure" value={verdict.exposureBucket} />
            <Stat label="Originations 48h" value={String(verdict.originationVelocity48h)} />
            <Stat label="Inquiries 7d" value={String(verdict.inquiryVelocity7d)} />
            <Stat label="Furnishers" value={String(verdict.distinctFurnishers)} />
          </dl>

          {verdict.stackingFlags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {verdict.stackingFlags.map((flag) => (
                <Badge key={flag} className="border-critical/25 bg-critical/10 text-critical">
                  {flag}
                </Badge>
              ))}
            </div>
          )}

          <p className="mt-6 border-t border-border pt-4 text-[0.8125rem] leading-relaxed text-muted-foreground">
            No counterparty, no exact outstanding amount, no loan terms, no prior puller. The
            enclave&apos;s output type has no field for any of them — enforced by a test that fails
            the build if one is added.
          </p>
        </CardContent>
      </Card>

      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors duration-[120ms] ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3 transition-transform duration-200 ease-move group-open:rotate-90"
            aria-hidden="true"
          >
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          Raw response
        </summary>
        <JsonBlock value={raw} className="mt-3" />
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 font-mono text-lg tabular">{value}</dd>
    </div>
  );
}
