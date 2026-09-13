import Link from "next/link";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { VerdictBadge } from "@/components/ui/verdict";

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden bg-aurora">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
          <div className="stagger max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              Confidential exposure registry
            </p>

            <h1 className="mt-6 text-balance text-display font-semibold">
              <span className="text-gradient">Lenders can&apos;t see each other&apos;s books.</span>
              <br />
              Now they don&apos;t have to.
            </h1>

            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              A borrower draws $50,000 from one lender, then $50,000 from another twelve minutes
              later. Neither can see the other. Hardpull detects that — without any lender
              disclosing a single position to a competitor.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/pull"
                className="inline-flex h-12 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lift transition-[filter] duration-[120ms] ease-out hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Run a pull
              </Link>
              <Link
                href="/furnish"
                className="inline-flex h-12 items-center rounded-md border border-border bg-background/70 px-6 text-sm font-medium backdrop-blur transition-colors duration-[120ms] ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Furnish a position
              </Link>
            </div>
          </div>

          {/* The product in one object: this is the entire response a lender receives. */}
          <div className="mt-16 animate-rise [animation-delay:220ms]">
            <Card className="max-w-xl overflow-hidden shadow-lift">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
                <span className="font-mono text-xs text-muted-foreground">POST /v1/pull</span>
                <VerdictBadge verdict="CRITICAL" />
              </div>
              <CardContent className="p-5">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  <Stat label="Exposure bucket" value="50k–250k" />
                  <Stat label="Originations / 48h" value="2" />
                  <Stat label="Inquiries / 7d" value="4" />
                  <Stat label="Distinct furnishers" value="3" />
                </dl>
                <p className="mt-5 border-t border-border pt-4 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  Note what is absent: no counterparty, no exact amount, no loan terms. The
                  enclave&apos;s output type has no field for any of it.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-title font-semibold">How it works</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="transition-shadow duration-200 ease-out hover:shadow-lift">
              <CardContent className="pt-6">
                <span className="font-mono text-xs tabular text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <CardTitle className="mt-3">{step.title}</CardTitle>
                <CardDescription className="mt-2">{step.body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-title font-semibold">What we don&apos;t claim</h2>
          <p className="mt-4 max-w-3xl text-pretty leading-relaxed text-muted-foreground">
            The enclave&apos;s confidentiality rests on hardware attestation — a trust assumption,
            not a proof. World ID establishes personhood, not institutional identity. Exposure
            buckets leak coarse information deliberately; full opacity would make the registry
            useless for its purpose. A furnisher can still submit a false record — commitments
            make that tamper-evident, not true.
          </p>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-base tabular">{value}</dd>
    </div>
  );
}

const STEPS = [
  {
    title: "Lenders furnish, sealed",
    body: "Each position is encrypted to the enclave's public key in the lender's own browser. Hardpull stores ciphertext and writes only a commitment on-chain.",
  },
  {
    title: "The borrower grants access",
    body: "A wallet-signed, time-boxed grant naming one lender and a pull limit. Revocable at any moment, and checked before any compute happens.",
  },
  {
    title: "The join happens in a TEE",
    body: "A Chainlink CRE Confidential Workflow decrypts every lender's records together, verifies each commitment, and applies the stacking rules.",
  },
  {
    title: "Only a verdict leaves",
    body: "A severity, a bucket, two velocities and a flag list. The output struct has no field for a counterparty or an exact amount, enforced by a test.",
  },
  {
    title: "Reciprocity is enforced on-chain",
    body: "Pull allowance scales with what you furnish. Freeloaders are rate-limited and repriced — contribution is the price of access.",
  },
  {
    title: "Every inquiry is logged",
    body: "Inquiries go to an immutable Hedera Consensus Service topic, and become an input to every future verdict. Velocity catches stacking in progress.",
  },
];
