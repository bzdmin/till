# Till - handoff

Written 2026-09-06. Read this before changing anything. It records what Till
is, the decisions that produced it, and the reasons - so they do not get
silently reverted by someone who only sees the code.

---

## 1. The contest

**Binance Agent OS Mini Hackathon**, Track A. Submissions close
**2026-09-08 23:59 UTC**. Submit the morning of the 8th, not at 23:59.

```
Track A - $20,000 USDC          Track B - $40,000 USDC
  1st        $2,000               first 10,000 eligible
  2nd        $1,500               users: $4 each
  3rd        $1,000
  4th-53rd   $300 each
```

Track B is not a build track - it is a faucet for doing three trades through
the MCP. Ignore it.

Track A's four categories: Data & Analysis, Trading Workflows, **Payment
Workflows (Agent-to-Agent, Automated Payments)**, Onchain Workflows. We are in
Payment Workflows, deliberately: it is the least crowded and the one Binance
built Agent OS to sell.

Submission requires: demo/video + public GitHub repo + a survey.
Excluded regions: US, UK, EEA, Hong Kong, Singapore. (Operator is eligible.)

**The prize structure drives the strategy.** 4th place and 53rd place both pay
$300. There is no reward for being merely good, so there are exactly two
targets - clear the qualification bar with certainty, or take the category and
the demo. The same build does both; extra engineering does not separate them.

---

## 2. What Till is

> A payment counter for agent skills on Binance x402.

One buyer agent needs a small digital service. One seller agent provides it.
The buyer pays with an x402/B402 handshake. The seller returns the work. A tape
records the whole transaction.

**The product is the counter. The BTC stance is the first item on it.**

```
Owner mandate (cap, allowlist)
      |
      v
Agent A --GET--> /skills/brief  (Agent B)
      |<-- 402 + payment requirements
      |
      +- mandate check: amount / payee / remaining cap
      |     ALLOW -> sign EIP-3009 authorization
      |     BLOCK -> stop, tape row REFUSED
      |
      +- retry with X-PAYMENT
      |         |
      |         +- settle (facilitator broadcasts)
      |         +- run skill
      |         +- acceptance predicate
      |<-- 200 + work + tx hash
      v
Tape: intent -> 402 -> receipt(adapter + hash) -> deliverable -> refusal
```

The 45-second demo:

1. "I need a BTC stance."
2. "0.10 USD1."
3. Approved - under cap.
4. Paid - BSC hash, A to B.
5. Delivered - signed stance, not raw candles.
6. Next request is the $5 deep-dive → **REFUSED**, cap unchanged.

Six beats, two agents, one refusal. Nothing else earns a slot on screen.
**The hero transaction is A paying B.** That defines the product.

---

## 3. Problems hit, and how each was solved

### 3.1 Every binance.com host was unresolvable

`api.binance.com`, `agent.binance.com`, `developers.binance.com` all returned
DNS failures while google.com and github.com resolved fine - resolver-level
blocking, not an outage. **Fixed by the operator changing DNS.** If a future
session sees `000` status codes against Binance hosts, this is the cause, not
a code bug.

### 3.2 The MCP server cannot pay anyone

The obvious first instinct - call a payment tool over the Binance MCP server -
does not work, and no amount of probing will make it work. From the docs:

> Transfers move funds between wallets inside the same Agentic sub-account
> only. There is **no withdrawal scope**. Your agent can never move funds out
> of the sub-account to an external address.

MCP is market data and trading. **Payment lives in x402/B402.** Do not spend
time looking for an MCP transfer tool, and do not plan on the agentic
sub-account sending USD1 out.

### 3.3 Being a B402 merchant is gated behind an application

`/papi/v2/b402/verify` and `/papi/v2/b402/settle` require merchant
`clientId` + `accessToken`, obtained through partner onboarding - an
application form with unknown turnaround. B402 Bazaar listing is free and
indexes ~30-60s after your first settle, but *only once you can settle*, so
the Bazaar advantage is gated too.

This threatened the whole product: without credentials the seller could not
settle, and the fallback was a local mock that moves no money.

### 3.4 The fix - Till is its own facilitator

**This is the key insight of the project.**

