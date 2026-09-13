import { Hono } from "hono";
import { pool } from "../db/pool.js";
import { redis } from "../redis.js";
import { publicClient, deployments } from "../chain/clients.js";
import { isEacConfigured } from "../lib/ensEac.js";
import { x402Bypassed } from "../lib/x402.js";
import { describeAllowlist } from "../middleware/ipAllowlist.js";

export const health = new Hono();

// Every external dependency Hardpull touches is optional in the sense that the service starts
// without it and fails with a specific typed error at exactly the boundary that needs it
// (docs/DECISIONS.md). That is good behavior, but it makes "what is actually wired up right
// now?" hard to answer from the outside -- which matters when the answer changes as accounts
// get provisioned. This endpoint answers it directly.
//
// `configured` means the env vars are present. `ok` means it was actually reached just now.
// A dependency can be configured and not ok (wrong URL, service down); one that is not
// configured is never probed.

type Probe = { configured: boolean; ok?: boolean; detail: string };

const configuredWhen = (present: boolean, detail: string, missing: string): Probe =>
  present ? { configured: true, detail } : { configured: false, detail: missing };

const PROBE_TIMEOUT_MS = 3000;

// A readiness endpoint that hangs is worse than one that reports a failure: ioredis queues and
// retries rather than rejecting when the server is unreachable, and a stalled RPC behaves the
// same way, so a probe must be able to give up on its own.
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} did not respond within ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS),
    ),
  ]);
}

async function probe(present: boolean, detail: string, missing: string, check: () => Promise<string>): Promise<Probe> {
  if (!present) return { configured: false, detail: missing };
  try {
    return { configured: true, ok: true, detail: await withTimeout(check(), "probe") };
  } catch (err) {
    return { configured: true, ok: false, detail: (err as Error).message };
  }
}

// Kept exactly as it was -- a bare liveness check that touches nothing, for load balancers.
health.get("/health", (c) => c.json({ status: "ok" }));

health.get("/health/ready", async (c) => {
  const chainConfigured = (() => {
    try {
      deployments();
      return true;
    } catch {
      return false;
    }
  })();

  const [postgres, redisProbe, chain] = await Promise.all([
    probe(!!process.env.DATABASE_URL, "", "DATABASE_URL not set", async () => {
      await pool.query("select 1");
      return "reachable";
    }),
    probe(true, "", "", async () => {
      await redis.ping();
      return "reachable";
    }),
    probe(chainConfigured, "", "one or more *_ADDRESS vars not set", async () => {
      const [chainId, block] = await Promise.all([
        publicClient.getChainId(),
        publicClient.getBlockNumber(),
      ]);
      return `chainId ${chainId}, block ${block}`;
    }),
  ]);

  const dependencies: Record<string, Probe> = {
    postgres,
    redis: redisProbe,
    ethereum: chain,
    creWorkflow: configuredWhen(
      !!process.env.CRE_GATEWAY_URL &&
        !!process.env.CRE_CALLER_PRIVATE_KEY &&
        !!(process.env.CRE_WORKFLOW_ID || (process.env.CRE_WORKFLOW_OWNER && process.env.CRE_WORKFLOW_NAME)),
      "gateway URL, caller key and workflow selector all set",
      "needs CRE_GATEWAY_URL, CRE_CALLER_PRIVATE_KEY and a workflow selector; /v1/pull returns 503 CRE_UNAVAILABLE until then",
    ),
    x402: x402Bypassed()
      ? {
          configured: false,
          ok: false,
          detail: "BYPASSED via HARDPULL_X402_MODE=disabled -- pulls are NOT metered or paid for. Local rehearsal only.",
        }
      : configuredWhen(
          !!process.env.HEDERA_OPERATOR_ACCOUNT_ID,
          "Hedera operator account set; settlement also needs a reachable facilitator",
          "needs a funded Hedera testnet account; /v1/pull returns 503 PAYMENT_SYSTEM_UNAVAILABLE until then",
        ),
    hcsInquiryLog: configuredWhen(
      !!process.env.HEDERA_HCS_TOPIC_ID,
      `topic ${process.env.HEDERA_HCS_TOPIC_ID}`,
      "needs HEDERA_HCS_TOPIC_ID from `tsx src/scripts/create-hcs-topic.ts`; inquiries are logged to Postgres regardless",
    ),
    subgraph: configuredWhen(
      !!process.env.SUBGRAPH_URL,
      "public exposure will be queried",
      "not set; verdicts use furnished records only, with no public-protocol exposure",
    ),
    worldId: configuredWhen(
      !!process.env.WORLD_ID_APP_ID && !!process.env.WORLD_ID_ACTION_ID,
      "proofs will be verified against Worldcoin",
      "needs a registered Developer Portal app; POST /v1/subjects rejects every proof until then",
    ),
    ensEac: configuredWhen(
      isEacConfigured(),
      "consent grants also mirror to ENSv2 Enhanced Access Control",
      "not set; consent grants live in Postgres only, which is the gate /v1/pull enforces",
    ),
  };

  const ipAllowlistState = describeAllowlist();

  // Only the dependencies the service cannot serve a request without gate readiness. A missing
  // CRE workflow or Hedera account is a documented, deliberately degraded state -- not "down".
  const essential = [postgres, redisProbe];
  const ready = essential.every((p) => p.configured && p.ok !== false);

  return c.json(
    {
      status: ready ? "ready" : "degraded",
      dependencies,
      ipAllowlist: ipAllowlistState,
      // What a caller can actually do right now, in the order /v1/pull checks them.
      pullChain: {
        consent: "always enforced (Postgres)",
        standing: dependencies.ethereum.configured ? "enforced onchain" : "unavailable -- ethereum not configured",
        payment: x402Bypassed()
          ? "BYPASSED -- not metered"
          : dependencies.x402.configured
            ? "enforced"
            : "unavailable -- returns 503 before compute",
        compute: dependencies.creWorkflow.configured ? "available" : "unavailable -- returns 503",
      },
    },
    ready ? 200 : 503,
  );
});
