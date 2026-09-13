"use client";

import { useState } from "react";
import { IDKitWidget, type ISuccessResult, type IErrorState } from "@worldcoin/idkit";
import { apiFetch } from "@/lib/api";

// World ID Selfie Check subject binding (docs/spec.md #6.1, docs/plan.md T-070). IDKitWidget's
// ISuccessResult shape ({proof, merkle_root, nullifier_hash, verification_level}) is exactly
// what api/src/lib/worldid.ts's WorldIdProof expects and forwards to Worldcoin's cloud verify
// endpoint -- confirmed against @worldcoin/idkit's actual shipped type declarations, pinned to
// 2.4.2 (the classic render-prop API) rather than the latest major version, which is a newer
// World ID 4.0 protocol with a different result shape this backend doesn't implement yet.
export default function VerifyPage() {
  const [wallet, setWallet] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const appId = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID as `app_${string}` | undefined;
  const actionId = process.env.NEXT_PUBLIC_WORLD_ID_ACTION_ID ?? "";

  async function handleVerify(proof: ISuccessResult) {
    const { status, body } = await apiFetch("/v1/subjects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, proof }),
    });
    if (status !== 201) {
      // Thrown here surfaces as IDKit's own error screen, per handleVerify's contract.
      throw new Error(JSON.stringify(body));
    }
    setResult(body);
  }

  if (!appId) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
        <h1>Verify with World ID</h1>
        <p style={{ color: "crimson" }}>
          NEXT_PUBLIC_WORLD_ID_APP_ID is not set. Register an app at the Worldcoin Developer
          Portal and set it (plus NEXT_PUBLIC_WORLD_ID_ACTION_ID) in .env.local — see
          api/README.md for what the backend needs too.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Verify with World ID</h1>
      <p>Binds a wallet to a portable subjectId that survives wallet rotation (spec.md §6.1).</p>

      <label>
        Wallet to bind
        <input value={wallet} onChange={(e) => setWallet(e.target.value)} style={{ width: "100%" }} />
      </label>

      <IDKitWidget
        app_id={appId}
        action={actionId}
        signal={wallet}
        handleVerify={handleVerify}
        onSuccess={() => {}}
        onError={(err: IErrorState) => setError(JSON.stringify(err))}
      >
        {({ open }) => (
          <button onClick={open} disabled={!wallet}>
            Verify with World ID
          </button>
        )}
      </IDKitWidget>

      {error && <pre style={{ color: "crimson" }}>{error}</pre>}
      {result !== null && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}