x402 never required Binance to submit the transaction. The buyer signs an
EIP-3009 authorization; *that signature is the payment*. Whoever broadcasts it
is the facilitator, and a facilitator cannot alter the amount or the payee -
that is the protocol's security model. B402's additions are gas sponsorship
and Bazaar indexing. **Neither of those is settlement.**

So Till broadcasts the buyer's signed authorization itself. Real transfer, real
hash, real BNB Chain, no merchant credentials, no application form.

Three adapters:

| adapter | settles | gas | needs credentials |
|---|---|---|---|
| `SelfBroadcast` | we submit the signed auth | seller pays ~$0.003/tx | **no** - the default |
| `LiveB402` | Binance submits it | sponsored | yes - **not implemented**; design only |
| `Mock` | nothing | - | **not implemented**; never needed once SelfBroadcast worked |

### 3.5 Token choice - USDT and USDC would have forced Permit2

Signature-based transfer needs either Permit2 (a separate contract requiring a
prior on-chain approval from the buyer, which means the buyer needs gas) or
EIP-3009 (built into the token, no approval, no buyer gas).

Checked by resolving each token's EIP-1967 proxy implementation slot and
searching the implementation bytecode:

```
USD1  impl 0x694aa534bdef8ed63244eb902e7914e527891f08  transferWithAuthorization YES
                                                       receiveWithAuthorization  YES
                                                       cancelAuthorization       YES
U     impl 0xbef21313c69c009fd7d9510a8d3a481a32473dfc  transferWithAuthorization YES
                                                       receiveWithAuthorization  YES
USDC  impl 0xba5fe23f8a3a24bed3236f05f2fcf35fd0bf0b5c  transferWithAuthorization no
```

**USD1 is the asset.** `U` (United Stables) is a verified drop-in fallback -
same EIP-3009 surface, same 18 decimals, domain version `"1"` - if USD1 is hard
to acquire. One constant changes.

Note: checking the *proxy* bytecode returns false negatives. Resolve the
implementation first.

Do not use USDT or USDC for the hero row.

### 3.6 The `version()` trap

USD1's `version()` returns `2`. Its EIP-712 domain version is `"1"`. Signing
with `"2"` produces a signature that reverts.

**Do not read `name()`/`version()` and compare strings.** Reconstruct
`DOMAIN_SEPARATOR` from config and compare it to what the token returns - one
equality that covers name, version, chainId and verifyingContract at once, and
cannot be fooled by a `version()` that means something else. That guard is
`assertDomainMatches()` in `src/chain/token.ts` and it refuses to sign on
mismatch. Confirmed: both USD1 and U reproduce their on-chain separator with
version `"1"`, matching what a live CoinMarketCap 402 declared.

### 3.7 Front-running signed authorizations

An EIP-3009 `transferWithAuthorization` is caller-unbound: any observer holding
the signed payload can submit it first. That is Attack I-B in *Five Attacks on
x402 Agentic Payment Protocol* (arXiv 2605.11781).

**Till uses `receiveWithAuthorization`**, which requires `msg.sender == to`.
Only the seller can submit it. The front-run is closed by construction, and it
also means the seller collects its own payment - which fits the two-agent frame
better than a third relayer process. Agent A therefore never sends a
transaction and never needs BNB.

Corollary: a signed authorization is a bearer credential. Do not log one before
its transaction is included.

### 3.8 Very tight funds

Operator funded **1.51 USD1** and **0.0013 BNB**. That is enough:

- The money circulates between two wallets we own (A pays B, B sends it back).
  USD1 is a float, not a budget. Only gas is truly consumed.
- BSC gas is 0.05 gwei; `receiveWithAuthorization` is ~80-120k gas, about
  0.000005 BNB, about $0.003. 0.0013 BNB is roughly **215 settlements**.
- **Simulate before every broadcast.** `eth_call` costs nothing and surfaces
  every failure mode - wrong domain, bad signature, wrong decimals, expired
  window. `SelfBroadcast.settle()` calls `simulate()` first, always. Never
  broadcast a transaction you have not already watched succeed.

