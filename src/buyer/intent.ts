import Anthropic from "@anthropic-ai/sdk";

export interface SkillOption {
  name: string;
  price: string;
  description: string;
}

export interface SkillDecision {
  skill: string;
  /** A Binance pair such as BTCUSDT. Defaults to BTCUSDT when the request names no asset. */
  symbol: string;
  reasoning: string;
  /** "claude" when the model chose; "rules" when we fell back. Shown on the tape. */
  source: "claude" | "rules";
}

const MODEL = "claude-opus-5";

const chooseSkillTool: Anthropic.Tool = {
  name: "choose_skill",
  description: "Choose which skill on the counter best answers the buyer's request.",
  input_schema: {
    type: "object",
    properties: {
      skill: { type: "string", description: "The exact name of the chosen skill." },
      symbol: {
        type: "string",
        description:
          "The Binance trading pair the request is about, uppercase, quoted in USDT, " +
          "such as BTCUSDT or ETHUSDT or SOLUSDT. Use BTCUSDT when no asset is named.",
      },
      reasoning: { type: "string", description: "One short sentence, addressed to the buyer's owner." },
    },
    required: ["skill", "symbol", "reasoning"],
    additionalProperties: false,
  },
  strict: true,
};

/** Names people actually use, mapped to the pair Binance quotes. */
const TICKERS: Record<string, string> = {
  btc: "BTCUSDT", bitcoin: "BTCUSDT", xbt: "BTCUSDT",
  eth: "ETHUSDT", ether: "ETHUSDT", ethereum: "ETHUSDT",
  bnb: "BNBUSDT", binancecoin: "BNBUSDT",
  sol: "SOLUSDT", solana: "SOLUSDT",
  xrp: "XRPUSDT", ripple: "XRPUSDT",
  doge: "DOGEUSDT", dogecoin: "DOGEUSDT",
  ada: "ADAUSDT", cardano: "ADAUSDT",
  avax: "AVAXUSDT", avalanche: "AVAXUSDT",
  link: "LINKUSDT", chainlink: "LINKUSDT",
  dot: "DOTUSDT", polkadot: "DOTUSDT",
  ltc: "LTCUSDT", litecoin: "LTCUSDT",
  trx: "TRXUSDT", tron: "TRXUSDT",
  matic: "MATICUSDT", polygon: "MATICUSDT",
  atom: "ATOMUSDT", cosmos: "ATOMUSDT",
  uni: "UNIUSDT", uniswap: "UNIUSDT",
  shib: "SHIBUSDT", pepe: "PEPEUSDT", sui: "SUIUSDT", apt: "APTUSDT",
  near: "NEARUSDT", arb: "ARBUSDT", op: "OPUSDT", ton: "TONUSDT",
};

/** Pull a pair out of plain language, falling back to Bitcoin when none is named. */
function symbolFrom(text: string): string {
  const explicit = text.toUpperCase().match(/\b([A-Z]{2,10})USDT\b/);
  if (explicit) return explicit[1] + "USDT";
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (TICKERS[word]) return TICKERS[word];
  }
  return "BTCUSDT";
}

const DEPTH = /deep|thorough|detailed|full|multi|timeframe|long.?term|week|swing|size up/;
const BRIEF = /stance|now|right now|quick|short|brief|call|position|today/;

/**
 * Deterministic fallback - and the path that actually runs on camera unless a
 * key is set, so it has to be good rather than a stub.
 *
 * Three outcomes, and the tape distinguishes them. A no-match defaults to the
 * cheapest item and says it defaulted, rather than inventing a rationale for a
 * choice it did not really make.
 */
function chooseByRules(request: string, catalog: SkillOption[]): SkillDecision {
  const text = request.toLowerCase();
  const symbol = symbolFrom(request);
  const deep = catalog.find((s) => s.name === "deep-dive");
  const brief = catalog.find((s) => s.name === "btc-brief") ?? catalog[0]!;

  if (DEPTH.test(text) && deep) {
    return { skill: deep.name, symbol, reasoning: `The request asks for depth, so the deeper read on ${symbol} is the right item.`, source: "rules" };
  }
  if (BRIEF.test(text)) {
    return { skill: brief.name, symbol, reasoning: `A single short-term read on ${symbol} answers this, no need for the expensive item.`, source: "rules" };
  }
  return {
    skill: brief.name,
    symbol,
    reasoning: `No clear match for that request, defaulting to the cheapest item on the counter (${brief.name}) on ${symbol}.`,
    source: "rules",
  };
}

/**
 * Agent A deciding what to buy.
 *
 * This is the agent's own judgement, made before it sees a price and before
 * the mandate is consulted - the model picks what would answer the request,
 * and the mandate independently decides whether it can be afforded. Keeping
 * those separate is the point: an agent that could talk itself past its own
 * budget would not be a guardrail.
 */
export async function chooseSkill(request: string, catalog: SkillOption[]): Promise<SkillDecision> {
  if (!process.env.ANTHROPIC_API_KEY) return chooseByRules(request, catalog);

  try {
    const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system:
        "You are the purchasing logic of an autonomous agent with a limited daily budget. " +
        "Given a request and a counter of paid skills, choose the one skill that answers it. " +
        "Prefer the cheapest skill that genuinely answers the request; only choose a more " +
        "expensive one when the request actually needs what it adds.",
      tools: [chooseSkillTool],
      tool_choice: { type: "tool", name: "choose_skill" },
      messages: [
        {
          role: "user",
          content:
            `Request: "${request}"\n\nCounter:\n` +
            catalog.map((s) => `- ${s.name} (${s.price} USD1): ${s.description}`).join("\n"),
        },
      ],
    });

    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "choose_skill",
    );
    const input = call?.input as { skill?: string; symbol?: string; reasoning?: string } | undefined;
    const chosen = catalog.find((s) => s.name === input?.skill);
    if (!chosen) return chooseByRules(request, catalog);

    const symbol = (input?.symbol ?? "").toUpperCase().trim() || symbolFrom(request);
    return {
      skill: chosen.name,
      symbol: /^[A-Z0-9]{5,20}$/.test(symbol) ? symbol : symbolFrom(request),
      reasoning: input?.reasoning?.trim() || "Chosen as the best fit for the request.",
      source: "claude",
    };
  } catch {
    // A demo that hangs on a model call is worse than a demo without one.
    return chooseByRules(request, catalog);
  }
}
