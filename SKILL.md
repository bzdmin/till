---
name: till
description: |
  Use when the user mentions buying from an agent, paying an agent, agent-to-agent payment,
  x402, HTTP 402 Payment Required, B402, paying for an API call, pay-per-request,
  a paid skill or paid endpoint, a spend cap or mandate for an agent's purchases,
  discovering paid services, the B402 Bazaar, checking whether an x402 endpoint is
  trustworthy before paying it, a signed market stance or BTC stance,
  or any question about what an agent spent and on what.
metadata:
  author: till
  version: '0.1.0'
  homepage: 'https://github.com/bzdmin/till'
  openclaw:
    requires:
      bins:
        - node
    install:
      - kind: node
        package: 'till'
        label: Clone github.com/bzdmin/till and run npm install
---

# Till Skill

Till is a **payment counter for agent skills**. One agent sells something small over
HTTP; another buys it, pays inside the same request, and gets the work back. Payment
settles EIP-3009 on BNB Chain.

Two halves, usable independently:

- **The counter (seller)** - publishes a paid skill, returns HTTP 402 with its price,
  withholds the goods until settlement confirms.
- **The buyer** - reads a 402, checks the owner's mandate, signs, replays, and records
  everything on a tape.

## Connect as an MCP server

```bash
claude mcp add till --transport http http://localhost:4190/mcp
```

| Tool | Does | Spends money |
|---|---|---|
| `list_skills` | what is on the counter, with prices | no |
| `mandate_status` | spending limits and what is left today | no |
| `buy` | plain-language request → decide → pay → deliver | **yes** |
| `discover` | search the B402 Bazaar, ranked defensively | no |
| `verify_endpoint` | check what an x402 URL actually serves | no |
| `tape` | every step of every purchase, in order | no |

## Command routing

| User intent | Command |
|---|---|
| Start the counter (seller) | `npm start` |
| Start the tape UI | `npm run ui` |
| Start the MCP server | `npm run mcp` |
| Buy something / run the full loop | `npm run demo` |
| Rehearse the refusal with no money | `npm run rehearse` |
| What is on the counter, what does it cost | `npm start` then `GET /` |
| Preview a deliverable without paying | `npm run preview` / `npm run preview:deep` |
| Find other paid endpoints | `npm run bazaar -- "<what you need>"` |
| Is this endpoint safe to pay | `npm run verify-one -- <url>` |
| Pay a third-party x402 endpoint | `npm run pay-external -- <url>` |
| Check wallet balances | `npm run check` |
| Move funds back for another take | `npm run recycle` |
| Prove settlement works, without paying | `npm run prove` |
| Attack the counter with bad payments | `npm test` |
| Which EIP-3009 variant is being signed | `npm run which-typehash` |

## Configuration

`.env` needs one of two signing paths:

- `SIGNER=local` - a burner key in `BUYER_PRIVATE_KEY`. Signs
  `ReceiveWithAuthorization`, which binds `msg.sender` to the payee and closes the
  front-run.
- `SIGNER=agentic` - the Binance Agentic Wallet via the `baw` CLI. Till holds no
  private key. Signs `TransferWithAuthorization`, the x402 convention, which is
  caller-unbound.

You cannot have both properties today. The seller detects which variant was signed and
settles with the matching contract function.

## Guardrails

Enforced by the agent, not by whoever is prompting it:

**Before signing** - payee is on the allowlist · amount is within the per-call maximum ·
amount is within the remaining daily cap · the EIP-712 domain reconstructs to the token's
on-chain `DOMAIN_SEPARATOR` · the endpoint actually serves x402 v2 with the expected asset.

**Before settling** - the signature recovers to the stated payer · the amount equals the
advertised price · the payee equals the advertised `payTo` · asset and network match ·
the authorization has not expired · the transaction simulates successfully.

**After settling** - the deliverable passes an acceptance predicate. If it fails, the tape
records `SETTLED_NO_GOODS` with the hash. x402 cannot claw back, and Till does not pretend
otherwise.

## Guidance

1. **`buy` spends real money.** Confirm with the user before calling it, unless they have
   asked to skip confirmation.
2. **Never bypass the mandate.** If a purchase is refused, report the refusal - do not
   look for another route to the same spend.
3. **Verify before paying anything outside the counter.** A B402 Bazaar listing records a
   past settlement, not a live contract; it can be stale or simply wrong. Run
   `verify_endpoint` first.
4. **Do not claim B402 settled a payment unless it did.** The tape labels which facilitator
   ran on every receipt.

## Limitations

- BNB Chain only, USD1 (or United Stables) only.
- x402 v2 only.
- The `SIGNER=agentic` path requires `baw auth signin`, which needs a QR scan from the
  Binance Wallet app.
