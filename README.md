# Till

**Any agent can pay now, and nothing tells it who is worth paying.**

Till is a payment counter for agent skills, where one agent sells something small over HTTP and another buys it, paying inside the same request and getting the work back. Payment settles EIP-3009 on BNB Chain, and a tape binds every step to the one before it: request, price, approval, transaction hash, goods.

Binance Agent OS Mini Hackathon, Track A, Payment Workflows (agent-to-agent, automated payments).

## The problem

x402 made machine payment trivial, since asking for a resource returns `402 Payment Required` with a price, and signing then asking again returns the resource, with no account, no invoice and no signup anywhere in it.

That convenience removed the friction that used to keep an agent's spending safe, because an API key had a human behind it, a monthly bill and a form somebody filled in, whereas a 402 has none of that. Two things are missing as a result: a budget the agent cannot argue its way past, and a way to know whether the counterparty is real.

Binance built the answer to the second one, the B402 Bazaar, a public directory of endpoints taking x402 on BNB Chain, so Till checked it, and **six of the top six listings do not serve what they advertise**, since two are dead and four claim USD1 on BNB Chain while serving a different protocol version, on a different chain, in a different token.

Till is built for that world, finding counters, ranking them, checking them against what they actually serve, then paying the ones that hold up and refusing the rest under a budget it does not control.

## Built on Agent OS

Every row is a surface Agent OS ships, with what Till does with it.

| Agent OS surface | How Till uses it |
|---|---|
| **x402 / B402 protocol** | Both halves, since the counter serves 402 challenges in B402 wire format while the buyer reads them, signs and replays |
| **Binance Agentic Wallet** | `SIGNER=agentic` routes signing through the `baw` CLI, so no private key sits on the buyer side |
| **B402 Bazaar** | Discovery, where the public catalog is searched, ranked defensively, then verified against the live endpoint |
| **MCP** | Till *is* an MCP server over HTTP, with six tools drivable from Claude, Codex, Cursor or VS Code |
| **Skills Hub** | Packaged as a skill, [`SKILL.md`](./SKILL.md) at the repository root |
| **Binance market data** | Public klines, keyless and read-only, feeding the deliverable |

What Till deliberately does **not** do is settle through B402's facilitator on its own counter, because that needs merchant `clientId` and `accessToken` from partner onboarding which this project does not have, and no `LiveB402` adapter exists here since an untested adapter would be worse than none. The tape names the facilitator that actually ran on every receipt.

Two honest notes, recorded so nobody repeats the experiments. First, the counter runs in Frankfurt rather than the US, because **Binance answers `451 Unavailable For Legal Reasons` to US IP addresses**, and the first deployment sat in Virginia where it served a perfectly valid 402 and could never have delivered a stance, since producing one needs public klines. A payment rail that settles fine while the goods are unreachable is a quiet failure worth designing against, and it is why the symbol check now runs before the price is quoted rather than after payment.

Second, on the Binance MCP server: its transfer scope moves funds only inside a dedicated Agentic sub-account and it has **no withdrawal scope at all**, so an agent can never move funds to an external address through it, and it therefore cannot pay anyone. Payment lives in x402 and B402, not in MCP.

## Try it live

Two public instances, both free to poke at, neither needing a key.

| What | Where |
|---|---|
| The counter, what it sells and for how much | <https://till-counter.fly.dev/> |
| The tape, showing the runs that actually happened | <https://till-tape.fly.dev/> |
| MCP endpoint, read-only | `https://till-tape.fly.dev/mcp` |

```bash
claude mcp add till --transport http https://till-tape.fly.dev/mcp
```

That gives any Agent OS client `discover`, `verify_endpoint`, `list_skills` and `tape`, all read-only and all free. `buy` answers `READ_ONLY`, because the public instance holds no wallet and could not spend even if asked.

Or without any client at all:

```bash
curl -i https://till-counter.fly.dev/skills/btc-brief                  # a real 402
curl -i "https://till-counter.fly.dev/skills/btc-brief?symbol=ETHUSDT" # any Binance pair
curl -i "https://till-counter.fly.dev/skills/btc-brief?symbol=NOTACOIN" # 400, refused before pricing
curl https://till-counter.fly.dev/counter                              # the catalogue as JSON
```

The 402 carries a `payment-required` header with the terms in B402 wire format, naming USD1 on BNB Chain via `eip3009` at 0.10 USD1. Attach a signed authorization and the same request returns the work.

A pair Binance does not list is refused with a 400 before any price is quoted, since taking payment and then failing to fetch candles because of a typo is a `SETTLED_NO_GOODS` the buyer did nothing to deserve.

A fresh clone can run the read-only commands with no `.env` at all, because nothing that only reads needs a key:

