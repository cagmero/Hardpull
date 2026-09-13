"use client";

import { useState } from "react";
import { IDKitWidget, type ISuccessResult, type IErrorState } from "@worldcoin/idkit";
import { apiFetch } from "@/lib/api";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { JsonBlock, Mono, ResultPanel } from "@/components/ui/result";

// World ID Selfie Check subject binding (docs/spec.md #6.1, docs/plan.md T-070). IDKitWidget's
// ISuccessResult shape ({proof, merkle_root, nullifier_hash, verification_level}) is exactly
// what api/src/lib/worldid.ts's WorldIdProof expects and forwards to Worldcoin's cloud verify
// endpoint -- confirmed against @worldcoin/idkit's actual shipped type declarations, pinned to
// 2.4.2 (the classic render-prop API) rather than the latest major version, which is a newer
// World ID 4.0 protocol with a different result shape this backend doesn't implement yet.
export default function VerifyPage() {
  const [wallet, setWallet] = useState("");
  const [result, setResult] = useState<{ subjectId: string } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [error, setError] = useState<string>();

  const appId = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID as `app_${string}` | undefined;
  const actionId = process.env.NEXT_PUBLIC_WORLD_ID_ACTION_ID ?? "";

  async function handleVerify(proof: ISuccessResult) {
    setState("loading");
    const { status, body } = await apiFetch("/v1/subjects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, proof }),
    });
    if (status !== 201) {
      setState("error");
      setError(JSON.stringify(body, null, 2));
      // Thrown here also surfaces on IDKit's own error screen, per handleVerify's contract.
      throw new Error(JSON.stringify(body));
    }
    setResult(body as { subjectId: string });
    setState("ready");
  }

  return (
    <>
      <PageHeader eyebrow="Identity" title="Bind a wallet to your credit file">
        <p>
          A credit file has to survive wallet rotation, or defaulting costs one new wallet and the
          history is worthless. World ID establishes personhood once; the resulting{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem]">subjectId</code>{" "}
          is derived from the nullifier and can carry many wallets.
        </p>
      </PageHeader>

      <PageBody>
        {!appId ? (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="pt-6">
              <h2 className="text-sm font-semibold text-warning">World ID is not configured</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Register an app at the{" "}
                <a
                  href="https://developer.worldcoin.org"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                >
                  Worldcoin Developer Portal
                </a>
                , then set <code className="font-mono text-xs">NEXT_PUBLIC_WORLD_ID_APP_ID</code> and{" "}
                <code className="font-mono text-xs">NEXT_PUBLIC_WORLD_ID_ACTION_ID</code> here, plus
                the matching pair in <code className="font-mono text-xs">api/.env</code>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-5 pt-6">
              <Field
                label="Wallet to bind"
                mono
                placeholder="0x…"
                hint="One subject may bind many wallets. A wallet binds to exactly one subject, and rebinding is rejected."
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
              />

              <IDKitWidget
                app_id={appId}
                action={actionId}
                signal={wallet}
                handleVerify={handleVerify}
                onSuccess={() => {}}
                onError={(err: IErrorState) => {
                  setError(JSON.stringify(err, null, 2));
                  setState("error");
                }}
              >
                {({ open }) => (
                  <Button onClick={open} disabled={!wallet} size="lg" loading={state === "loading"}>
                    Verify with World ID
                  </Button>
                )}
              </IDKitWidget>
            </CardContent>
          </Card>
        )}

        <ResultPanel
          state={state}
          error={error}
          empty="Your subject ID appears here once verification completes."
        >
          {result && (
            <Card className="border-clear/30 bg-clear/5">
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-clear">Wallet bound</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                  Subject ID
                </p>
                <div className="mt-1.5">
                  <Mono value={result.subjectId} />
                </div>
                <JsonBlock value={result} className="mt-5" />
              </CardContent>
            </Card>
          )}
        </ResultPanel>
      </PageBody>
    </>
  );
}
