import type { Context, MiddlewareHandler } from "hono";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { x402HTTPResourceServer, type HTTPAdapter, type HTTPRequestContext, type RoutesConfig } from "@x402/core/http";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { freshRecordCountOnChain } from "../chain/contracts.js";

// Real @x402/core + @x402/hedera wiring, verified against the packages' actual type
// definitions (not guessed) -- see api/README.md for what's confirmed vs. what still needs a
// live facilitator + funded Hedera testnet accounts to actually settle (docs/plan.md T-060).

class HonoX402Adapter implements HTTPAdapter {
  constructor(private c: Context) {}
  getHeader(name: string): string | undefined {
    return this.c.req.header(name) ?? undefined;
  }
  getMethod(): string {
    return this.c.req.method;
  }
  getPath(): string {
    return new URL(this.c.req.url).pathname;
  }
  getUrl(): string {
    return this.c.req.url;
  }
  getAcceptHeader(): string {
    return this.c.req.header("accept") ?? "*/*";
  }
  getUserAgent(): string {
    return this.c.req.header("user-agent") ?? "";
  }
  furnisherId(): string | undefined {
    return this.c.get("furnisherId");
  }
}

let httpServer: x402HTTPResourceServer | undefined;
let initError: Error | undefined;

// Differential pricing by reciprocity standing (spec.md #6.7.2, docs/plan.md T-061): a
// furnisher with fresh standing pays less per pull. Falls back to the base price if standing
// can't be read onchain -- pricing degrades gracefully, payment verification never does.
// Denominated in USD and settled in Hedera testnet USDC (0.0.429274) by the scheme's default
// asset table. The payer's Hedera account must be associated with that token and hold a
// balance -- Circle's faucet at faucet.circle.com mints it for Hedera Testnet.
const BASE_PRICE_USD = "$0.05";
const FURNISHER_PRICE_USD = "$0.01";

async function pullPrice(context: HTTPRequestContext): Promise<string> {
  const adapter = context.adapter as HonoX402Adapter;
  const furnisherId = adapter.furnisherId();
  if (!furnisherId) return BASE_PRICE_USD;

  try {
    // freshRecordCount, NOT pullAllowance. ReciprocityLedger computes
    // `pullAllowance = baseAllowance + freshRecordCount * k` with baseAllowance defaulting to
    // 5, so pullAllowance is never 0 and the old `allowance > 0n` test was true for everyone --
    // a lender that had never furnished anything was quoted the discounted furnisher price.
    // T-061 asks for two callers with different standing to receive different quotes, which
    // that could not do. freshRecordCount is 0 until you actually furnish, which is the thing
    // the discount is meant to reward.
    const freshRecords = await freshRecordCountOnChain(furnisherId as `0x${string}`);
    return freshRecords > 0n ? FURNISHER_PRICE_USD : BASE_PRICE_USD;
  } catch {
    // Pricing degrades to the base rate if standing can't be read; payment verification never
    // degrades. Charging full price on a chain hiccup is the safe direction to fail.
    return BASE_PRICE_USD;
  }
}

function buildRoutes(payToAddress: string): RoutesConfig {
  return {
    "POST /v1/pull": {
      accepts: {
        scheme: "exact",
        network: "hedera:testnet",
        payTo: payToAddress,
        price: pullPrice,
      },
      description: "Hardpull exposure verdict",
      mimeType: "application/json",
    },
  };
}

async function getHttpServer(): Promise<x402HTTPResourceServer> {
  if (httpServer) return httpServer;
  if (initError) throw initError;

  try {
    const payTo = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
    if (!payTo) throw new Error("HEDERA_OPERATOR_ACCOUNT_ID is not set");

    const facilitatorClient = new HTTPFacilitatorClient({
      url: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    });
    // No defaultAssets override on purpose. @x402/hedera already ships the right default for
    // each network -- USDC 0.0.429274 (6 decimals) on testnet -- and its defaultMoneyConversion
    // explicitly REJECTS the native-HBAR asset id "0.0.0", which is what this code used to
    // pass. The result was that a $-denominated price could not be converted at all and every
    // paid pull died with "Default Hedera asset must be an HTS fungible token ID" while
    // building the 402 challenge. Money strings need an HTS fungible token; HBAR is not one.
    const resourceServer = new x402ResourceServer(facilitatorClient).register(
      "hedera:*",
      new ExactHederaScheme(),
    );

    const server = new x402HTTPResourceServer(resourceServer, buildRoutes(payTo));
    await server.initialize(); // fetches supported kinds from the facilitator -- real network call
    httpServer = server;
    return server;
  } catch (err) {
    initError = err as Error;
    throw initError;
  }
}

// x402 payment gate for /v1/pull (docs/architecture.md #2.3 step 4, docs/plan.md T-060). Must
// run after requireBearerAuth (needs c.get("furnisherId") for pricing) and after the consent/
// standing checks that precede it in the short-circuit chain, per architecture.md: never charge
// for a request that was going to be rejected anyway.
// Settling a real x402 payment needs a funded Hedera testnet account and a reachable
// facilitator. Without them this middleware correctly refuses every pull with 503, which is the
// right production behavior and also makes the local demo impossible to finish. This escape
// hatch exists for local rehearsal only: it is OFF unless explicitly switched on, announces
// itself on every request, and is reported as a bypass by GET /health/ready so it can never be
// mistaken for a working payment integration -- least of all by us, in a demo video.
export function x402Bypassed(): boolean {
  return process.env.HARDPULL_X402_MODE === "disabled";
}

export const requireX402Payment: MiddlewareHandler = async (c, next) => {
  if (x402Bypassed()) {
    console.warn(
      "[x402] BYPASSED (HARDPULL_X402_MODE=disabled) -- this pull is NOT metered and NOT paid for. " +
        "Local rehearsal only; never run a demo or a deployment in this mode.",
    );
    c.header("x-hardpull-x402-bypassed", "true");
    return next();
  }

  let server: x402HTTPResourceServer;
  try {
    server = await getHttpServer();
  } catch (err) {
    return c.json(
      { error: "PAYMENT_SYSTEM_UNAVAILABLE", message: `x402 not configured: ${(err as Error).message}` },
      503,
    );
  }

  const adapter = new HonoX402Adapter(c);
  const requestContext: HTTPRequestContext = {
    adapter,
    path: new URL(c.req.url).pathname,
    method: c.req.method,
    paymentHeader: c.req.header("X-PAYMENT"),
    routePattern: "POST /v1/pull",
  };

  const result = await server.processHTTPRequest(requestContext);

  if (result.type === "payment-error") {
    const status = result.response.status as never;
    const headers = result.response.headers;
    if (result.response.body) {
      return c.body(JSON.stringify(result.response.body), status, headers);
    }
    return c.body(null, status, headers);
  }

  if (result.type === "payment-verified") {
    c.set("x402Payment", result);
  }

  await next();

  if (result.type === "payment-verified" && c.res.status < 400) {
    const settlement = await server.processSettlement(result.paymentPayload, result.paymentRequirements);
    if (settlement.success) {
      for (const [key, value] of Object.entries(settlement.headers)) {
        c.header(key, value);
      }
    }
  }
};

declare module "hono" {
  interface ContextVariableMap {
    x402Payment: unknown;
  }
}
