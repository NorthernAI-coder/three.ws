# Do I need crypto?

Short answer: it depends on what you want to do. Here's the honest breakdown.

---

## Viewing and chatting with agents

**No wallet or crypto needed.** Anyone can open an agent link (`three.ws/agent/<id>`) and chat with it. No account, no extension, no sign-in.

---

## Embedding agents on your site

**No wallet or crypto needed.** Copy the iframe snippet from [Widget Studio](/studio) and paste it into any page. The agent runs in your visitor's browser — no payment, no wallet extension required for them or for you to generate the snippet.

---

## Creating or editing agents

**Currently requires a wallet sign-in.** The hosted platform uses wallet-based authentication (EIP-4361 SIWE for EVM wallets like MetaMask, or Phantom for Solana). If you don't have a wallet extension, you'll hit a sign-in wall.

> A no-wallet sign-in path (email / passkey) is actively being built. Once live, you'll be able to create and publish agents with just an email address — no extension, no seed phrase.

In the meantime, the easiest path for non-crypto users:
1. Install [MetaMask](https://metamask.io) (free browser extension)
2. Create a new wallet — you don't need to fund it or buy anything for basic agent creation
3. Sign in to three.ws using that wallet

---

## Paying for things

Most basic features are free. You pay when you use premium capabilities:

| What | How | Roughly how much |
|---|---|---|
| Hosted AI brain (LLM calls) | Billed to your three.ws account in USDC | Fractions of a cent per message |
| Premium skills (skill purchases) | USDC micropayment via x402 | Set by the skill author |
| On-chain registration (ERC-8004) | Small gas fee on Base | A few cents in ETH |

**USDC** is a dollar-pegged stablecoin — 1 USDC ≈ $1 USD. It doesn't go up or down the way ETH or SOL does. When you see a price in USDC, you can treat it as dollars.

> USD price display (showing "≈ $0.01" next to USDC amounts) is being added across the platform so you never have to do mental-math from crypto to dollars.

---

## On-chain features — what they are and why they're optional

three.ws has a set of on-chain features that are entirely optional. They exist for users who want their agent to:

- **Outlive the platform** — register on Base via ERC-8004 and your agent's identity lives on a blockchain, not just on three.ws servers
- **Be verifiable** — anyone can check the agent's action history without trusting three.ws
- **Have a stable address** — `agent://base/42` works anywhere that speaks the protocol
- **Hold a wallet** — agents can receive and send USDC autonomously via x402

If you don't need any of that, you can ignore it entirely. A basic agent — avatar, voice, embedded chat — works without touching any blockchain.

---

## The only coin on this platform

When you do interact with on-chain features, the platform's native token is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). This is the only coin three.ws uses. USDC (the payment currency) is a separate, dollar-pegged stablecoin — not a platform token.

---

## Summary

| Task | Wallet needed? | Crypto needed? |
|---|---|---|
| View / chat with an agent | No | No |
| Embed a widget on your site | No | No |
| Create an account and build agents | Currently yes | No (wallet, not funded) |
| Use a premium skill | Yes + small USDC balance | Yes (USDC ≈ $) |
| Register on-chain (optional) | Yes + gas | Yes (small ETH) |

---

## What's next

- **Create your first agent** → [Make your first agent](./make-your-agent.md)
- **Put it on your site** → [Share & embed](./share-and-embed.md)
- **Optional: register on-chain** → [Register on-chain](./tutorials/register-onchain.md)
- **Technical auth details** → [Authentication](./authentication.md)