```bash
git clone https://github.com/bzdmin/till && cd till && npm install
npm run verify-one -- https://till-counter.fly.dev/skills/btc-brief
npm run bazaar -- "crypto market data"
```

## Claims, and what backs each one

| # | Claim | Evidence |
|---|---|---|
| 1 | Till settles x402 on BNB Chain with **no merchant credentials**, acting as its own facilitator | `0x7d18498d8ac02a10f10b819641f6b717aa27d5790e8bb6c5f633ae963e172530` |
| 2 | The buyer signs with the **Binance Agentic Wallet**, so Till holds, reads and signs with no private key | `0xe2d6878ef479007ab26e2689651829d33754a113c152666b1cf80c45f5b6d5fc` (2026-09-08) |
| 3 | The buyer pays **a third party it does not control**, and that merchant's facilitator settles it | `0x92bfab31360b1c773ce26a5ef3b922527c84857dcada9f7ebfbfb041ab20929f` (2026-09-08) |
| 4 | The counter **refuses payments it did not advertise**, with no balance movement when it does | `npm test`, five attacks, all rejected |
| 5 | The mandate refuses a purchase **before anything is signed** | `npm run rehearse`, no chain, no money |
| 6 | Bazaar listings **cannot be trusted without checking** | `npm run bazaar -- "crypto market data"` |
| 7 | "No private key" and "front-run resistant" **cannot both be had today** | `npm run which-typehash` |

On 2026-09-08 the buyer discovered CoinMarketCap in the B402 Bazaar, verified the endpoint served what its listing claimed, signed with the Agentic Wallet and paid **0.0100 USD1**, receiving 18,516 bytes of market data. Till did not broadcast that settlement; the merchant's facilitator did, submitting from `0x34f7a661`, the address B402 publishes as its signer in payment requirements. Every other transaction in this repository moves between two wallets under one operator, and that one does not.

## Architecture

```
                       B402 Bazaar  (Binance)
                              |
                     search, rank, verify
                              v
  owner mandate  ------>  Agent A                Agent B
  cap, allowlist          the buyer              the counter
                              |                      |
                              |------ GET ---------->|
                              |<--- 402 + price -----|
                              |
                       mandate checked
                       before anything is signed
                              |
                  Binance Agentic Wallet
                  signs the EIP-3009 authorization
                              |
                              |-- replay with signature -->|
                              |                            settle on BNB Chain
                              |                            run the skill
                              |                            acceptance predicate
                              |<--- 200, stance, tx hash --|
                              v
                            tape
```

The buyer never sends a transaction and holds no BNB, since the signature is the payment and the seller broadcasts it. The mandate sits between the decision and the signature, so a purchase is refused before anything is signed rather than after.

```
src/chain/token.ts            ABI, balances, and the EIP-712 domain guard
src/chain/authorization.ts    build and sign an EIP-3009 authorization
src/settlement/               the SettlementAdapter seam, and SelfBroadcast
src/skill/                    public klines to a deterministic signed stance
src/seller/                   the counter: 402, validation, settle, deliver, accept
src/buyer/                    skill choice, the owner mandate, Bazaar discovery,
                              the Agentic Wallet signer, the purchase loop
src/mcp/                      Till as an MCP server
src/ui/                       the tape
```

## Why this needed no permission from anyone

x402 never required Binance to submit the transaction. The buyer signs an EIP-3009 authorization, a permission slip reading *"0.10 USD1 may go to this address, valid five minutes"*, and **that signature is the payment**. Whoever hands it to the token contract is the facilitator, and a facilitator **cannot alter the amount or the payee** because both sit inside the signature, which is x402's security model rather than a hole in it.

B402 adds gas sponsorship and Bazaar indexing on top, and neither of those is settlement, so Till hands in its own authorizations. Agent A never sends a transaction and holds no BNB, while Agent B broadcasts and pays the gas, a fraction of a cent, collecting its own payment.

## Two signers, and the trade-off between them

```
SIGNER=local      a burner key, signs ReceiveWithAuthorization
SIGNER=agentic    Binance Agentic Wallet, no key held by Till
```

They sign different things, and the difference is real:

| variant | `msg.sender` | consequence |
|---|---|---|
| `receiveWithAuthorization` | must equal the payee | an intercepted authorization is useless, front-run closed |
| `transferWithAuthorization` | anyone may submit | Attack I-B applies |

The Agentic Wallet signs the caller-unbound variant, following x402 convention, so **"no private key" and "front-run resistant" are mutually exclusive today**. The seller detects which variant a payload carries, dispatches to the matching contract function and rejects a payload recovering to neither.

## Discovery: a catalog is not a contract

