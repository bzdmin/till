import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { BuyerAgent } from "../buyer/agent.js";
import { mandateFrom } from "../buyer/mandate.js";
import { searchBazaar, scoreListings, verifyListing } from "../buyer/bazaar.js";
import { prices, seller, useAgenticWallet } from "../config.js";
import { tape } from "../tape.js";

const SELLER = process.env.SELLER_URL ?? "http://localhost:3000";
const PORT = Number(process.env.MCP_PORT ?? 4190);

const mandate = mandateFrom(prices.dailyCap, prices.dailyCap, [seller.address]);
const agent = new BuyerAgent(mandate, useAgenticWallet);

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

/**
 * Till as an MCP server.
 *
 * Any Agent OS client - Claude, Codex, Cursor, VS Code - can drive the buyer
 * through these tools. The mandate is enforced inside `buy`, on this side of
 * the boundary: a client that asks to overspend is refused here, not trusted
 * to police itself. That is the whole point of a mandate living with the agent
 * rather than with whoever is prompting it.
 */
function build(): McpServer {
  const server = new McpServer({ name: "till", version: "0.1.0" });

  server.registerTool(
    "list_skills",
    {
      title: "List what is on the counter",
      description: "The paid skills this Till counter sells, with prices in USD1.",
      inputSchema: {},
    },
    async () => text(await (await fetch(`${SELLER}/`)).json()),
  );

  server.registerTool(
    "mandate_status",
    {
      title: "Owner mandate",
      description: "The spending limits the buyer is operating under, and what is left today.",
      inputSchema: {},
    },
    async () =>
      text({
        dailyCapUsd1: prices.dailyCap,
        spentUsd1: Number(mandate.spentTotal) / 1e18,
        remainingUsd1: Number(mandate.remaining) / 1e18,
        allowedPayees: mandate.config.allowlist,
        signer: useAgenticWallet ? "binance-agentic-wallet" : "local-key",
      }),
  );

  server.registerTool(
    "buy",
    {
      title: "Buy a skill",
      description:
        "Say what you need in plain language. The agent picks a skill, checks the owner's " +
        "mandate, signs an x402 payment, and returns the work. Spends real USD1 on BNB Chain. " +
        "Refused if it would exceed the mandate.",
      inputSchema: { request: z.string().describe("What you need, in plain language.") },
    },
    async ({ request }) => text(await agent.request(request, SELLER)),
  );

  server.registerTool(
    "discover",
    {
      title: "Find other x402 counters",
      description:
        "Search the B402 Bazaar for endpoints that accept x402 on BNB Chain, ranked " +
        "defensively - buyer diversity and operator concentration, not catalog rank. " +
        "Read-only; costs nothing.",
      inputSchema: {
        query: z.string().describe("What capability you are looking for."),
        limit: z.number().int().min(1).max(25).optional(),
      },
    },
    async ({ query, limit }) => text(scoreListings(await searchBazaar(query, limit ?? 10)).slice(0, limit ?? 10)),
  );

  server.registerTool(
    "verify_endpoint",
    {
      title: "Check an endpoint before paying it",
      description:
        "Ask an x402 URL what it actually serves and compare it with what it advertises. " +
        "Bazaar listings record a past settlement, not a live contract, so they can be stale " +
        "or simply wrong. Read-only; costs nothing.",
      inputSchema: { url: z.string().url() },
    },
    async ({ url }) =>
      text(
        await verifyListing({
          resource: url, description: "", payTo: "", priceUsd1: 0,
          operatorListings: 1, uniquePayers: null, totalCalls: null, score: 0, notes: [],
        }),
      ),
  );

  server.registerTool(
    "tape",
    {
      title: "Transaction tape",
      description:
        "Every step of every purchase in order - intent, price, mandate decision, settlement " +
        "hash, deliverable, refusal.",
      inputSchema: { limit: z.number().int().min(1).max(200).optional() },
    },
    async ({ limit }) => text(tape.rows.slice(-(limit ?? 40))),
  );

  return server;
}

const app = express();
app.use(express.json());

/**
 * Stateless: a fresh server and transport per request, and no session id.
 * Issuing one while rebuilding the server each time strands every follow-up
 * call, because the next request has no session to resume.
 */
app.post("/mcp", async (req, res) => {
  const server = build();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", (_req, res) => res.status(405).json({ error: "use POST" }));

app.listen(PORT, () => {
  console.log(`Till MCP server - http://localhost:${PORT}/mcp`);
  console.log(`  counter ${SELLER}`);
  console.log(`  signer  ${useAgenticWallet ? "binance agentic wallet" : "local key"}`);
  console.log(`  tools   list_skills · mandate_status · buy · discover · verify_endpoint · tape`);
});