**Funding note:** Binance withdrawal minimums (USD1 on BSC is often 5-10, BNB
often ~0.01) can exceed what Till needs. If so, withdraw the minimum, forward
what Till needs, send the rest back. Confirm **BSC / BEP20** and the USD1
contract address on the withdraw screen.

### 3.9 "Why would Agent A pay for public klines?"

A fair question with a bad answer ("because it's the demo"). The stance is
built from public Binance klines that the buyer could fetch itself.

**Resolution: charge for Agent B's stance, not the candles.** The deliverable
carries a call (`wait` / `reduce` / `hold-the-range`) plus two reasons derived
from the structure, and is **signed by B**. The data is free evidence; the
signed view is the good. A can fetch candles; A cannot produce B's signed view.

The stance stays **deterministic** - computed by a fixed rule from the candles -
because the acceptance predicate has to be able to check it, and because a
model call can time out mid-demo.

---

## 4. Decisions made, with reasons - do not silently revert

**Track A, Payment Workflows.** Track B is a faucet. Data & Analysis is where
half the field will be and is worth $300 at best.

**Till, not "Due".** Due was a buyer-only agent that discovers services on B402
Bazaar and pays real merchants (CoinMarketCap, Nansen). It works - a live 402
and a real settlement are both reachable with zero credentials. It was rejected
because paying CoinMarketCap is agent-to-**merchant**, and the category card
says Agent-to-**Agent**. The hero transaction defines the product: if the hash
in the video is CMC's, you submitted a payment demo, not an agent-commerce
demo. Do not reintroduce a Bazaar purchase into the hero tape. It may appear in
the README as corroboration, off screen.

**No custom escrow marketplace.** The original idea was a registry + hire +
escrow + accept + release market. Rejected: that is a baby copy of Virtuals
ACP, and ACP is a job protocol for async work worth tens of dollars. A stance
generated inside the request is a synchronous HTTP resource, and x402's
withhold-until-settle *is* the escrow. A job state machine here would be cargo
cult. (Reference point: ACP has ~3.2M jobs and ~$4.3M settled and still has a
17% unfilled rate - the fulfillment gap is not something a weekend jobs table
solves.)

**No registry, catalog, or marketplace UI.** Advertising *is* the 402 on
`GET /skills/brief`. If it needs a line in the UI, it is the price on the
counter, not a marketplace row.

**No Bazaar Sybil-scoring engine.** Attack IV in the same paper is real
(metadata manipulation reaches 71.8% selection; five Sybils reach 60.2%
capture), and a defensively-shopping buyer is a genuinely good product. It is
a *second* product. One SKU, one counter. It belongs in the README as future
work, not on screen.

**Mandate gate is a beat, not the thesis.** A policy layer as the whole product
is already occupied - Mandate402 won an x402 track and someone has already
submitted Mandate to this hackathon. Till's mandate check earns its place
because money moves first and then is refused; it is not a rules engine with a
chat UI.

**Local viem signer is primary.** Binance Agentic Wallet (`baw x402-payment
preview/sign`) is an upgrade only if it turns out it can pay an **external**
`payTo`. MCP has no withdrawal scope, so do not build assuming it can.

**`SETTLED_NO_GOODS` stays.** If the acceptance predicate fails after
settlement, the tape shows that row. x402 cannot claw back; the honest move is
to surface that, not to hide it behind a fake accept button. Do **not** stage
this failure in the video.

---

## 5. Claim language

- **Can say:** Till runs the x402 handshake and settles EIP-3009 on BNB Chain.
  B402 is one facilitator; SelfBroadcast is the other.
- **Cannot say**, unless `LiveB402` actually ran: "we settled through B402."
- A mock facilitator only proves protocol shape. `SelfBroadcast` proves money
  moved to Agent B. The tape labels which adapter ran on the receipt row.

---

## 6. Verified facts

Every line below was checked against chain or a live endpoint, not assumed.

