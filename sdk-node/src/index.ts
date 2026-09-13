import createClient from "openapi-fetch";
import type { PullRequest, Verdict } from "@hardpull/types";
import type { paths } from "./generated/openapi.js";

export type { paths as HardpullApiPaths } from "./generated/openapi.js";

// Genuinely generated from ../api/openapi.yaml via openapi-typescript (see package.json's
// `codegen` script) -- `paths` below is real generated output, not hand-typed. openapi-fetch
// gives every method full type safety against that schema (docs/plan.md T-05B).
export class HardpullClient {
  private client: ReturnType<typeof createClient<paths>>;

  constructor(baseUrl: string, private apiKey: string) {
    this.client = createClient<paths>({ baseUrl });
  }

  private authHeaders() {
    return { authorization: `Bearer ${this.apiKey}` };
  }

  /** context.md's headline usage: `hardpull.pull({ subjectId, proposedPrincipal })`. */
  async pull(request: PullRequest): Promise<Verdict> {
    const { data, error, response } = await this.client.POST("/v1/pull", {
      headers: { ...this.authHeaders(), "idempotency-key": crypto.randomUUID() },
      body: request,
    });
    if (error || !data) {
      throw new Error(`hardpull pull failed: ${response.status} ${JSON.stringify(error)}`);
    }
    return data as Verdict;
  }

  async getStanding(furnisherId: string) {
    const { data, error, response } = await this.client.GET("/v1/furnishers/{furnisherId}/standing", {
      params: { path: { furnisherId } },
    });
    if (error || !data) throw new Error(`getStanding failed: ${response.status} ${JSON.stringify(error)}`);
    return data;
  }

  async getInquiries(subjectId: string) {
    const { data, error } = await this.client.GET("/v1/subjects/{subjectId}/inquiries", {
      params: { path: { subjectId } },
    });
    if (!data) throw new Error(`getInquiries failed: ${JSON.stringify(error)}`);
    return data;
  }
}
