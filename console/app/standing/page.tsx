"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { ResultPanel } from "@/components/ui/result";

interface Standing {
  active: boolean;
  pullAllowance: string;
  freshRecordCount: string;
}

// Reciprocity standing dashboard (docs/spec.md #6.7, docs/plan.md T-080). Reads live from
// ReciprocityLedger via GET /v1/furnishers/:id/standing -- public and unauthenticated, since
// standing is meant to be independently verifiable onchain by anyone.
export default function StandingPage() {
  const [furnisherId, setFurnisherId] = useState("");
  const [standing, setStanding] = useState<Standing | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [error, setError] = useState<string>();

  async function checkStanding() {
    setState("loading");
    setError(undefined);
    setStanding(null);

    const { status, body } = await apiFetch(`/v1/furnishers/${furnisherId}/standing`);
    if (status !== 200) {
      setError(typeof body === "string" ? body : JSON.stringify(body));
      setState("error");
      return;
    }
    setStanding(body as Standing);
    setState("ready");
  }

  return (
    <>
      <PageHeader eyebrow="Reciprocity" title="Furnishing standing">
        <p>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem]">
            pullAllowance = BASE_ALLOWANCE + freshRecordCount × K
          </code>
          , read live from the <span className="text-foreground">ReciprocityLedger</span> contract.
          Furnishing more, and more recently, raises your daily allowance and lowers your price per
          pull.
        </p>
      </PageHeader>

      <PageBody>
        <Card>
          <CardContent className="pt-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void checkStanding();
              }}
              className="space-y-5"
            >
              <Field
                label="Furnisher ID"
                mono
                placeholder="0x…"
                hint="The 32-byte id returned when the lender registered."
                value={furnisherId}
                onChange={(e) => setFurnisherId(e.target.value)}
              />
              <Button type="submit" disabled={!furnisherId} loading={state === "loading"}>
                Check standing
              </Button>
            </form>
          </CardContent>
        </Card>

        <ResultPanel
          state={state}
          error={error}
          empty="Enter a furnisher ID to read its standing straight from the contract."
        >
          {standing && (
            <div className="stagger grid gap-4 sm:grid-cols-3">
              <Metric
                label="Status"
                value={standing.active ? "Active" : "Suspended"}
                tone={standing.active ? "good" : "bad"}
              />
              <Metric label="Pull allowance" value={standing.pullAllowance} suffix="per day" />
              <Metric label="Fresh records" value={standing.freshRecordCount} suffix="within 30d" />
            </div>
          )}
        </ResultPanel>
      </PageBody>
    </>
  );
}

function Metric({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "good" | "bad";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={
            "mt-2 font-mono text-2xl tabular " +
            (tone === "good" ? "text-clear" : tone === "bad" ? "text-critical" : "text-foreground")
          }
        >
          {value}
        </p>
        {suffix && <p className="mt-1 text-xs text-muted-foreground">{suffix}</p>}
      </CardContent>
    </Card>
  );
}