Till searches the B402 Bazaar and ranks results on signals an attacker has to spend real money to fake, namely buyer diversity, operator concentration and price, rather than the catalog's own ordering, then queries the endpoint directly, because a Bazaar listing records one past settlement rather than a live contract.

On live data, the top six results for *"crypto market data"*:

```
0 of 6 checked listings actually serve what they advertise.
Nothing here is payable. The buyer signs nothing.
```

Two dead, four advertising USD1 on BNB Chain while serving x402 v1 on Base with USDC, and **one operator holding 18 of the 20 results**, none publishing usage data. That is Attack IV from [Five Attacks on x402](https://arxiv.org/abs/2605.11781), *"discovery metadata is not a safety signal"*, occurring naturally on Binance's own discovery layer. The checker is not simply pessimistic, since it returns yes for CoinMarketCap and yes for Till's own counter, which is how the one payable listing was identified.

## What is being sold

Not the candles, which are public and which the buyer could fetch free. **Agent A can fetch the candles, but it cannot produce Agent B's signature.**

The buyer reads the pair out of plain language, so *"what's ETH doing?"* and *"should I hold my solana?"* resolve to `ETHUSDT` and `SOLUSDT`, falling back to Bitcoin when no asset is named. The deliverable is a call, `wait` or `reduce` or `hold-the-range`, with two reasons drawn from where price sits in its range and its realized volatility, signed by Agent B over the canonical JSON. It is deterministic, so the same candles always give the same call, which keeps it checkable and means no model call can time out mid demo.

| skill | price | what it is |
|---|---|---|
| `btc-brief` | 0.10 USD1 | one read of the last 48 hours, on any pair |
| `deep-dive` | 5.00 USD1 | three reads, and whether they agree, on any pair |

The deep-dive is a different product rather than a prop existing to be refused, running the same computation over 1h, 4h and 1d windows, taking the majority call and reporting `unanimous`, `majority` or `split`. The per-timeframe results sit inside the signed payload so the signature covers them, and the acceptance predicate rejects a deep-dive carrying fewer than three timeframes or no agreement verdict, meaning the cheap deliverable cannot be served at the expensive price even by tampering.

Horizons disagree often: one run returned `hold-the-range` on 1h and 4h but `reduce` on 1d, with the daily at 86% of its range on 2.42% volatility while the shorter windows sat mid-range and quiet. That disagreement is what a single brief structurally cannot report, and it is what the higher price buys.

## Guardrails

Enforced by the agent rather than by whoever is prompting it.

**Before signing:** payee is on the allowlist, amount sits within the per-call maximum and within the remaining daily cap, the EIP-712 domain reconstructs to the token's on-chain `DOMAIN_SEPARATOR`, and the endpoint serves x402 v2 with the expected asset.

**Before settling:** the signature recovers to the stated payer, the amount equals the advertised price, the payee equals the advertised `payTo`, asset and network match, the authorization has not expired, and the transaction simulates successfully.

**After settling:** the deliverable passes an acceptance predicate.

Two decisions are kept apart deliberately, since the agent chooses what would answer the request while the owner's mandate independently decides whether it can be afforded. The chooser never sees the cap, because an agent able to reason its way past its own budget would not be a guardrail.

## Two bugs, recorded so nobody repeats them

**2026-09-06, a payment settled and delivered nothing.** First run of the paid path through the seller: settlement succeeded on chain, then the response crashed.

```
TypeError: Do not know how to serialize a BigInt
    at encodeHeader (src/seller/challenge.ts:61)
```

`receipt.blockNumber` arrives from viem as a bigint and `JSON.stringify` refuses those, so the seller had already taken the money and could not encode the receipt into the response header, leaving Express to return its default HTML error page. Agent A went 1.4123 to 1.3123 USD1 while Agent B went 0.1 to 0.2, paid and nothing delivered, which is a real `SETTLED_NO_GOODS` arriving unannounced. Receipts now carry `blockNumber` as a decimal string, and it cost 0.10 USD1 rather than a ruined recording because the paid path was run before the video rather than after.

**2026-09-08, the Agentic Wallet signed correctly and settlement still reverted.**

```
EIP3009: invalid signature
```

A valid signature over a well-formed authorization, rejected by the token, and recovering it against both EIP-3009 typehashes gave the answer:

```
ReceiveWithAuthorization    -> 0x95B0a13F...   garbage
TransferWithAuthorization   -> 0x54de1099...   the wallet
```

Two variants with two different digests, where `receiveWithAuthorization` had been chosen deliberately because binding `msg.sender` to the payee closes the front-run, while the Agentic Wallet signs the other one following x402 convention. Guessing wrong reverts with a message saying nothing about why. That bug produced the trade-off documented above, and it only surfaced because both signers were implemented.

## What comes next

Three things are designed for but not built, each blocked on something specific rather than on interest.

**USDT and USDC.** Neither implements EIP-3009 on BSC, verified on chain, so signature-based payment with them requires Permit2 and a prior on-chain approval from the buyer, which normally means the buyer holds gas and sends transactions, losing the cleanest property Till has. The path through it is that the **Binance Agentic Wallet sponsors the Permit2 approve on BSC**, dispatching it alongside the signature, so the no-gas property survives on that path. What remains is seller-side Permit2 settlement, which is genuinely different code from EIP-3009 and was not worth shipping untested. USD1 is far less widely held than USDT, and that is a real cost to adoption rather than a preference.

**Getting listed on the B402 Bazaar.** Till reads the catalog but does not appear in it, and the reason is narrow: listing happens automatically about 30 to 60 seconds after a merchant's first successful B402 V2 settle carrying a `extensions.bazaar` metadata blob, and that settle endpoint requires merchant `clientId` and `accessToken` from partner onboarding. Once those credentials exist, the `LiveB402` adapter plus the metadata blob is a short job, and the counter joins the directory it currently only searches. It would then be a counter that both shops in the market and has a stall in it.

**Defensive discovery as its own thing.** The scoring and verification in `src/buyer/bazaar.ts` is useful to anyone paying x402 endpoints, not only to Till, and `verify_endpoint` is already exposed over MCP for exactly that reason. Turning it into a standalone service that any agent can consult before paying a stranger is the natural extension, and the finding that six of six listings failed verification is the argument for why it should exist.

## Honest limits

x402 proves a transfer, but it does not prove the work was good and it cannot claw back.

- The seller settles **before** producing, because withholding the body until settlement is x402's native coupling, and if the acceptance predicate fails afterwards the tape shows `SETTLED_NO_GOODS` with the hash, stating plainly that payment happened and delivery did not. There is no fake accept button.
- **Till reads the Bazaar but is not listed in it**, for the reason above.
- **USD1 rather than USDT or USDC**, for the reason above.
- Both agents run under one operator, except the CoinMarketCap payment.
- The stance is deterministic and checkable, not alpha, and is not claimed as such, since the product is the counter and the stance is inventory.
- Skill selection runs on `claude-opus-5` when `ANTHROPIC_API_KEY` is set and on deterministic rules otherwise, with the tape naming which one ran every time.

## Run it

```bash
npm install
cp .env.example .env
npm start        # Agent B, the counter    :3000
npm run ui       # the tape                :4180
npm run mcp      # MCP server              :4190
```

Point the buyer at the deployed counter instead of a local one with `SELLER_URL=https://till-counter.fly.dev`.

### Free, none of these spend anything

```bash
npm run check                             # addresses and balances
npm run preview                           # the deliverable plus acceptance check
npm run rehearse                          # the refusal beat, no chain, no money
npm test                                  # five adversarial payments, all rejected
npm run bazaar -- "crypto market data"    # discovery, ranked defensively
npm run verify-one -- <url>               # what an endpoint really serves
npm run prove                             # sign and simulate a settlement
npm run which-typehash                    # which EIP-3009 variant is signed
```

`npm test` sends five malformed payments, namely a garbage header, an underpayment, a wrong payee, an expired authorization and a wrong asset, all of which are rejected with no balance movement.

### Spends real money

```bash
npm run demo                     # the full loop, about 0.10 USD1
npm run pay-external -- <url>    # pay a third-party x402 endpoint
npm run recycle                  # Agent B returns USD1 to Agent A
```

Every broadcast is simulated with `eth_call` first, so a malformed authorization costs nothing to discover.

## As an MCP server

```bash
claude mcp add till --transport http http://localhost:4190/mcp
```

| Tool | Does | Spends |
|---|---|---|
| `list_skills` | what is on the counter, with prices | no |
| `mandate_status` | limits, and what is left today | no |
| `buy` | plain language, decide, pay, deliver | **yes** |
| `discover` | Bazaar search, ranked defensively | no |
| `verify_endpoint` | what an x402 URL actually serves | no |
| `tape` | every step of every purchase | no |

The mandate is enforced inside `buy`, on Till's side of the boundary, so a client asking to overspend is refused there rather than trusted to police itself.

## The one non-obvious detail

USD1's `version()` returns `2` while its **EIP-712 domain version is `"1"`**, and signing with the wrong one reverts with nothing to indicate why. So Till never reads `name()` and `version()` to compare strings, and instead reconstructs `DOMAIN_SEPARATOR` from config at boot, requiring exact equality with what the token returns, which covers name, version, chainId and contract in one check and refuses to sign on mismatch.
