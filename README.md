# Hyperliquid Copy Trading Bot — Perpetual DEX Trading Bot for Hyperliquid Perps

**English** · [Русский](README.ru.md) · [中文](README.zh.md)

https://github.com/user-attachments/assets/d30201f1-546b-4a11-ae88-5a87a6b2a316

> **The most complete open-source Hyperliquid copy trading bot built with TypeScript & Node.js.**
> Mirror any trader's perpetual futures positions on Hyperliquid in real-time via WebSocket.

---

## What Is This? (Hyperliquid Copy Trading Bot)

This is a **Hyperliquid copy trading bot** — a fully automated perp trading bot that watches a target trader's wallet on the Hyperliquid perpetual DEX and instantly mirrors every trade into your own account.

Whether you're looking for a **Hyperliquid perp trading bot**, a **perpetual DEX copy trading bot**, or a **crypto copy trading bot** for on-chain futures — this project covers it all.

Built on the official [`@nktkas/hyperliquid`](https://www.npmjs.com/package/@nktkas/hyperliquid) TypeScript SDK, this **Hyperliquid trading bot** connects via WebSocket for near-zero-latency trade replication on the Hyperliquid perp DEX.

---

## Why Use This Hyperliquid Copy Trading Bot?

- **Real-time perp copy trading** — WebSocket `userFills` subscription fires within milliseconds of the target's fill
- **Accurate proportional close logic** — if the target closes 40% of their perpetual position, the bot closes exactly 40% of yours
- **Leverage sync** — the perp trading bot matches (and caps) the target trader's leverage before opening any position
- **Periodic reconciliation** — the Hyperliquid bot compares your positions against the target every N seconds and auto-closes any that drifted
- **Full risk management** — max position size, max total exposure, max leverage, and daily loss circuit breaker
- **Market IOC orders** — uses aggressive IOC (Immediate-Or-Cancel) orders with slippage tolerance so every copy trade fills instantly
- **Graceful shutdown** — optionally closes all copied perpetual positions on Ctrl+C
- **Structured logging** — console + rotating file logs via Winston

---

## Keywords: What This Bot Covers

This **Hyperliquid copy trading bot** targets traders interested in any of the following:

- Hyperliquid copy trading bot
- Hyperliquid perp trading bot
- Hyperliquid perpetual DEX trading bot
- Perpetual DEX copy trading bot
- Perp trading bot open source
- Crypto copy trading bot TypeScript
- On-chain copy trading bot
- Hyperliquid automated trading bot
- Hyperliquid mirror trading bot
- Hyperliquid follow trader bot
- DEX perp bot Node.js
- Hyperliquid bot TypeScript

---

## Project Structure

```
hyperliquid-copy-trading-bot/
├── src/
│   ├── index.ts              # Entry point — startup & graceful shutdown
│   ├── bot.ts                # CopyTradingBot — main orchestration
│   ├── config.ts             # .env loading & validation
│   ├── types.ts              # TypeScript interfaces & types
│   ├── services/
│   │   ├── hlClient.ts        # Hyperliquid SDK wrapper (Info + Exchange + Subscription)
│   │   ├── riskManager.ts     # Risk checks, daily loss tracking
│   │   ├── kellySizer.ts       # Kelly-criterion position sizing (@zscdao/kelly)
│   │   ├── orderExecutor.ts   # Order placement with retry logic
│   │   ├── fillProcessor.ts   # Target fills → copied orders (open/close/leverage)
│   │   ├── reconciler.ts      # Periodic position re-sync safety net
│   │   ├── stopLossMonitor.ts # Per-position stop-loss enforcement
│   │   ├── positionRegistry.ts# Set of coins the bot actively manages
│   │   └── statsTracker.ts    # Lifetime run counters
│   └── utils/
│       ├── logger.ts         # Winston logger (console + file)
│       ├── math.ts           # Price/size formatting helpers
│       ├── keyedQueue.ts     # Per-coin serial task queue (concurrency safety)
│       └── sleep.ts          # sleep() + withRetry() utilities
├── logs/                     # Auto-created log files
├── .env.example              # Config template
├── package.json
├── tsconfig.json
└── README.md
```

---

## Quick Start — Run the Hyperliquid Copy Trading Bot

### Prerequisites

- **Node.js 18+**
- A **Hyperliquid** account with USDC deposited on mainnet (or testnet)
- A dedicated **API wallet** — a sub-wallet that can trade but cannot withdraw funds (strongly recommended for any Hyperliquid trading bot)

### 1. Clone and Install

```bash
npm install
```

### 2. Configure the Perp Trading Bot

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# ── Required ───────────────────────────────────────────────────
# Private key of your dedicated trading wallet
PRIVATE_KEY=0xYourTradingWalletPrivateKey

# The wallet address whose perp trades you want to copy
TARGET_TRADER=0xTargetTraderAddressHere

# ── Sizing ──────────────────────────────────────────────────────
SIZE_MULTIPLIER=1.0          # 1.0 = same size as target
MAX_POSITION_SIZE_USD=1000   # max notional per position
MAX_TOTAL_EXPOSURE_USD=5000  # max sum of all open notional
MAX_LEVERAGE=10              # never exceed 10x

# ── Kelly sizing (optional) ─────────────────────────────────────
KELLY_ENABLED=false          # cap copies at the fractional-Kelly stake
KELLY_FRACTION=0.5           # half-Kelly (recommended)
KELLY_MAX_FRACTION=0.2       # never stake >20% of equity per copy
KELLY_WINDOW=50              # rolling window of target trades
KELLY_MIN_SAMPLES=10         # closes needed before Kelly engages

# ── Risk ────────────────────────────────────────────────────────
MAX_DAILY_LOSS_USD=500       # pause the perp bot if daily loss hits $500

# ── Network ─────────────────────────────────────────────────────
NETWORK=testnet              # always test on testnet first!
```

### 3. Run the Hyperliquid Perp Bot

**Development mode (auto-reloads on file changes):**
```bash
npm run dev
```

**Production (compile then run):**
```bash
npm run build
npm start
```

---

## Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `PRIVATE_KEY` | **required** | Private key of your Hyperliquid trading wallet (0x...) |
| `TARGET_TRADER` | **required** | Wallet address to copy-trade on the perp DEX |
| `SIZE_MULTIPLIER` | `1.0` | Multiply the target's trade size by this factor |
| `MAX_POSITION_SIZE_USD` | `1000` | Max notional (USD) per single copied position |
| `MAX_TOTAL_EXPOSURE_USD` | `5000` | Max total open notional across all perp positions |
| `MAX_LEVERAGE` | `10` | Leverage ceiling — the copy trading bot never exceeds this |
| `KELLY_ENABLED` | `false` | Enable Kelly-criterion sizing (caps each copy at the fractional-Kelly stake) |
| `KELLY_FRACTION` | `0.5` | Fractional-Kelly multiplier in (0, 1]. `0.5` = half-Kelly (recommended) |
| `KELLY_MAX_FRACTION` | `0.2` | Hard cap on the equity fraction staked per copy, in (0, 1] |
| `KELLY_WINDOW` | `50` | Rolling window of the target's recent trades used to estimate edge |
| `KELLY_MIN_SAMPLES` | `10` | Minimum target closes before Kelly engages (else it uses the mirror) |
| `STOP_LOSS_PERCENT` | `0` | Auto stop-loss % from entry price (0 = disabled) |
| `STOP_LOSS_CHECK_INTERVAL_MS` | `5000` | How often (ms) to check managed positions for stop-loss breach |
| `MAX_DAILY_LOSS_USD` | `0` | Pause the bot if daily realized loss exceeds this (0 = disabled) |
| `COPY_EXISTING_POSITIONS` | `false` | On start, also copy the target's currently open perp positions |
| `CLOSE_ON_EXIT` | `false` | Close all copied perp positions when the bot shuts down |
| `RECONCILE_INTERVAL_MS` | `60000` | How often (ms) to run position reconciliation |
| `SLIPPAGE_BPS` | `50` | IOC order slippage in basis points (50 = 0.5%) |
| `NETWORK` | `mainnet` | `mainnet` or `testnet` |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `LOG_TO_FILE` | `true` | Write logs to `./logs/` |

---

## How the Hyperliquid Copy Trading Bot Works

### Step 1 — WebSocket Fill Subscription

The **Hyperliquid copy trading bot** subscribes to the `userFills` WebSocket channel for the target trader's address.
Every time the target gets a trade fill on the Hyperliquid perp DEX, the bot receives an event containing:

| Field | Meaning |
|---|---|
| `coin` | Perpetual market (e.g., `"BTC"`, `"ETH"`, `"SOL"`) |
| `dir` | `"Open Long"` / `"Close Long"` / `"Open Short"` / `"Close Short"` |
| `sz` | Size of the fill |
| `px` | Fill price |
| `startPosition` | The target's position size **before** this fill |
| `side` | `"B"` = buy/long, `"A"` = ask/sell/short |

### Step 2 — Copy Size Calculation

**Opening a perp position** (`dir` contains `"Open"`):
```
copySize = fill.sz × SIZE_MULTIPLIER
copySize = min(copySize, kellyStake / currentMidPrice)   ← only when KELLY_ENABLED
copySize = min(copySize, MAX_POSITION_SIZE_USD / currentMidPrice)
```

When `KELLY_ENABLED=true`, the bot sizes with the **Kelly criterion** via the
[`kelly-stake`](https://www.npmjs.com/package/kelly-stake) module. It watches the target trader's realised
close PnL, estimates their edge `{ winProbability, payoffRatio }` over a rolling
`KELLY_WINDOW`, and converts your live account value into the fractional-Kelly
stake:

```
f*        = p − (1 − p) / b                        ← raw Kelly fraction
stake     = accountValue × f* × KELLY_FRACTION      ← capped at KELLY_MAX_FRACTION
copySize  = min(mirrorSize, stake / midPrice)       ← Kelly only ever shrinks a copy
```

Kelly acts as a **cap**: it never sizes above the mirrored trade or
`MAX_POSITION_SIZE_USD`, and it skips the open entirely when the observed edge
is non-positive (`f* ≤ 0`). Until `KELLY_MIN_SAMPLES` closes have accumulated
(seeded at startup from the target's recent fills), sizing falls back to the
plain `SIZE_MULTIPLIER` mirror.

**Closing a perp position** (`dir` contains `"Close"`):
```
closePercent = fill.sz / |startPosition|    ← % of their position they exited
copySize     = |ourPosition.szi| × closePercent  ← same % of ours
```

This proportional close logic ensures the **perp copy trading bot** stays in sync even when the target partially reduces a position.

### Step 3 — Leverage Sync

Before opening any copied perpetual position, the **Hyperliquid perp bot** fetches the target's current leverage for that coin and applies it to our account — capped at `MAX_LEVERAGE`.

### Step 4 — IOC Order Execution

All copy orders are placed as **IOC (Immediate-Or-Cancel)** limit orders with a slippage buffer:

- **Buy / Long**: `price = midPrice × (1 + SLIPPAGE_BPS / 10000)` → priced above market to guarantee fill
- **Sell / Short**: `price = midPrice × (1 - SLIPPAGE_BPS / 10000)` → priced below market to guarantee fill

This makes every copy trade behave like a market order without paying the spread of an explicit market order type.

### Step 5 — Reconciliation

Every `RECONCILE_INTERVAL_MS` milliseconds, the **Hyperliquid copy trading bot** runs a reconciliation loop:

1. Fetches the target's live open perpetual positions
2. Fetches our current open positions
3. For any managed coin where the **target is now flat but we still hold** → closes our position
4. Logs a warning if our size has drifted significantly from the expected scaled size

---

## Risk Management

The **perp trading bot** includes multiple layers of risk control:

| Guard | Config Variable | Behavior |
|---|---|---|
| Max position size | `MAX_POSITION_SIZE_USD` | Rejects any copy order where notional > limit |
| Max total exposure | `MAX_TOTAL_EXPOSURE_USD` | Rejects if adding this position would push total notional over limit |
| Max leverage | `MAX_LEVERAGE` | Caps leverage for all copied perpetual positions |
| Kelly sizing | `KELLY_ENABLED` | Caps each copy at the fractional-Kelly stake of equity; skips opens with no edge |
| Daily loss limit | `MAX_DAILY_LOSS_USD` | Pauses the entire bot until midnight UTC if cumulative realized loss hits limit |
| Minimum notional | Hard-coded $5 | Skips micro-trades that would generate dust positions |
| Retry logic | Built-in | All API calls retry up to 3× with exponential back-off |

---

## Security Best Practices for Any Hyperliquid Trading Bot

1. **Use a dedicated API wallet, never your main wallet.**
   Hyperliquid lets you authorize a separate wallet that can trade but cannot withdraw. If your API key for the copy trading bot is ever compromised, your funds remain safe.

2. **Never commit `.env` to git.**
   The `.gitignore` already excludes it, but double-check before pushing.

3. **Always test on testnet first.**
   Set `NETWORK=testnet` and get free testnet USDC from the Hyperliquid Discord. Run the perp copy trading bot for at least 24 hours on testnet before going live.

4. **Start small.**
   Use `SIZE_MULTIPLIER=0.1` to copy at 10% of the target's size. Validate the Hyperliquid bot's behavior before scaling.

5. **Set `MAX_DAILY_LOSS_USD`.**
   Always configure a daily loss limit so the perp trading bot pauses automatically if something unexpected happens.

---

## Log Output Example

When the **Hyperliquid copy trading bot** is running, you'll see output like this:

```
[2026-03-31 14:22:01] info: ══════════════════════════════════════════════════════════════
[2026-03-31 14:22:01] info:   Hyperliquid Perpetual Copy Trading Bot
[2026-03-31 14:22:01] info: ══════════════════════════════════════════════════════════════
[2026-03-31 14:22:01] info:   Network          : mainnet
[2026-03-31 14:22:01] info:   Target trader    : 0xabcd...1234
[2026-03-31 14:22:01] info:   Our wallet       : 0xef01...5678
[2026-03-31 14:22:01] info:   Size multiplier  : 1×
[2026-03-31 14:22:01] info:   Max pos size     : $1000
[2026-03-31 14:22:03] info: Loaded metadata for 142 perpetual markets
[2026-03-31 14:22:04] info: Our account value : $2450.00
[2026-03-31 14:22:04] info: Target trader open positions: 2
[2026-03-31 14:22:04] info:   BTC      LONG  0.02 @ entry 85432.0
[2026-03-31 14:22:04] info:   ETH      SHORT 0.5  @ entry 1920.0
[2026-03-31 14:22:04] info: Subscribing to live fills for 0xabcd...1234...
[2026-03-31 14:22:04] info: Bot is live. Press Ctrl+C to stop.

[2026-03-31 14:35:12] info: ◆ TARGET FILL  BTC      [Open Long  ] sz=0.01  px=86100.0  tx=0xaabbcc...
[2026-03-31 14:35:12] info: → BTC       BUY          0.010 @      86543.0 [open    ]  (copy-open-long)
[2026-03-31 14:35:12] info: ✓ BTC BUY  0.010 FILLED @ avg 86510.5 (oid=109234)
```

---

## Frequently Asked Questions

**Q: Does this Hyperliquid copy trading bot work with spot markets?**
No — the bot filters out spot fills automatically and only copies perpetual (perp) trades on Hyperliquid.

**Q: What happens if the target trader gets liquidated?**
A liquidation fill appears as a `"Liquidated Long"` or `"Liquidated Short"` direction. The bot will not try to copy a liquidation — it skips unknown `dir` values and the reconciliation loop will detect the now-flat position and close ours.

**Q: Can I copy multiple traders at once?**
The current architecture supports one target trader per bot instance. To copy multiple traders, run multiple bot instances with different `.env` files.

**Q: What is the minimum balance to run this perp copy trading bot?**
At least $50 USDC is recommended. The bot skips any copy order where the notional is below $5 (to avoid dust), and you'll need margin for positions.

**Q: Does the Hyperliquid perp bot handle WebSocket disconnects?**
Yes. The `WebSocketTransport` from the SDK automatically reconnects. The reconciliation loop (default: every 60 seconds) acts as a safety net to re-sync positions after any reconnection.

---

## Technical Stack

| Component | Technology |
|---|---|
| Language | TypeScript 5 |
| Runtime | Node.js 18+ |
| Hyperliquid SDK | `@nktkas/hyperliquid` v0.32+ |
| Wallet signing | `viem` (EIP-712) |
| Logging | Winston |
| Build | tsc |

---

## Disclaimer

This **Hyperliquid copy trading bot** and **perpetual DEX trading bot** software is provided for educational and informational purposes only. Cryptocurrency perpetual futures trading carries a substantial risk of financial loss. Past performance of any copied trader does not guarantee future results. Always perform your own due diligence. The authors accept no responsibility for any trading losses incurred through use of this perp trading bot.

**Use at your own risk. Test on testnet first. Never trade with funds you cannot afford to lose.**
