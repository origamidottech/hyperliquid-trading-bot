import * as dotenv from 'dotenv';
import { BotConfig, LogLevel, Network } from './types';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  if (isNaN(n)) throw new Error(`Environment variable ${key} must be a number, got: "${raw}"`);
  return n;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw.toLowerCase() === 'true';
}

function validateAddress(value: string, label: string): string {
  const lower = value.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/i.test(lower)) {
    throw new Error(`${label} must be a valid 42-character Ethereum address (0x...), got: "${value}"`);
  }
  return lower;
}

export function loadConfig(): BotConfig {
  const privateKey = requireEnv('PRIVATE_KEY');
  if (!privateKey.startsWith('0x')) {
    throw new Error('PRIVATE_KEY must start with 0x');
  }

  const targetTrader = validateAddress(requireEnv('TARGET_TRADER'), 'TARGET_TRADER');
  const network = optionalEnv('NETWORK', 'mainnet') as Network;

  if (!['mainnet', 'testnet'].includes(network)) {
    throw new Error(`NETWORK must be "mainnet" or "testnet", got: "${network}"`);
  }

  const logLevel = optionalEnv('LOG_LEVEL', 'info') as LogLevel;
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be debug | info | warn | error, got: "${logLevel}"`);
  }

  const sizeMultiplier = envNumber('SIZE_MULTIPLIER', 1.0);
  if (sizeMultiplier <= 0) throw new Error('SIZE_MULTIPLIER must be > 0');

  const maxLeverage = envNumber('MAX_LEVERAGE', 10);
  if (maxLeverage < 1 || maxLeverage > 100) {
    throw new Error('MAX_LEVERAGE must be between 1 and 100');
  }

  const stopLossPercent = envNumber('STOP_LOSS_PERCENT', 0);
  if (stopLossPercent < 0 || stopLossPercent >= 100) {
    throw new Error('STOP_LOSS_PERCENT must be between 0 (disabled) and 100');
  }

  const kellyFraction = envNumber('KELLY_FRACTION', 0.5);
  if (kellyFraction <= 0 || kellyFraction > 1) {
    throw new Error('KELLY_FRACTION must be in (0, 1]');
  }

  const kellyMaxFraction = envNumber('KELLY_MAX_FRACTION', 0.2);
  if (kellyMaxFraction <= 0 || kellyMaxFraction > 1) {
    throw new Error('KELLY_MAX_FRACTION must be in (0, 1]');
  }

  const kellyWindow = envNumber('KELLY_WINDOW', 50);
  if (kellyWindow < 1) throw new Error('KELLY_WINDOW must be >= 1');

  const kellyMinSamples = envNumber('KELLY_MIN_SAMPLES', 10);
  if (kellyMinSamples < 1) throw new Error('KELLY_MIN_SAMPLES must be >= 1');

  return {
    privateKey: privateKey as `0x${string}`,
    targetTrader,
    sizeMultiplier,
    maxPositionSizeUsd: envNumber('MAX_POSITION_SIZE_USD', 1000),
    maxTotalExposureUsd: envNumber('MAX_TOTAL_EXPOSURE_USD', 5000),
    maxLeverage,
    kelly: {
      enabled: envBool('KELLY_ENABLED', false),
      fraction: kellyFraction,
      maxFraction: kellyMaxFraction,
      window: kellyWindow,
      minSamples: kellyMinSamples,
    },
    stopLossPercent,
    stopLossCheckIntervalMs: envNumber('STOP_LOSS_CHECK_INTERVAL_MS', 5_000),
    maxDailyLossUsd: envNumber('MAX_DAILY_LOSS_USD', 0),
    copyExistingPositions: envBool('COPY_EXISTING_POSITIONS', false),
    closeOnExit: envBool('CLOSE_ON_EXIT', false),
    reconcileIntervalMs: envNumber('RECONCILE_INTERVAL_MS', 60_000),
    slippageBps: envNumber('SLIPPAGE_BPS', 50),
    network,
    logLevel,
    logToFile: envBool('LOG_TO_FILE', true),
  };
}