| fact | evidence |
|---|---|
| x402 402-handshake is live and real | live `402 Payment Required` + `payment-required` header from `pro-api.coinmarketcap.com/x402/v3/...`, no credentials |
| B402 Bazaar is live, public, no auth | `GET binance.com/bapi/ramp/v1/public/ramp/b402/bazaar/resources` returns Nansen, CoinMarketCap, Cournot |
| USD1 supports EIP-3009 | implementation bytecode contains `e3ee160e`, `ef55bec6`, `5a049a70` |
| USD1 domain version is `"1"` not `"2"` | reconstructed separator equals on-chain `0x5d939dc1...ed4ba` |
| BSC gas 0.05 gwei | `eth_gasPrice` |
| our signature is accepted by the token | `eth_call` of `receiveWithAuthorization` does not revert |
| **Till settles for real on BNB Chain** | tx `0xf1d4bf8ea3688ffe5e6ae66a5bb691c5909a598dcd229db4c4aa9370460b2635`, block 120285108 - 0.1 USD1 moved A to B via `SelfBroadcast`, no merchant credentials |

Wallets are burners, keys in gitignored `.env`. Never use the Digest /
Virtuals wallet `0x5043...2bc7` here.

```
Agent A  buyer   0x32D95897DAE4CAB11D04B1970DCd8a73A772dA0F   signs only, 0 BNB
Agent B  seller  0x8cBf326Ff4124515708068402636FD33638FF994   broadcasts, pays gas
USD1 token       0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d   BSC, 18 decimals
                 0.10 USD1 = 100000000000000000
```

Agent A holding zero BNB is correct and worth saying in the video: the buyer
never sends a transaction.

---

## 7. Demo economics

Chosen so every number on screen is a real balance.

```
Agent A balance     ~1.41 USD1   (after the proof settle)
Daily mandate cap    1.00 USD1
brief            0.10 USD1   -> approved, settles
deep-dive            5.00 USD1   -> REFUSED (over cap, and over balance)
```

The refusal is true twice over. Nothing is staged.

---

## 8. On disk - there is working code here

**Do not treat `C:\Users\Lenovo\till\` as empty.**

```
src/config.ts                    env + key loading, rejects malformed keys
src/chain/client.ts              viem public + wallet clients for BSC
src/chain/token.ts               ABI, balanceOf, assertDomainMatches() guard
src/chain/authorization.ts       build + sign ReceiveWithAuthorization
src/settlement/provider.ts       SettlementAdapter interface
src/settlement/selfBroadcast.ts  simulate-then-broadcast facilitator (proven)
src/skill/klines.ts              public Binance klines, no auth
src/skill/stance.ts              deterministic call + reasons, signed by B
src/seller/challenge.ts          402 build/parse, payment validation
src/seller/acceptance.ts         acceptance predicate -> SETTLED_NO_GOODS
src/seller/server.ts             the counter: GET /skills/:name
scripts/check-wallets.ts         npm run check
scripts/prove-settlement.ts      the settlement experiment; --broadcast to send
scripts/preview-skill.ts         run the skill with no payment, free
```

`.env` holds both burner keys and is gitignored. `.env.example` is the safe
copy. Ignore `C:\Users\Lenovo\stipend\` - an earlier job-shaped prototype,
superseded.

**Verified working:** domain guard, signing, simulate, broadcast, the 402
challenge, the skill, the acceptance predicate.
**Written but not yet exercised end to end:** the paid path through the seller
(decode → validate → settle → deliver), because it needs the buyer.

## 9. Still to build

1. Buyer agent loop: request → 402 → mandate check → sign → retry → receive.
2. Mandate: daily cap, payee allowlist, checked **before** signing.
3. Tape UI binding intent → 402 → receipt (adapter + hash) → deliverable →
   refusal.
4. Recycle script: B returns USD1 to A between takes.
5. Video, README, survey - all to "could submit right now" by Sunday evening,
   **before** any further polish.

## 10. Rules for whoever works on this next

- Do not put a CoinMarketCap purchase in the hero demo.
- Do not add a registry, catalog, or marketplace listing UI.
- Do not add a job state machine, escrow contract, or dispute flow.
- Do not claim B402 settlement unless `LiveB402` actually ran.
- Do not broadcast anything that has not passed `simulate()` first.
- Do not log a signed authorization before its transaction is included.
- Do not commit `.env`. It is gitignored; keep it that way.
- The submission mechanics come before the polish. People lose $300 by having
  a great demo and an unsubmitted form.
