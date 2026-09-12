// World ID Selfie Check server-side proof verification (docs/plan.md T-070).
// Calls Worldcoin's cloud verification API -- this is the real endpoint, but actually succeeding
// requires a WORLD_ID_APP_ID registered on the Worldcoin Developer Portal, which this build
// environment doesn't have. See api/README.md for what's verified vs. not.

export interface WorldIdProof {
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
  verification_level: "orb" | "device";
}

export interface WorldIdVerifyResult {
  success: boolean;
  nullifierHash?: string;
  error?: string;
}

export async function verifyWorldIdProof(proof: WorldIdProof, signal?: string): Promise<WorldIdVerifyResult> {
  const appId = process.env.WORLD_ID_APP_ID;
  const actionId = process.env.WORLD_ID_ACTION_ID;
  if (!appId || !actionId) {
    return { success: false, error: "WORLD_ID_APP_ID/WORLD_ID_ACTION_ID not configured" };
  }

  const res = await fetch(`https://developer.worldcoin.org/api/v2/verify/${appId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nullifier_hash: proof.nullifier_hash,
      merkle_root: proof.merkle_root,
      proof: proof.proof,
      verification_level: proof.verification_level,
      action: actionId,
      signal,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { success: false, error: (body as { detail?: string }).detail ?? `verification failed (${res.status})` };
  }

  return { success: true, nullifierHash: proof.nullifier_hash };
}
