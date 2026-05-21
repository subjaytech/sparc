# SPARC — Competitive Onchain Puzzle Game on Arc

**Live App:** https://sparc-onchain.vercel.app  
**Contract (Permanent):** `0xD39EA4F975c67fA8120eFdD1895C28C360076FfF`  
**Explorer:** https://testnet.arcscan.app/address/0xD39EA4F975c67fA8120eFdD1895C28C360076FfF  
**Network:** Arc Testnet  

---

## What is SPARC?

SPARC is a competitive onchain puzzle game built natively on Arc Network. Players pay a USDC entry fee to compete in a 6-hour session where they race to reconstruct a scrambled image as fast as possible. The three fastest verified solvers automatically receive USDC prizes — distributed onchain with zero human involvement.

Every session runs on a fixed schedule: four 6-hour rounds per day at 00:00, 06:00, 12:00, and 18:00 UTC. All prize logic is enforced by smart contract. No custodian. No manual payouts.

---

## Why Arc?

SPARC is designed specifically around Arc's architecture:

- **USDC as the native currency** — entry fees and prizes are entirely in USDC. Players never touch a volatile gas token
- **Sub-second finality** — puzzle completions confirm instantly on Arc
- **Circle-native USDC** — direct integration with the Circle ecosystem makes SPARC a real production use case for programmable stablecoin payments
- **EVM compatibility** — familiar development environment with Arc-specific advantages

---

## How It Works
Player connects wallet to Arc Testnet
↓
Selects a prize pool tier and pays USDC entry fee
↓
Backend generates a server-controlled unique puzzle arrangement
↓
Player reconstructs the scrambled image tiles
↓
Backend cryptographically verifies the solution
↓
Backend issues a signed proof of completion
↓
Player submits signed proof onchain — recorded on Arc
↓
Session ends → top 3 fastest receive USDC automatically
---

## Prize Pool Tiers

| Pool | Entry Fee | Players Compete With |
|------|-----------|----------------------|
| Starter | $0.50 USDC | Other Starter players only |
| Bronze | $5 USDC | Other Bronze players only |
| Silver | $50 USDC | Other Silver players only |
| Gold | $500 USDC | Other Gold players only |
| Diamond | $5,000 USDC | Other Diamond players only |

Each pool is completely independent. Players in different tiers never compete against each other.

**Prize split:**
- 🥇 1st place — 50% of pool
- 🥈 2nd place — 30% of pool  
- 🥉 3rd place — 19.7% of pool
- Platform fee — 0.3%

| Finishers | Distribution |
|-----------|--------------|
| 3 | 50 / 30 / 19.7% |
| 2 | 65 / 34.7% |
| 1 | 99.7% to sole winner |
| 0 | Full refunds claimable by all entrants |

---

## Security Architecture

### Smart Contract

- **UUPS Upgradeable Proxy** — permanent address, upgradeable logic
- **Cryptographic completion verification** — every submission requires a time-limited ECDSA signature from the trusted backend. Direct contract calls without playing are rejected
- **Signature replay prevention** — every signature is single-use, tracked by hash onchain
- **ECDSA malleability protection** — low-s value enforcement on all signatures
- **Reentrancy guard** — all fund-moving functions protected
- **Pull payment pattern** — winners withdraw their own prizes. A single blacklisted address cannot block other winners from receiving funds
- **Locked funds accounting** — `emergencyWithdraw` mathematically cannot touch active pool pots, pending refunds, or unclaimed prize balances
- **Round ID system** — join and completion state resets per round, preventing cross-session replay
- **Two-step ownership transfer** — prevents permanent lockout
- **Global pause** — owner can halt all player actions instantly
- **Bounded admin parameters** — platform fee hard-capped at 5%, round duration locked between 1–24 hours

### Backend

- **Server-controlled puzzle seed** — the backend generates the puzzle arrangement, not the player. The player cannot predict or precompute the solution
- **Session tokens** — HMAC-signed tokens bind a session to a specific player, pool, and round. Tokens from one player cannot be used by another
- **Minimum solving time enforcement** — submissions faster than a human can physically solve are automatically rejected
- **Tile state verification** — the backend independently verifies all tiles are in correct solved position before signing
- **Round state cross-check** — backend confirms the round is still active onchain before issuing any signature

### Transparency

- All prize distributions happen onchain and are publicly verifiable on the Arc explorer
- All completion submissions are recorded onchain with timestamps
- The full source code is open source on GitHub
- The trusted signer wallet address is publicly documented

---

## Known Trust Assumptions

SPARC is transparent about its centralization points:

1. **Trusted signer** — the backend must issue a signature for completion. The operator could theoretically refuse to sign for a specific player. This is mitigated by open-source backend code and a publicly known signer address
2. **Upgradeable contract** — the owner can upgrade contract logic. Player funds are protected by locked-fund accounting even across upgrades. A timelock will be added before mainnet
3. **Round management** — the operator starts and finalizes rounds via a Vercel cron job running at fixed UTC times

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Blockchain | Arc Network — EVM, Testnet |
| Smart Contract | Solidity 0.8.20 — UUPS Proxy |
| Contract Tooling | Hardhat + OpenZeppelin Upgradeable v4 |
| Frontend | React + Vite + Tailwind CSS |
| Backend | Vercel Serverless Functions (Node.js) |
| Wallet Integration | MetaMask via ethers.js v6 |
| Deployment | Vercel |
| Round Automation | Vercel Cron Jobs |

---

## How to Play

1. Install [MetaMask](https://metamask.io)
2. Visit **https://sparc-onchain.vercel.app**
3. Connect your wallet — Arc Testnet is added automatically
4. Get free testnet USDC at **https://faucet.circle.com** — select Arc Testnet
5. Choose a pool tier and click **Enter Pool & Play**
6. Reconstruct the scrambled image as fast as possible
7. Your completion is verified and recorded onchain
8. Prize payouts are distributed automatically at session end

---

## Project Structure
sparc/
├── contracts/
│   └── SPARC.sol                 # Game contract — UUPS upgradeable proxy
├── scripts/
│   ├── deploy.js                 # Initial proxy deployment
│   ├── upgrade.js                # Future logic upgrades
│   ├── startAllRounds.js         # Start all pool rounds
│   ├── autoRound.js              # Finalize expired + start new rounds
│   └── updateSigner.js           # Update trusted signer address
├── api/
│   ├── start-session.js          # Issues puzzle session to verified player
│   ├── sign-completion.js        # Verifies solution + issues completion proof
│   └── cron/
│       └── auto-round.js         # Automated round management — runs every 6h
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Header.jsx
│       │   ├── PoolSelector.jsx
│       │   └── PuzzleGame.jsx
│       └── utils/
│           └── contract.js
└── vercel.json

---

## Builder

**Subair Abduljalal Oluwatobi**  
Final year Computer Science student — Kwara State University, Nigeria  
GitHub: [@subjaytech](https://github.com/subjaytech)  
X: [@subjaytech](https://x.com/subjaytech)

*Building production-grade financial infrastructure onchain because real-world value transfer belongs on Arc.*