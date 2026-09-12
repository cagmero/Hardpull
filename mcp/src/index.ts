import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Tools land here as the subgraph comes online (docs/plan.md T-083):
// get_credit_file, check_stacking_risk, list_recent_inquiries, get_furnisher_standing
// See docs/architecture.md #2.5.

const server = new Server(
  { name: "hardpull-mcp", version: "0.0.0" },
  { capabilities: { tools: {} } },
);

const transport = new StdioServerTransport();
await server.connect(transport);
