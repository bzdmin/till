# Till

**A payment counter for agent skills.**

One AI agent needs a small digital service. Another sells it. The buyer pays inside the HTTP request, the seller returns the work, and a tape records the whole transaction - request, price, approval, transaction hash, goods.

Built for the Binance Agent OS Mini Hackathon, Track A - Payment Workflows, agent-to-agent.

---

## The claim, precisely

> Till runs the x402 handshake and settles EIP-3009 on BNB Chain.
> **B402 is one facilitator. Till is the other.**

Proven on mainnet, with no merchant credentials:

| | |
|---|---|
| full loop | [`0x7d18498d8ac02a10f10b819641f6b717aa27d5790e8bb6c5f633ae963e172530`](https://bscscan.com/tx/0x7d18498d8ac02a10f10b819641f6b717aa27d5790e8bb6c5f633ae963e172530) |
| settlement only | [`0xf1d4bf8ea3688ffe5e6ae66a5bb691c5909a598dcd229db4c4aa9370460b2635`](https://bscscan.com/tx/0xf1d4bf8ea3688ffe5e6ae66a5bb691c5909a598dcd229db4c4aa9370460b2635) |
| moved | 0.10 USD1 each, Agent A → Agent B |
| facilitator | `selfbroadcast` |

The first hash is the whole loop - request, model decision, 402, mandate approval, settlement, signed delivery. The second is the bare settlement experiment that proved the rail before the product existed.

We do **not** claim to have settled through B402, and **no B402 adapter is written here.** Doing so needs merchant `clientId` / `accessToken` from partner onboarding, which we did not have. Settlement sits behind a one-method interface so adding that adapter is small - but small is not the same as done, and the tape labels which facilitator actually ran on every receipt.

---

## Why this needed no permission from anyone

x402 never required Binance to submit the transaction.

The buyer signs an EIP-3009 authorization - a permission slip saying *"0.10 USD1 may go to this address, valid five minutes."* **That signature is the payment.** Whoever hands it to the token contract is the facilitator, and a facilitator **cannot alter the amount or the payee**, because both are inside the signature. That is x402's security model, not a loophole in it.

Binance's B402 adds two things on top: it sponsors the gas, and it lists you in the B402 Bazaar. Both are useful. Neither of them *is* settlement.

So Till hands in its own authorizations. Consequences:

- **Agent A never sends a transaction and holds no BNB.** It only signs.
- **Agent B broadcasts and pays the gas** - a fraction of a cent - collecting its own payment.
- We use `receiveWithAuthorization`, which requires `msg.sender == to`. Only the payee can submit it, so an intercepted authorization is worthless to the interceptor. That closes Attack I-B from [*Five Attacks on x402 Agentic Payment Protocol*](https://arxiv.org/abs/2605.11781).

---

## The loop

```
  intent     A: "What should I do with my BTC position right now?"
  decided    buy btc-brief          - A picks the skill before it knows the price
  402        0.10 USD1 → 0x8cBf…    - the 402 is the entire advertisement
  mandate    ALLOW                  - owner's cap checked before signing
  settled    0xf1d4bf8e…            - facilitator: selfbroadcast
  delivered  HOLD-THE-RANGE         - signed by Agent B
  ─────
  intent     A: "Give me a thorough multi-timeframe read before I size up."
  decided    buy deep-dive
  402        5.00 USD1
  mandate    BLOCK                  - over the daily cap
  refused    cap unchanged, 1.00 USD1 remaining
```

Two decisions are deliberately kept apart: **the agent chooses what would answer the request; the owner's mandate independently decides whether it can be afforded.** The chooser never sees the cap - an agent that could reason its way past its own budget would not be a guardrail.

---

## What is actually being sold

Not the candles. The klines are public and Agent A could fetch them for free.

**A can fetch the candles. It cannot produce B's signature.**

The deliverable is a call - `wait` / `reduce` / `hold-the-range` - with two reasons drawn from where price sits in its range and its realized volatility, signed by Agent B's key over the canonical JSON. It is deterministic: the same candles always produce the same call. That is what makes it checkable, and it means no model call can time out mid-demo.

Two items on the counter:

| skill | price | what it is |
|---|---|---|
| `btc-brief` | 0.10 USD1 | one read of the last 48h |
| `deep-dive` | 5.00 USD1 | 1h, 4h and 1d, plus whether the horizons agree |

---

## Honest limits

x402 proves a transfer. It does not prove the work was good, and it cannot claw back. We do not pretend otherwise.

- The seller settles **before** producing, because withholding the body until settlement is x402's native coupling.
- After producing, an **acceptance predicate** checks the deliverable: required fields, two non-empty reasons, latency under 10s, and a signature that verifies against the seller's address.
- If that fails after settlement, the tape shows **`SETTLED_NO_GOODS`** with the transaction hash. Paid, not delivered, stated plainly. There is no fake "accept" button.

Other things worth stating rather than being asked:

- Both agents are operated by the same person. The protocol does not know that - the seller validates a payment it did not create, and nothing in the code assumes one operator.
- The stance is deterministic, reproducible and checkable. It is not alpha and is not claimed as such. The product is the counter; the stance is inventory.
- Agent A's skill selection runs on `claude-opus-5` when `ANTHROPIC_API_KEY` is set, and on deterministic rules otherwise. The tape says which ran on every request - it never implies a model made a call it did not make.

---

## Run it

```bash
npm install
cp .env.example .env      # add two burner keys; see below
npm start                 # Agent B - the counter          :3000
npm run ui                # the tape                        :4180
```

Then open <http://localhost:4180>.

`.env` needs two burner private keys - **Agent A** funded with USD1, **Agent B** funded with a little BNB for gas. Everything else in the file is already correct.

### Free commands - none of these spend anything

```bash
npm run check          # both addresses and their balances
npm run preview        # the btc-brief deliverable + acceptance check
npm run preview:deep   # the deep-dive deliverable + acceptance check
npm run rehearse       # the refusal beat, no chain, no money
npm test               # five adversarial payments, all must be rejected
npm run test:intent    # skill selection across sample phrasings
npm run prove          # sign + simulate a settlement (only --broadcast pays)
```

`npm test` is the one worth reading. It sends five malformed payments - garbage header, underpayment, wrong payee, expired authorization, wrong asset - and asserts that all are rejected *and* that no balance moved. The counter never settles something it did not advertise.

### Commands that spend real money

```bash
npm run demo                     # the full loop, ~0.10 USD1 + a fraction of a cent
npm run prove -- --broadcast     # a single settlement
npm run recycle                  # Agent B returns its USD1 to Agent A
```

Every broadcast is simulated with `eth_call` first and only sent if the simulation succeeds, so a malformed authorization costs nothing to discover.

---

## How it is put together

```
src/chain/token.ts          ABI + the EIP-712 domain guard
src/chain/authorization.ts  build and sign ReceiveWithAuthorization
src/settlement/            SettlementAdapter interface + SelfBroadcast
src/skill/                 public klines -> deterministic signed stance
src/seller/                the counter: 402, validation, settle, deliver, accept
src/buyer/                 skill selection, the owner's mandate, the purchase loop
src/tape.ts                the rows the UI renders
```

### The one non-obvious detail

USD1's `version()` returns `2`. Its **EIP-712 domain version is `"1"`**. Signing with the wrong one produces an authorization that reverts on-chain, and nothing tells you why.

So Till does not read `name()`/`version()` and compare strings. At boot it **reconstructs `DOMAIN_SEPARATOR`** from its configuration and requires exact equality with what the token returns - one check covering name, version, chainId and contract address at once - and refuses to sign on mismatch.

```
USD1  0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d   BSC, 18 decimals
      domain: "World Liberty Financial USD" / "1" / chainId 56
      DOMAIN_SEPARATOR 0x5d939dc193fd011c5e26fb861450a696546a09db6b26db26501fe354ba3ed4ba
```

USDT and USDC on BSC have no EIP-3009 at all, which would have forced Permit2 and an approval transaction from the buyer - and then Agent A would have needed gas. `U` (United Stables) is a verified drop-in alternative.

---

## Future work, not in this build

A buyer that shops **defensively**. B402 Bazaar publishes per-listing quality signals - 30-day call counts and unique payer counts - and the same paper above measures how badly agents can be steered by poisoned discovery metadata (71.8% selection via metadata manipulation; 60.2% capture from five Sybil listings). A buyer that scores listings on payer diversity rather than taking the top result is a real product. It is a *different* product, and it did not belong in this one.
