import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { keccak256, toHex as viemToHex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  sealAnonymous,
  generateKeyPair,
  fromHex,
  toHex,
  buildConsentGrantMessage,
  buildConsentRevokeMessage,
} from "@hardpull/types";
import { HardpullClient } from "@hardpull/sdk-node";
import { pool } from "../db/pool.js";
import { registerSubjectOnChain } from "../chain/contracts.js";

// The docs/spec.md #8 success criteria, executed end to end and asserted -- this is docs/plan.md
// T-090's gate ("three clean runs with no manual intervention") as a script rather than a
// checklist someone works through by hand.
//
//   pnpm --filter @hardpull/api exec tsx src/scripts/e2e-scenario.ts [--runs 3]
//
// Needs: the API running, Postgres, Redis, an Ethereum RPC with the contracts deployed, and a
// CRE gateway (cre/cmd/localgateway is enough locally). Every prerequisite that is missing is
// reported as a named failure, never skipped silently.

const API_URL = process.env.HARDPULL_API_URL ?? "http://localhost:3001";
const WORKFLOW_PUBLIC_KEY_HEX =
  process.env.CRE_WORKFLOW_PUBLIC_KEY_HEX ?? "";

interface Step {
  name: string;
  ok: boolean;
  detail: string;
}

class ScenarioError extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ScenarioError(message);
}

async function api(
  path: string,
  init: RequestInit & { token?: string; hmacSecret?: string; idempotencyKey?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  if (init.hmacSecret && typeof init.body === "string") {
    headers.set("hardpull-signature", createHmac("sha256", init.hmacSecret).update(init.body).digest("hex"));
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body: body as any };
}

async function registerFurnisher(label: string): Promise<{
  furnisherId: string;
  token: string;
  hmacSecret: string;
}> {
  const operatorAddress = `0x${randomBytes(20).toString("hex")}`;
  const identity = generateKeyPair();

  const registration = await api("/v1/furnishers", {
    method: "POST",
    body: JSON.stringify({ operatorAddress, publicKeyHex: toHex(identity.publicKey) }),
  });
  assert(registration.status === 201, `${label} registration failed: ${JSON.stringify(registration.body)}`);

  const token = await api("/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: registration.body.clientId,
      client_secret: registration.body.clientSecret,
    }),
  });
  assert(token.status === 200, `${label} token exchange failed: ${JSON.stringify(token.body)}`);

  return {
    furnisherId: registration.body.furnisherId,
    token: token.body.access_token,
    hmacSecret: registration.body.hmacSecret,
  };
}

async function furnish(
  label: string,
  furnisher: { token: string; hmacSecret: string },
  subjectId: string,
  principal: string,
  originatedAt: Date,
): Promise<{ commitment: string }> {
  const plaintext = JSON.stringify({
    principal,
    currency: "USD",
    originatedAt: originatedAt.toISOString(),
    status: "ACTIVE",
  });
  const sealed = sealAnonymous(new TextEncoder().encode(plaintext), fromHex(WORKFLOW_PUBLIC_KEY_HEX));
  const sealedBoxHex = toHex(sealed);
  const body = JSON.stringify({ subjectId, sealedBoxHex });

  const res = await api("/v1/furnish", {
    method: "POST",
    body,
    token: furnisher.token,
    hmacSecret: furnisher.hmacSecret,
    idempotencyKey: randomUUID(),
  });
  assert(res.status === 201, `${label} furnish failed: ${JSON.stringify(res.body)}`);

  // The commitment the API wrote onchain must be keccak256 of exactly the ciphertext we sent --
  // otherwise the enclave's own commitment check would reject this record later.
  const expected = keccak256(viemToHex(sealed));
  assert(
    res.body.commitment === expected,
    `${label} commitment mismatch: API wrote ${res.body.commitment}, expected ${expected}`,
  );

  return { commitment: res.body.commitment };
}

