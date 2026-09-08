import express from "express";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { searchBazaar, scoreListings, verifyListing } from "../buyer/bazaar.js";
import { prices } from "../config.js";
import type { TapeRow } from "../tape.js";

/**
 * The public instance.
 *
 * Everything that only reads is open to anyone: the counter's catalogue,
 * Bazaar discovery, endpoint verification, and the tape from the runs that
 * actually happened. Nothing here can spend, because nothing here holds a key,
 * so `buy` answers READ_ONLY rather than pretending to be gated by policy it
 * could not enforce.
 */
const PORT = Number(process.env.PORT ?? 8080);
const SELLER = process.env.SELLER_URL ?? "https://till-counter.fly.dev";
const TOKEN = process.env.TILL_API_TOKEN ?? "";

/** The rows from real runs, so the tape is not empty for a first-time visitor. */
const seeded: (TapeRow & { at: number })[] = (() => {
  try {
    return JSON.parse(readFileSync("public/tape.json", "utf8"));
  } catch {
    return [];
  }
})();

const authorised = (req: express.Request) =>
  TOKEN.length > 0 && req.get("x-till-token") === TOKEN;

const readOnly = {
  error: "READ_ONLY",
  detail:
    "This is the public instance and it holds no wallet, so it cannot spend. " +
    "Clone the repository and run it with your own keys to buy anything.",
  repository: "https://github.com/bzdmin/till",
};

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/api/state", async (_req, res) => {
  const counter = await (await fetch(`${SELLER}/counter`)).json();
  res.json({
    readOnly: true,
    counter: SELLER,
    buyer: "0x54de1099024f3Aa4696618adc7DbBF3CF287Cae1",
    seller: (counter as { address: string }).address,
    balances: { a: "0.00", b: "0.00" },
    mandate: { cap: prices.dailyCap, spent: "0.00", remaining: prices.dailyCap },
    prices: { brief: prices.skill, deepDive: prices.deepDive },
    rows: seeded,
  });
});

app.get("/api/model", (_req, res) => res.json({ configured: false, readOnly: true }));

app.get("/api/tape", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const beat = setInterval(() => res.write(": keepalive\n\n"), 15_000);
  req.on("close", () => clearInterval(beat));
});

app.post("/api/request", (req, res) => {
  if (!authorised(req)) return res.status(403).json(readOnly);
  res.status(503).json({ error: "no buyer on this instance" });
});

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

function build(): McpServer {
  const server = new McpServer({ name: "till", version: "0.1.0" });

  server.registerTool(
    "list_skills",
    { title: "List what is on the counter", description: "The paid skills this Till counter sells, with prices in USD1.", inputSchema: {} },
    async () => text(await (await fetch(`${SELLER}/counter`)).json()),
  );

  server.registerTool(
    "discover",
    {
      title: "Find x402 counters on the B402 Bazaar",
      description:
        "Search Binance's public catalogue of endpoints accepting x402 on BNB Chain, ranked on buyer " +
        "diversity and operator concentration rather than catalogue order. Read-only, costs nothing.",
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(25).optional() },
    },
    async ({ query, limit }) => text(scoreListings(await searchBazaar(query, limit ?? 10)).slice(0, limit ?? 10)),
  );

  server.registerTool(
    "verify_endpoint",
    {
      title: "Check an endpoint before paying it",
      description:
        "Ask an x402 URL what it actually serves and compare it with what its Bazaar listing claims. " +
        "A listing records one past settlement, not a live contract. Read-only, costs nothing.",
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
    { title: "Transaction tape", description: "Steps from the runs that actually happened, in order.", inputSchema: {} },
    async () => text(seeded),
  );

  server.registerTool(
    "buy",
    {
      title: "Buy a skill",
      description:
        "Unavailable on the public instance, which holds no wallet. Clone the repository and run it " +
        "with your own keys to spend anything.",
      inputSchema: { request: z.string() },
    },
    async () => text(readOnly),
  );

  return server;
}

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
  console.log(`Till public instance on ${PORT}, read-only, counter ${SELLER}`);
});
