// In-memory singleton so the agent's identity persists across requests within one server
// process (resets on restart) -- a real deployment would persist this the same way api/'s own
// furnisher records do. Demo scope only; see docs/plan.md T-063.
export interface AgentCredentials {
  furnisherId: string;
  clientId: string;
  clientSecret: string;
  hmacSecret: string;
}

let credentials: AgentCredentials | null = null;

export function getCredentials(): AgentCredentials | null {
  return credentials;
}

export function setCredentials(creds: AgentCredentials): void {
  credentials = creds;
}