async function runScenario(run: number): Promise<Step[]> {
  const steps: Step[] = [];
  const record = (name: string, detail: string) => steps.push({ name, ok: true, detail });

  // ---- 0. The API is up and its essential dependencies are reachable ----
  const ready = await api("/health/ready");
  assert(ready.status === 200, `API not ready: ${JSON.stringify(ready.body)}`);
  record("API ready", `postgres + redis reachable; payment=${ready.body.pullChain.payment}`);

  assert(
    WORKFLOW_PUBLIC_KEY_HEX.length === 64,
    "CRE_WORKFLOW_PUBLIC_KEY_HEX must be the 32-byte workflow X25519 public key (run `cd cre && go run ./cmd/keygen`)",
  );

  // ---- 1. A borrower exists, bound to a wallet ----
  const subjectKey = generatePrivateKey();
  const subjectAccount = privateKeyToAccount(subjectKey);
  const nullifierHash = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  const { subjectId } = await registerSubjectOnChain(nullifierHash, subjectAccount.address);
  await pool.query("insert into subjects (subject_id, first_seen_at) values ($1, now()) on conflict do nothing", [subjectId]);
  await pool.query("insert into wallets (wallet, subject_id) values ($1, $2) on conflict do nothing", [
    subjectAccount.address.toLowerCase(),
    subjectId,
  ]);
  record("Subject bound", `${subjectId.slice(0, 18)}… with wallet ${subjectAccount.address.slice(0, 10)}…`);

  // ---- 2. Three independent lenders ----
  const lenderA = await registerFurnisher("Lender A");
  const privateDesk = await registerFurnisher("Private desk");
  const lenderB = await registerFurnisher("Lender B");
  record("Lenders registered", "Lender A, a private desk, and Lender B — none can see the others' books");

  // ---- 3. Lender A originates, then the private desk does, minutes apart ----
  await furnish("Lender A", lenderA, subjectId, "50000", new Date(Date.now() - 3 * 60 * 60 * 1000));
  await furnish("Private desk", privateDesk, subjectId, "50000", new Date(Date.now() - 12 * 60 * 1000));
  record("Two originations furnished", "$50k from Lender A, then $50k from a private desk 12 minutes ago");

  // ---- 4. A pull without consent is refused before any compute or charge ----
  const noConsent = await api("/v1/pull", {
    method: "POST",
    body: JSON.stringify({ subjectId, proposedPrincipal: "50000", currency: "USD", consentToken: randomUUID() }),
    token: lenderB.token,
    idempotencyKey: randomUUID(),
  });
  assert(
    noConsent.status === 403 && noConsent.body.error === "CONSENT_MISSING",
    `expected 403 CONSENT_MISSING without a grant, got ${noConsent.status} ${JSON.stringify(noConsent.body)}`,
  );
  record("Consent gate", "a pull with no grant is refused 403 before compute or payment");

  // ---- 5. The borrower grants Lender B time-boxed access ----
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const timestamp = Date.now();
  const grantMessage = buildConsentGrantMessage({
    subjectId,
    pullerId: lenderB.furnisherId,
    expiresAt,
    maxPulls: 5,
    timestamp,
  });
  const signature = await subjectAccount.signMessage({ message: grantMessage });
  const grant = await api("/v1/consent", {
    method: "POST",
    body: JSON.stringify({
      subjectId,
      pullerId: lenderB.furnisherId,
      expiresAt,
      maxPulls: 5,
      timestamp,
      signature,
    }),
  });
  assert(grant.status === 201, `consent grant failed: ${JSON.stringify(grant.body)}`);
  const consentToken: string = grant.body.grantId;
  record("Consent granted", `borrower signed a 24h, 5-pull grant for Lender B (token ${consentToken.slice(0, 8)}…)`);

  // ---- 6. Another lender cannot reuse that grant ----
  const stolenToken = await api("/v1/pull", {
    method: "POST",
    body: JSON.stringify({ subjectId, proposedPrincipal: "50000", currency: "USD", consentToken }),
    token: lenderA.token,
    idempotencyKey: randomUUID(),
  });
  assert(
    stolenToken.status === 403,
    `Lender A reused Lender B's consent token and got ${stolenToken.status}, expected 403`,
  );
  record("Consent is not transferable", "Lender A presenting Lender B's token is refused 403");

  // ---- 7. Lender B pulls and gets the verdict ----
  const idempotencyKey = randomUUID();
  const pullBody = JSON.stringify({ subjectId, proposedPrincipal: "50000", currency: "USD", consentToken });
  const pull = await api("/v1/pull", {
    method: "POST",
    body: pullBody,
    token: lenderB.token,
    idempotencyKey,
  });
  assert(pull.status === 200, `pull failed: ${pull.status} ${JSON.stringify(pull.body)}`);
  assert(
    pull.body.verdict === "CRITICAL",
    `expected CRITICAL for two originations 12 minutes apart, got ${pull.body.verdict}`,
  );
  assert(
    pull.body.stackingFlags?.includes("MULTI_ORIGINATION_48H"),
    `expected MULTI_ORIGINATION_48H, got ${JSON.stringify(pull.body.stackingFlags)}`,
  );
  record("Verdict", `${pull.body.verdict} — ${pull.body.exposureBucket}, flags ${JSON.stringify(pull.body.stackingFlags)}`);

  // ---- 8. The disclosure invariant: spec.md #6.6 ----
  const serialized = JSON.stringify(pull.body);
  for (const [description, secret] of [
    ["Lender A's furnisher id", lenderA.furnisherId],
    ["the private desk's furnisher id", privateDesk.furnisherId],
    ["the exact outstanding amount", "100000"],
    ["an individual position principal", "50000"],
  ] as const) {
    assert(!serialized.includes(secret), `the verdict returned to Lender B leaked ${description}`);
  }
  record("Disclosure limits", "verdict names no furnisher, no exact amount, no counterparty");

  // ---- 9. A retry with the same idempotency key replays, and logs no second inquiry ----
  const before = await pool.query<{ count: string }>("select count(*) from inquiries where subject_id = $1", [subjectId]);
  const replay = await api("/v1/pull", {
    method: "POST",
    body: pullBody,
    token: lenderB.token,
    idempotencyKey,
  });
  const after = await pool.query<{ count: string }>("select count(*) from inquiries where subject_id = $1", [subjectId]);
  assert(replay.status === 200, `idempotent replay failed: ${JSON.stringify(replay.body)}`);
  assert(
    replay.body.verdict === pull.body.verdict && replay.body.attestation === pull.body.attestation,
    "idempotent replay returned a different verdict",
  );
  assert(
    before.rows[0].count === after.rows[0].count,
    `idempotent replay logged a second inquiry (${before.rows[0].count} -> ${after.rows[0].count})`,
  );
  record("Idempotency", "replay returned the cached verdict and logged no second inquiry");

  // ---- 10. The borrower sees the inquiry in their own file ----
  const inquiries = await api(`/v1/subjects/${subjectId}/inquiries`);
  assert(inquiries.status === 200, `inquiry history failed: ${JSON.stringify(inquiries.body)}`);
  assert(inquiries.body.inquiries.length >= 1, "borrower's inquiry log is empty after a pull");
  const loggedPuller = JSON.stringify(inquiries.body.inquiries);
  assert(
    !loggedPuller.includes(lenderB.furnisherId),
    "the borrower-visible inquiry log exposed the puller's raw id instead of a hash",
  );
  record("Inquiry log", `${inquiries.body.inquiries.length} inquiry visible to the borrower, puller identity hashed`);

  // ---- 11. The published SDK performs a real pull against the live API (T-05B) ----
  // Not a duplicate of step 7: that used raw fetch, this goes through the generated
  // openapi-fetch client, so a drift between api/openapi.yaml and the actual API surfaces here.
  const sdk = new HardpullClient(API_URL, lenderB.token);
  const sdkVerdict = await sdk.pull({
    subjectId,
    proposedPrincipal: "50000",
    currency: "USD",
    consentToken,
  });
  assert(
    sdkVerdict.verdict === "CRITICAL",
    `SDK pull returned ${sdkVerdict.verdict}, expected CRITICAL`,
  );
  record("SDK pull", `@hardpull/sdk-node returned ${sdkVerdict.verdict} against the live API`);

  // ---- 12. Revocation takes effect immediately ----
  const revokeTimestamp = Date.now();
  const revokeSignature = await subjectAccount.signMessage({
    message: buildConsentRevokeMessage({ grantId: consentToken, timestamp: revokeTimestamp }),
  });
  const revoke = await api(`/v1/consent/${consentToken}`, {
    method: "DELETE",
    body: JSON.stringify({ subjectId, timestamp: revokeTimestamp, signature: revokeSignature }),
  });
  assert(revoke.status === 200, `revocation failed: ${revoke.status} ${JSON.stringify(revoke.body)}`);

  const afterRevoke = await api("/v1/pull", {
    method: "POST",
    body: pullBody,
    token: lenderB.token,
    idempotencyKey: randomUUID(),
  });
  assert(afterRevoke.status === 403, `a pull after revocation returned ${afterRevoke.status}, expected 403`);
  record("Revocation", "the next pull after revoking is refused 403");

  return steps;
}

async function main() {
  const runsArg = process.argv.indexOf("--runs");
  const runs = runsArg === -1 ? 3 : Number(process.argv[runsArg + 1]);

  let failed = 0;
  for (let run = 1; run <= runs; run++) {
    console.log(`\n─── run ${run} of ${runs} ${"─".repeat(40)}`);
    try {
      const steps = await runScenario(run);
      for (const step of steps) console.log(`  ✓ ${step.name.padEnd(28)} ${step.detail}`);
      console.log(`  run ${run}: PASS`);
    } catch (err) {
      failed++;
      console.error(`  ✗ run ${run}: FAIL — ${(err as Error).message}`);
    }
  }

  console.log(
    `\n${failed === 0 ? "✓" : "✗"} T-090 gate: ${runs - failed}/${runs} clean runs` +
      (failed === 0 ? "" : " — gate NOT met"),
  );
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
