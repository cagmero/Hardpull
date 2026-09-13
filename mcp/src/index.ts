import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getFurnisherStanding, getFurnishingActivity } from "./subgraphClient.js";
import { getRecentInquiries, checkStackingRisk } from "./hardpullClient.js";

const server = new McpServer({ name: "hardpull-mcp", version: "0.1.0" });

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
}

// docs/architecture.md #2.5. Disclosure limits (spec.md #6.6) apply here exactly as they do to
// the API: nothing this server returns ever includes a furnisher identity, an exact amount, or
// a prior puller identity -- get_credit_file below reports furnishing *activity* (counts,
// timestamps, versions), never contents.
server.registerTool(
  "get_credit_file",
  {
    title: "Get credit file",
    description:
      "Summarizes a subject's furnishing activity and recent inquiry history. Never returns exact amounts, furnisher identities, or counterparty details -- only counts, versions, and timestamps.",
    inputSchema: { subjectId: z.string().describe("The subject's bytes32 subjectId, e.g. 0x...") },
  },
  async ({ subjectId }) => {
    try {
      const [activity, inquiries] = await Promise.all([
        getFurnishingActivity(subjectId),
        getRecentInquiries(subjectId, 90),
      ]);
      return textResult({
        subjectId,
        distinctFurnishers: new Set(activity.map((a) => a.furnisher.id)).size,
        furnishedCommitmentCount: activity.length,
        lastFurnishedAt: activity[0]?.updatedAt ?? null,
        inquiriesLast90Days: inquiries,
      });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "check_stacking_risk",
  {
    title: "Check stacking risk",
    description:
      "Runs a real Hardpull pull for a proposed loan and returns the verdict (CLEAR/WARNING/CRITICAL/INSUFFICIENT_DATA) and exposure bucket. Requires the MCP server's own puller identity to hold a valid consent grant for this subject -- returns CONSENT_MISSING otherwise, which is correct behavior, not an error to work around.",
    inputSchema: {
      subjectId: z.string(),
      proposedPrincipal: z.string().describe("Proposed loan principal as a decimal string"),
      consentToken: z
        .string()
        .describe("The grantId the borrower received from POST /v1/consent and shared with this puller"),
    },
  },
  async ({ subjectId, proposedPrincipal, consentToken }) => {
    try {
      return textResult(await checkStackingRisk(subjectId, proposedPrincipal, consentToken));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_recent_inquiries",
  {
    title: "List recent inquiries",
    description: "Lists inquiries against a subject within the last N days. Puller identity is always hashed.",
    inputSchema: { subjectId: z.string(), days: z.number().int().positive().default(30) },
  },
  async ({ subjectId, days }) => {
    try {
      return textResult(await getRecentInquiries(subjectId, days));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "get_furnisher_standing",
  {
    title: "Get furnisher standing",
    description: "Reads a furnisher's reciprocity standing (fresh record count, pull allowance) from the subgraph.",
    inputSchema: { furnisherId: z.string() },
  },
  async ({ furnisherId }) => {
    try {
      const standing = await getFurnisherStanding(furnisherId);
      if (!standing) return textResult({ furnisherId, found: false });
      return textResult(standing);
    } catch (err) {
      return errorResult(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
