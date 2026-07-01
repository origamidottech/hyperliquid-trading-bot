import type { UserFillsWsEvent } from '@nktkas/hyperliquid';
import { BotConfig, TraderFill } from './types';
import { HLClient } from './services/hlClient';
import { OrderExecutor } from './services/orderExecutor';
import { RiskManager } from './services/riskManager';
import { PositionRegistry } from './services/positionRegistry';
import { StatsTracker } from './services/statsTracker';
import { KellySizer } from './services/kellySizer';
import { FillProcessor } from './services/fillProcessor';
import { Reconciler } from './services/reconciler';
import { StopLossMonitor } from './services/stopLossMonitor';
import { KeyedQueue } from './utils/keyedQueue';
import { getLogger } from './utils/logger';

/**
 * Top-level orchestrator: wires the services together, owns the shared state
 * (queue / registry / stats), manages the WebSocket subscription, and drives
 * startup and graceful shutdown. All trading logic lives in the services.
 */
export class CopyTradingBot {
  private readonly client: HLClient;
  private readonly executor: OrderExecutor;
  private readonly risk: RiskManager;

  // Shared state — a single instance of each is threaded into every service.
  private readonly queue = new KeyedQueue();
  private readonly registry = new PositionRegistry();
  private readonly stats = new StatsTracker();
  private readonly kelly: KellySizer;

  private readonly fills: FillProcessor;
  private readonly reconciler: Reconciler;
  private readonly stopLoss: StopLossMonitor;

  private running = false;

  constructor(private readonly config: BotConfig) {
    this.client = new HLClient(config);
    this.executor = new OrderExecutor(this.client);
    this.risk = new RiskManager(config, this.client);
    this.kelly = new KellySizer(config.kelly);

    this.fills = new FillProcessor(
      config,
      this.client,
      this.executor,
      this.risk,
      this.registry,
      this.stats,
      this.queue,
      this.kelly,
    );
    this.reconciler = new Reconciler(
      config,
      this.client,
      this.executor,
      this.registry,
      this.stats,
      this.queue,
    );
    this.stopLoss = new StopLossMonitor(
      config,
      this.client,
      this.executor,
      this.registry,
      this.queue,
    );
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const logger = getLogger();
    this.printBanner();

    await this.client.loadAssetMeta();

    const accountValue = await this.client.getAccountValue();
    logger.info(`Our account value : $${accountValue.toFixed(2)}`);
    if (accountValue < 10) {
      throw new Error(
        `Insufficient account balance ($${accountValue.toFixed(2)}). Deposit USDC before starting.`,
      );
    }

    const targetPositions = await this.client.getPositions(this.config.targetTrader);
    logger.info(`Target trader open positions: ${targetPositions.length}`);
    for (const p of targetPositions) {
      const szi = parseFloat(p.szi);
      logger.info(
        `  ${p.coin.padEnd(8)} ${szi > 0 ? 'LONG ' : 'SHORT'} ` +
          `${Math.abs(szi)} @ entry ${p.entryPx}  (${p.leverage.type} ${p.leverage.value}×)`,
      );
    }

    if (this.config.kelly.enabled) {
      const history = await this.client.getRecentFills(this.config.targetTrader);
      this.kelly.warmUp(history);
    }

    if (this.config.copyExistingPositions && targetPositions.length > 0) {
      logger.info('COPY_EXISTING_POSITIONS=true — opening copies of current positions...');
      await this.fills.copyExisting(targetPositions);
    }

    this.running = true;
    this.reconciler.start();
    this.stopLoss.start();

    logger.info(`Subscribing to live fills for ${this.config.targetTrader}...`);
    await this.subscribeFills();

    logger.info('Bot is live. Press Ctrl+C to stop.\n');
  }

  async stop(): Promise<void> {
    const logger = getLogger();
    this.running = false;

    this.reconciler.stop();
    this.stopLoss.stop();

    this.printStats();

    if (this.config.closeOnExit) {
      logger.info('CLOSE_ON_EXIT=true — closing all managed positions...');
      await this.executor.closeAllPositions();
    }

    logger.info('Bot stopped.');
  }

  // ─── WebSocket subscription ────────────────────────────────────────────────

  private async subscribeFills(): Promise<void> {
    await this.client.subs.userFills(
      { user: this.config.targetTrader },
      (event: UserFillsWsEvent) => {
        if (event.isSnapshot) {
          getLogger().debug(`Skipping ${event.fills.length} historical fill(s) (snapshot)`);
          return;
        }
        if (!this.running) return;

        // Hand each fill to the processor; it serializes per-coin internally.
        for (const fill of event.fills) {
          this.fills.enqueue(fill as unknown as TraderFill);
        }
      },
    );
  }

  // ─── Display ───────────────────────────────────────────────────────────────

  private printBanner(): void {
    const logger = getLogger();
    const sep = '═'.repeat(62);
    logger.info(sep);
    logger.info('  Hyperliquid Perpetual Copy Trading Bot');
    logger.info(sep);
    logger.info(`  Network          : ${this.config.network}`);
    logger.info(`  Target trader    : ${this.config.targetTrader}`);
    logger.info(`  Our wallet       : ${this.client.walletAddress}`);
    logger.info(`  Size multiplier  : ${this.config.sizeMultiplier}×`);
    logger.info(`  Max pos size     : $${this.config.maxPositionSizeUsd}`);
    logger.info(`  Max total exp.   : $${this.config.maxTotalExposureUsd}`);
    logger.info(`  Max leverage     : ${this.config.maxLeverage}×`);
    logger.info(
      `  Kelly sizing     : ${
        this.config.kelly.enabled
          ? `${this.config.kelly.fraction}× Kelly, cap ${(this.config.kelly.maxFraction * 100).toFixed(0)}% of equity`
          : 'disabled'
      }`,
    );
    logger.info(`  Slippage         : ${this.config.slippageBps} bps`);
    logger.info(
      `  Stop-loss        : ${this.config.stopLossPercent > 0 ? this.config.stopLossPercent + '%' : 'disabled'}`,
    );
    logger.info(`  Copy existing    : ${this.config.copyExistingPositions}`);
    logger.info(`  Close on exit    : ${this.config.closeOnExit}`);
    logger.info(sep);
  }

  private printStats(): void {
    const logger = getLogger();
    const s = this.stats.snapshot();
    const upMs = Date.now() - s.startTime.getTime();
    const h = Math.floor(upMs / 3_600_000);
    const m = Math.floor((upMs % 3_600_000) / 60_000);
    const sep = '═'.repeat(62);
    logger.info(sep);
    logger.info('  Final Statistics');
    logger.info(sep);
    logger.info(`  Uptime           : ${h}h ${m}m`);
    logger.info(`  Trades copied    : ${s.tradesCopied}`);
    logger.info(`  Trades failed    : ${s.tradesFailed}`);
    logger.info(`  Trades skipped   : ${s.tradeSkipped}`);
    logger.info(`  Coins traded     : ${[...s.copiedCoins].join(', ') || 'none'}`);
    logger.info(sep);
  }
}
