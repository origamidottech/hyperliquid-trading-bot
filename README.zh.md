# Hyperliquid 跟单交易机器人 —— 面向 Hyperliquid 永续合约的永续 DEX 交易机器人

[English](README.md) · [Русский](README.ru.md) · **中文**

https://github.com/user-attachments/assets/d30201f1-546b-4a11-ae88-5a87a6b2a316

> **使用 TypeScript 与 Node.js 构建的最完整的开源 Hyperliquid 跟单交易机器人。**
> 通过 WebSocket 实时镜像任意交易者在 Hyperliquid 上的永续合约仓位。

---

## 这是什么？（Hyperliquid 跟单交易机器人）

这是一个 **Hyperliquid 跟单交易机器人** —— 一个全自动的永续合约交易机器人，它监控 Hyperliquid 永续 DEX 上目标交易者的钱包，并即时将其每一笔交易镜像到你自己的账户。

无论你想要的是 **Hyperliquid 永续交易机器人**、**永续 DEX 跟单机器人**，还是用于链上合约的 **加密货币跟单机器人** —— 本项目都能覆盖。

本 **Hyperliquid 交易机器人** 基于官方 TypeScript SDK [`@nktkas/hyperliquid`](https://www.npmjs.com/package/@nktkas/hyperliquid) 构建，通过 WebSocket 连接，在 Hyperliquid 永续 DEX 上实现近乎零延迟的交易复制。

---

## 为什么使用这个 Hyperliquid 跟单交易机器人？

- **实时永续合约跟单** —— WebSocket `userFills` 订阅在目标成交后的毫秒级内触发
- **精确的按比例平仓逻辑** —— 若目标平掉其永续仓位的 40%，机器人也精确平掉你仓位的 40%
- **杠杆同步** —— 永续交易机器人在开仓前会匹配（并限制）目标交易者的杠杆
- **周期性对账（reconciliation）** —— Hyperliquid 机器人每 N 秒将你的仓位与目标进行比对，并自动平掉任何漂移的仓位
- **完整的风险管理** —— 最大仓位规模、最大总敞口、最大杠杆以及每日亏损熔断
- **市价 IOC 订单** —— 使用带滑点容差的激进 IOC（Immediate-Or-Cancel，立即成交或取消）订单，使每一笔跟单都立即成交
- **优雅关闭** —— 可选在 Ctrl+C 时平掉所有已复制的永续仓位
- **结构化日志** —— 通过 Winston 输出到控制台 + 滚动文件日志

---

## 关键词：本机器人覆盖的范围

这个 **Hyperliquid 跟单交易机器人** 面向对以下任何主题感兴趣的交易者：

- Hyperliquid 跟单交易机器人
- Hyperliquid 永续交易机器人
- Hyperliquid 永续 DEX 交易机器人
- 永续 DEX 跟单交易机器人
- 开源永续交易机器人
- TypeScript 加密货币跟单机器人
- 链上跟单交易机器人
- Hyperliquid 自动化交易机器人
- Hyperliquid 镜像交易机器人
- Hyperliquid 跟随交易者机器人
- Node.js DEX 永续机器人
- TypeScript Hyperliquid 机器人

---

## 项目结构

```
hyperliquid-copy-trading-bot/
├── src/
│   ├── index.ts              # 入口 —— 启动与优雅关闭
│   ├── bot.ts                # CopyTradingBot —— 主编排逻辑
│   ├── config.ts             # .env 加载与校验
│   ├── types.ts              # TypeScript 接口与类型
│   ├── services/
│   │   ├── hlClient.ts        # Hyperliquid SDK 封装（Info + Exchange + Subscription）
│   │   ├── riskManager.ts     # 风险检查、每日亏损追踪
│   │   ├── kellySizer.ts       # 凯利公式仓位规模（kelly-stake）
│   │   ├── orderExecutor.ts   # 带重试逻辑的下单
│   │   ├── fillProcessor.ts   # 目标成交 → 复制订单（开仓/平仓/杠杆）
│   │   ├── reconciler.ts      # 周期性仓位再同步安全网
│   │   ├── stopLossMonitor.ts # 逐仓止损执行
│   │   ├── positionRegistry.ts# 机器人主动管理的币种集合
│   │   └── statsTracker.ts    # 运行期计数器
│   └── utils/
│       ├── logger.ts         # Winston 日志（控制台 + 文件）
│       ├── math.ts           # 价格/规模格式化辅助
│       ├── keyedQueue.ts     # 按币种的串行任务队列（并发安全）
│       └── sleep.ts          # sleep() + withRetry() 工具
├── logs/                     # 自动创建的日志文件
├── .env.example              # 配置模板
├── package.json
├── tsconfig.json
└── README.md
```

---

## 快速开始 —— 运行 Hyperliquid 跟单交易机器人

### 前置条件

- **Node.js 18+**
- 一个在主网（或测试网）已存入 USDC 的 **Hyperliquid** 账户
- 一个专用 **API 钱包** —— 可交易但不能提现的子钱包（强烈推荐用于任何 Hyperliquid 交易机器人）

### 1. 克隆与安装

```bash
npm install
```

### 2. 配置永续交易机器人

```bash
cp .env.example .env
```

打开 `.env` 并填入你的值：

```env
# ── 必填 ───────────────────────────────────────────────────────
# 你专用交易钱包的私钥
PRIVATE_KEY=0xYourTradingWalletPrivateKey

# 你想复制其永续交易的钱包地址
TARGET_TRADER=0xTargetTraderAddressHere

# ── 仓位规模 ───────────────────────────────────────────────────
SIZE_MULTIPLIER=1.0          # 1.0 = 与目标相同规模
MAX_POSITION_SIZE_USD=1000   # 单仓最大名义价值
MAX_TOTAL_EXPOSURE_USD=5000  # 所有未平仓名义价值之和上限
MAX_LEVERAGE=10              # 永不超过 10 倍

# ── 凯利仓位（可选）────────────────────────────────────────────
KELLY_ENABLED=false          # 将每笔跟单限制在分数凯利注额内
KELLY_FRACTION=0.5           # 半凯利（推荐）
KELLY_MAX_FRACTION=0.2       # 单笔跟单永不押注超过权益的 20%
KELLY_WINDOW=50              # 目标交易的滚动窗口
KELLY_MIN_SAMPLES=10         # 凯利生效前所需的平仓次数

# ── 风险 ───────────────────────────────────────────────────────
MAX_DAILY_LOSS_USD=500       # 当日亏损达到 $500 时暂停永续机器人

# ── 网络 ───────────────────────────────────────────────────────
NETWORK=testnet              # 请务必先在测试网测试！
```

### 3. 运行 Hyperliquid 永续机器人

**开发模式（文件变更时自动重载）：**
```bash
npm run dev
```

**生产环境（先编译后运行）：**
```bash
npm run build
npm start
```

---

## 配置参考

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PRIVATE_KEY` | **必填** | 你的 Hyperliquid 交易钱包私钥（0x...） |
| `TARGET_TRADER` | **必填** | 在永续 DEX 上要跟单的钱包地址 |
| `SIZE_MULTIPLIER` | `1.0` | 将目标的交易规模乘以此系数 |
| `MAX_POSITION_SIZE_USD` | `1000` | 单个复制仓位的最大名义价值（USD） |
| `MAX_TOTAL_EXPOSURE_USD` | `5000` | 所有永续仓位的最大总未平仓名义价值 |
| `MAX_LEVERAGE` | `10` | 杠杆上限 —— 跟单机器人永不超过此值 |
| `KELLY_ENABLED` | `false` | 启用凯利公式仓位规模（将每笔跟单限制在分数凯利注额内） |
| `KELLY_FRACTION` | `0.5` | (0, 1] 区间内的分数凯利系数。`0.5` = 半凯利（推荐） |
| `KELLY_MAX_FRACTION` | `0.2` | 单笔跟单权益占比的硬性上限，取值 (0, 1] |
| `KELLY_WINDOW` | `50` | 用于估计优势（edge）的目标近期交易滚动窗口 |
| `KELLY_MIN_SAMPLES` | `10` | 凯利生效前所需的目标最少平仓次数（否则使用镜像规模） |
| `STOP_LOSS_PERCENT` | `0` | 相对入场价的自动止损百分比（0 = 禁用） |
| `STOP_LOSS_CHECK_INTERVAL_MS` | `5000` | 检查所管理仓位是否触及止损的间隔（毫秒） |
| `MAX_DAILY_LOSS_USD` | `0` | 当日已实现亏损超过此值则暂停机器人（0 = 禁用） |
| `COPY_EXISTING_POSITIONS` | `false` | 启动时也复制目标当前已开的永续仓位 |
| `CLOSE_ON_EXIT` | `false` | 机器人关闭时平掉所有已复制的永续仓位 |
| `RECONCILE_INTERVAL_MS` | `60000` | 运行仓位对账的间隔（毫秒） |
| `SLIPPAGE_BPS` | `50` | IOC 订单滑点，单位为基点（50 = 0.5%） |
| `NETWORK` | `mainnet` | `mainnet` 或 `testnet` |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `LOG_TO_FILE` | `true` | 将日志写入 `./logs/` |

---

## Hyperliquid 跟单交易机器人的工作原理

### 第 1 步 —— WebSocket 成交订阅

**Hyperliquid 跟单交易机器人** 订阅目标交易者地址的 `userFills` WebSocket 频道。
每当目标在 Hyperliquid 永续 DEX 上产生一笔成交时，机器人会收到包含以下字段的事件：

| 字段 | 含义 |
|---|---|
| `coin` | 永续市场（例如 `"BTC"`、`"ETH"`、`"SOL"`） |
| `dir` | `"Open Long"` / `"Close Long"` / `"Open Short"` / `"Close Short"` |
| `sz` | 成交规模 |
| `px` | 成交价格 |
| `startPosition` | 目标在此次成交**之前**的仓位规模 |
| `side` | `"B"` = 买入/做多，`"A"` = 卖出/做空 |

### 第 2 步 —— 复制规模计算

**开永续仓位**（`dir` 含 `"Open"`）：
```
copySize = fill.sz × SIZE_MULTIPLIER
copySize = min(copySize, kellyStake / currentMidPrice)   ← 仅当 KELLY_ENABLED 时
copySize = min(copySize, MAX_POSITION_SIZE_USD / currentMidPrice)
```

当 `KELLY_ENABLED=true` 时，机器人通过 [`kelly-stake`](https://www.npmjs.com/package/kelly-stake)
模块使用 **凯利公式** 来确定规模。它观察目标交易者已实现的平仓盈亏，在滚动窗口
`KELLY_WINDOW` 上估计其优势 `{ winProbability, payoffRatio }`，并将你的实时账户价值
转换为分数凯利注额：

```
f*        = p − (1 − p) / b                        ← 原始凯利分数
stake     = accountValue × f* × KELLY_FRACTION      ← 受 KELLY_MAX_FRACTION 限制
copySize  = min(mirrorSize, stake / midPrice)       ← 凯利只会缩小跟单
```

凯利充当**上限**：它永远不会将规模设得高于镜像交易或 `MAX_POSITION_SIZE_USD`，
并且当观察到的优势非正（`f* ≤ 0`）时会完全跳过该开仓。在累计到
`KELLY_MIN_SAMPLES` 次平仓之前（启动时从目标近期成交预热），
规模将回退到普通的 `SIZE_MULTIPLIER` 镜像方式。

**平永续仓位**（`dir` 含 `"Close"`）：
```
closePercent = fill.sz / |startPosition|    ← 目标退出的仓位百分比
copySize     = |ourPosition.szi| × closePercent  ← 我们仓位的相同百分比
```

这种按比例平仓逻辑确保 **永续跟单交易机器人** 即使在目标部分减仓时也保持同步。

### 第 3 步 —— 杠杆同步

在开任何复制的永续仓位之前，**Hyperliquid 永续机器人** 会获取目标该币种的当前杠杆并应用到我们的账户 —— 上限为 `MAX_LEVERAGE`。

### 第 4 步 —— IOC 订单执行

所有跟单订单均以带滑点缓冲的 **IOC（Immediate-Or-Cancel，立即成交或取消）** 限价单下单：

- **买入 / 做多**：`price = midPrice × (1 + SLIPPAGE_BPS / 10000)` → 定价高于市场以保证成交
- **卖出 / 做空**：`price = midPrice × (1 - SLIPPAGE_BPS / 10000)` → 定价低于市场以保证成交

这使每笔跟单都表现得像市价单，同时无需支付显式市价单类型的价差。

### 第 5 步 —— 对账（Reconciliation）

每隔 `RECONCILE_INTERVAL_MS` 毫秒，**Hyperliquid 跟单交易机器人** 运行一次对账循环：

1. 获取目标实时的未平永续仓位
2. 获取我们当前的未平仓位
3. 对于任何受管币种，若**目标已空仓而我们仍持有** → 平掉我们的仓位
4. 若我们的规模已明显偏离预期的缩放规模，则记录一条警告

---

## 风险管理

**永续交易机器人** 包含多层风险控制：

| 防护 | 配置变量 | 行为 |
|---|---|---|
| 最大仓位规模 | `MAX_POSITION_SIZE_USD` | 拒绝任何名义价值 > 上限的跟单订单 |
| 最大总敞口 | `MAX_TOTAL_EXPOSURE_USD` | 若新增该仓位会使总名义价值超限则拒绝 |
| 最大杠杆 | `MAX_LEVERAGE` | 为所有复制的永续仓位设置杠杆上限 |
| 凯利仓位 | `KELLY_ENABLED` | 将每笔跟单限制在权益的分数凯利注额内；无优势时跳过开仓 |
| 每日亏损上限 | `MAX_DAILY_LOSS_USD` | 若累计已实现亏损达到上限，暂停整个机器人直到 UTC 午夜 |
| 最小名义价值 | 硬编码 $5 | 跳过会产生粉尘（dust）仓位的微小交易 |
| 重试逻辑 | 内置 | 所有 API 调用最多重试 3 次，采用指数退避 |

---

## 任何 Hyperliquid 交易机器人的安全最佳实践

1. **使用专用 API 钱包，绝不用主钱包。**
   Hyperliquid 允许你授权一个可交易但不可提现的独立钱包。即使跟单机器人的 API 密钥被泄露，你的资金仍然安全。

2. **绝不要把 `.env` 提交到 git。**
   `.gitignore` 已将其排除，但在 push 前请再次确认。

3. **务必先在测试网测试。**
   设置 `NETWORK=testnet`，并从 Hyperliquid Discord 获取免费测试网 USDC。上主网前，请在测试网至少运行 24 小时。

4. **从小额开始。**
   使用 `SIZE_MULTIPLIER=0.1` 以目标 10% 的规模跟单。在扩大之前先验证机器人的行为。

5. **设置 `MAX_DAILY_LOSS_USD`。**
   务必配置每日亏损上限，以便在发生意外时永续机器人自动暂停。

---

## 日志输出示例

当 **Hyperliquid 跟单交易机器人** 运行时，你会看到类似如下的输出：

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

## 常见问题

**问：这个 Hyperliquid 跟单交易机器人支持现货市场吗？**
不支持 —— 机器人会自动过滤掉现货成交，只复制 Hyperliquid 上的永续（perp）交易。

**问：如果目标交易者被强平会怎样？**
强平成交会以 `"Liquidated Long"` 或 `"Liquidated Short"` 方向出现。机器人不会尝试复制强平 —— 它会跳过未知的 `dir` 值，而对账循环会检测到现已空仓的仓位并平掉我们的。

**问：可以同时复制多个交易者吗？**
当前架构每个机器人实例支持一个目标交易者。若要复制多个交易者，请用不同的 `.env` 文件运行多个机器人实例。

**问：运行这个永续跟单交易机器人的最低余额是多少？**
建议至少 $50 USDC。机器人会跳过名义价值低于 $5 的任何跟单订单（以避免粉尘），并且你还需要保证金来持仓。

**问：Hyperliquid 永续机器人能处理 WebSocket 断线吗？**
可以。SDK 的 `WebSocketTransport` 会自动重连。对账循环（默认每 60 秒）作为安全网，在任何重连后重新同步仓位。

---

## 技术栈

| 组件 | 技术 |
|---|---|
| 语言 | TypeScript 5 |
| 运行时 | Node.js 18+ |
| Hyperliquid SDK | `@nktkas/hyperliquid` v0.32+ |
| 钱包签名 | `viem`（EIP-712） |
| 日志 | Winston |
| 构建 | tsc |

---

## 免责声明

本 **Hyperliquid 跟单交易机器人** 与 **永续 DEX 交易机器人** 软件仅供教育与信息参考之用。加密货币永续合约交易存在重大财务损失风险。任何被复制交易者的过往表现均不保证未来结果。请始终进行你自己的尽职调查（due diligence）。对于使用本永续机器人所产生的任何交易损失，作者概不负责。

**风险自负。请务必先在测试网测试。切勿使用你无法承受损失的资金进行交易。**
