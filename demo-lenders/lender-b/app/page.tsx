"use client";

import { useState } from "react";

type Decision = "APPROVE" | "APPROVE_WITH_REVIEW" | "DECLINE" | "UNABLE_TO_DECIDE";

interface Verdict {
  verdict: "CLEAR" | "WARNING" | "CRITICAL" | "INSUFFICIENT_DATA";
  exposureBucket: string;
  originationVelocity48h: number;
  inquiryVelocity7d: number;
  distinctFurnishers: number;
  stackingFlags: string[];
}

interface AgentResult {
  decision: Decision;
  reason?: string;
  trace: string[];
  verdict?: Verdict;
}

const DECISION_STYLE: Record<Decision, string> = {
  APPROVE: "border-clear/30 bg-clear/5 text-clear",
  APPROVE_WITH_REVIEW: "border-warning/30 bg-warning/5 text-warning",
  DECLINE: "border-critical/30 bg-critical/5 text-critical",
  UNABLE_TO_DECIDE: "border-border bg-muted text-muted-foreground",
};

export default function LenderB() {
  const [subjectId, setSubjectId] = useState("");
  const [proposedPrincipal, setProposedPrincipal] = useState("40000");
  const [consentToken, setConsentToken] = useState("");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [running, setRunning] = useState(false);

  async function runAgent() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId, proposedPrincipal, consentToken }),
      });
      setResult(await res.json());
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-dvh bg-aurora">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="stagger">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            Autonomous underwriting agent
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight">Lender B</h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            The second half of the scenario. The agent registers its own identity, pays for the
            inquiry over x402, calls{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem]">/v1/pull</code>
            , and decides — with no human handling a credential at any point.
          </p>
        </header>

        <section className="mt-10 rounded-lg border border-border bg-card p-6 shadow-subtle">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAgent();
            }}
            className="space-y-5"
          >
            <LabelledInput
              id="subject"
              label="Subject ID"
              hint="The same borrower Lender A just originated to."
              value={subjectId}
              onChange={setSubjectId}
              placeholder="0x…"
              mono
            />
            <LabelledInput
              id="principal"
              label="Proposed principal"
              value={proposedPrincipal}
              onChange={setProposedPrincipal}
              mono
            />
            <LabelledInput
              id="consent"
              label="Consent token"
              hint="The grantId the borrower received from the console and shared with this lender."
              value={consentToken}
              onChange={setConsentToken}
              mono
            />

            <button
              type="submit"
              disabled={!subjectId || !consentToken || running}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-subtle transition-[filter] duration-[120ms] ease-out hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
            >
              {running && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
              {running ? "Agent running…" : "Run underwriting agent"}
            </button>
          </form>
        </section>

        {result && (
          <section className="mt-6 space-y-5 animate-rise" aria-live="polite">
            <div className={`rounded-lg border p-6 shadow-subtle ${DECISION_STYLE[result.decision]}`}>
              <p className="text-xs font-medium uppercase tracking-widest opacity-70">Decision</p>
              <p className="mt-1.5 text-3xl font-semibold tracking-tight">
                {result.decision.replace(/_/g, " ")}
              </p>
              {result.reason && <p className="mt-2 text-sm opacity-80">{result.reason}</p>}
            </div>

            {result.verdict && (
              <div className="rounded-lg border border-border bg-card p-6 shadow-subtle">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Everything Lender B learned
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <Stat label="Verdict" value={result.verdict.verdict} />
                  <Stat label="Exposure" value={result.verdict.exposureBucket} />
                  <Stat label="Orig. 48h" value={String(result.verdict.originationVelocity48h)} />
                  <Stat label="Furnishers" value={String(result.verdict.distinctFurnishers)} />
                </dl>
                {result.verdict.stackingFlags.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {result.verdict.stackingFlags.map((flag) => (
                      <span
                        key={flag}
                        className="rounded-full border border-critical/25 bg-critical/10 px-2.5 py-0.5 font-mono text-xs text-critical"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-5 border-t border-border pt-4 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  Lender A is not named here. Neither is the amount, the protocol, nor anyone who
                  pulled before. Lender B knows this borrower is stacked, and nothing else.
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-border shadow-subtle">
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Agent trace
                </span>
              </div>
              <ol className="divide-y divide-border">
                {result.trace.map((line, i) => (
                  <li key={i} className="flex gap-3 bg-card px-4 py-3 font-mono text-xs leading-relaxed">
                    <span className="shrink-0 tabular text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="break-words">{line}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function LabelledInput({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  mono,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={
          "h-11 w-full rounded-md border border-input bg-background px-3.5 text-sm transition-[border-color,box-shadow] duration-[120ms] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
          (mono ? "font-mono text-[0.8125rem]" : "")
        }
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm tabular">{value}</dd>
    </div>
  );
}
