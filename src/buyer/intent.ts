import Anthropic from "@anthropic-ai/sdk";

export interface SkillOption {
  name: string;
  price: string;
  description: string;
}

export interface SkillDecision {
  skill: string;
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
      reasoning: { type: "string", description: "One short sentence, addressed to the buyer's owner." },
    },
    required: ["skill", "reasoning"],
    additionalProperties: false,
  },
  strict: true,
};

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
  const deep = catalog.find((s) => s.name === "deep-dive");
  const brief = catalog.find((s) => s.name === "btc-brief") ?? catalog[0]!;

  if (DEPTH.test(text) && deep) {
    return { skill: deep.name, reasoning: "The request asks for depth, so the deeper read is the right item.", source: "rules" };
  }
  if (BRIEF.test(text)) {
    return { skill: brief.name, reasoning: "A single short-term read answers this - no need for the expensive item.", source: "rules" };
  }
  return {
    skill: brief.name,
    reasoning: `No clear match for that request - defaulting to the cheapest item on the counter (${brief.name}).`,
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
    const input = call?.input as { skill?: string; reasoning?: string } | undefined;
    const chosen = catalog.find((s) => s.name === input?.skill);
    if (!chosen) return chooseByRules(request, catalog);

    return {
      skill: chosen.name,
      reasoning: input?.reasoning?.trim() || "Chosen as the best fit for the request.",
      source: "claude",
    };
  } catch {
    // A demo that hangs on a model call is worse than a demo without one.
    return chooseByRules(request, catalog);
  }
}
