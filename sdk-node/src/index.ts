import type { PullRequest, Verdict } from "@hardpull/types";

// Hand-written stub. Replaced by OpenAPI-generated client at T-05B once
// ../docs/openapi.yaml exists.
export class HardpullClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  async pull(request: PullRequest): Promise<Verdict> {
    const res = await fetch(`${this.baseUrl}/v1/pull`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`hardpull pull failed: ${res.status}`);
    return res.json() as Promise<Verdict>;
  }
}
