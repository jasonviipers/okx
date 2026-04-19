import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? undefined : value;

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .refine((value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }, "Expected a valid URL")
    .optional(),
);

const optionalBooleanString = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .optional(),
);

const optionalNumberString = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .refine(
      (value) => Number.isFinite(Number(value)),
      "Expected a valid number",
    )
    .optional(),
);

const optionalIntegerString = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .refine(
      (value) => Number.isInteger(Number(value)),
      "Expected a valid integer",
    )
    .optional(),
);

const okxAccountModes = ["live", "demo", "paper"] as const;
const okxApiRegions = ["global", "us", "eu", "au"] as const;
const autonomousSelectionModes = ["auto", "fixed"] as const;
const timeframes = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1H",
  "2H",
  "4H",
  "6H",
  "12H",
  "1D",
  "1W",
] as const;

export const env = createEnv({
  server: {
    OKX_API_KEY: optionalString,
    OKX_SECRET: optionalString,
    OKX_PASSPHRASE: optionalString,
    OKX_API_REGION: z.enum(okxApiRegions).optional(),
    OKX_BASE_URL: optionalUrl,
    OKX_WS_URL: optionalUrl,
    OKX_ACCOUNT_MODE: z.enum(okxAccountModes).optional(),
    REDIS_URL: optionalUrl,
    DB_FILE_NAME: optionalString,
    DB_MIGRATIONS_DIR: optionalString,
    OLLAMA_BASE_URL: optionalUrl,
    OLLAMA_API_KEY: optionalString,
    APP_URL: optionalUrl,
    AUTO_EXECUTE_ENABLED: optionalBooleanString,
    AUTONOMOUS_TRADING_ENABLED: optionalBooleanString,
    AUTONOMOUS_SYMBOL_SELECTION: z.enum(autonomousSelectionModes).optional(),
    AUTONOMOUS_SYMBOL: optionalString,
    AUTONOMOUS_SYMBOLS: optionalString,
    AUTONOMOUS_QUOTE_CURRENCIES: optionalString,
    AUTONOMOUS_QUOTE_CURRENCY: optionalString,
    AUTONOMOUS_SYMBOL_LIMIT: optionalIntegerString,
    AUTONOMOUS_TIMEFRAME: z.enum(timeframes).optional(),
    AUTONOMOUS_INTERVAL_MS: optionalIntegerString,
    AUTONOMOUS_COOLDOWN_MS: optionalIntegerString,
    LIVE_TRADING_BUDGET_USD: optionalNumberString,
    MAX_POSITION_USD: optionalNumberString,
    MAX_BALANCE_USAGE_PCT: optionalNumberString,
    MIN_TRADE_NOTIONAL: optionalNumberString,
    AUTONOMY_MAX_SYMBOL_ALLOCATION_PCT: optionalNumberString,
    MAX_SYMBOL_ALLOCATION_PCT: optionalNumberString,
    MAX_DAILY_TRADES: optionalIntegerString,
    MIN_CONFIDENCE_THRESHOLD: optionalNumberString,
    MIN_DIRECTIONAL_EDGE_SCORE: optionalNumberString,
    MIN_MARKET_QUALITY_SCORE: optionalNumberString,
    MIN_NET_EDGE_BPS: optionalNumberString,
    MIN_REWARD_RISK: optionalNumberString,
    EXPECTED_FEE_BPS: optionalNumberString,
    AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_THRESHOLD: optionalIntegerString,
    AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_WINDOW_MS: optionalIntegerString,
    POSITION_MONITOR_ENABLED: optionalBooleanString,
    POSITION_MONITOR_INTERVAL_MS: optionalIntegerString,
    TRAILING_STOP_ENABLED: optionalBooleanString,
    TRAILING_STOP_DISTANCE_PCT: optionalNumberString,
    CRON_SECRET: optionalString,
    TELEMETRY_TOKEN: optionalString,
    ALLOW_SYNTHETIC_MARKET_FALLBACK: optionalBooleanString,
    REQUIRE_REALTIME_MARKET_DATA: optionalBooleanString,
    MARKET_TICKER_STALE_MS: optionalIntegerString,
    MARKET_ORDERBOOK_STALE_MS: optionalIntegerString,
    MARKET_REST_REFRESH_MS: optionalIntegerString,
    MARKET_CANDLE_REFRESH_MS: optionalIntegerString,
    OKX_ACCOUNT_CACHE_TTL_MS: optionalIntegerString,
    OKX_ACCOUNT_STALE_FALLBACK_MS: optionalIntegerString,
    SWARM_DIAGNOSTIC_VOTE_TIMEOUT_MS: optionalIntegerString,
  },
  client: {
    NEXT_PUBLIC_APP_URL: optionalUrl,
  },
  runtimeEnv: {
    OKX_API_KEY: process.env.OKX_API_KEY,
    OKX_SECRET: process.env.OKX_SECRET,
    OKX_PASSPHRASE: process.env.OKX_PASSPHRASE,
    OKX_API_REGION: process.env.OKX_API_REGION,
    OKX_BASE_URL: process.env.OKX_BASE_URL,
    OKX_WS_URL: process.env.OKX_WS_URL,
    OKX_ACCOUNT_MODE: process.env.OKX_ACCOUNT_MODE,
    REDIS_URL: process.env.REDIS_URL,
    DB_FILE_NAME: process.env.DB_FILE_NAME,
    DB_MIGRATIONS_DIR: process.env.DB_MIGRATIONS_DIR,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    APP_URL: process.env.APP_URL,
    AUTO_EXECUTE_ENABLED: process.env.AUTO_EXECUTE_ENABLED,
    AUTONOMOUS_TRADING_ENABLED: process.env.AUTONOMOUS_TRADING_ENABLED,
    AUTONOMOUS_SYMBOL_SELECTION: process.env.AUTONOMOUS_SYMBOL_SELECTION,
    AUTONOMOUS_SYMBOL: process.env.AUTONOMOUS_SYMBOL,
    AUTONOMOUS_SYMBOLS: process.env.AUTONOMOUS_SYMBOLS,
    AUTONOMOUS_QUOTE_CURRENCIES: process.env.AUTONOMOUS_QUOTE_CURRENCIES,
    AUTONOMOUS_QUOTE_CURRENCY: process.env.AUTONOMOUS_QUOTE_CURRENCY,
    AUTONOMOUS_SYMBOL_LIMIT: process.env.AUTONOMOUS_SYMBOL_LIMIT,
    AUTONOMOUS_TIMEFRAME: process.env.AUTONOMOUS_TIMEFRAME,
    AUTONOMOUS_INTERVAL_MS: process.env.AUTONOMOUS_INTERVAL_MS,
    AUTONOMOUS_COOLDOWN_MS: process.env.AUTONOMOUS_COOLDOWN_MS,
    LIVE_TRADING_BUDGET_USD: process.env.LIVE_TRADING_BUDGET_USD,
    MAX_POSITION_USD: process.env.MAX_POSITION_USD,
    MAX_BALANCE_USAGE_PCT: process.env.MAX_BALANCE_USAGE_PCT,
    MIN_TRADE_NOTIONAL: process.env.MIN_TRADE_NOTIONAL,
    AUTONOMY_MAX_SYMBOL_ALLOCATION_PCT:
      process.env.AUTONOMY_MAX_SYMBOL_ALLOCATION_PCT,
    MAX_SYMBOL_ALLOCATION_PCT: process.env.MAX_SYMBOL_ALLOCATION_PCT,
    MAX_DAILY_TRADES: process.env.MAX_DAILY_TRADES,
    MIN_CONFIDENCE_THRESHOLD: process.env.MIN_CONFIDENCE_THRESHOLD,
    MIN_DIRECTIONAL_EDGE_SCORE: process.env.MIN_DIRECTIONAL_EDGE_SCORE,
    MIN_MARKET_QUALITY_SCORE: process.env.MIN_MARKET_QUALITY_SCORE,
    MIN_NET_EDGE_BPS: process.env.MIN_NET_EDGE_BPS,
    MIN_REWARD_RISK: process.env.MIN_REWARD_RISK,
    EXPECTED_FEE_BPS: process.env.EXPECTED_FEE_BPS,
    AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_THRESHOLD:
      process.env.AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_THRESHOLD,
    AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_WINDOW_MS:
      process.env.AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_WINDOW_MS,
    POSITION_MONITOR_ENABLED: process.env.POSITION_MONITOR_ENABLED,
    POSITION_MONITOR_INTERVAL_MS: process.env.POSITION_MONITOR_INTERVAL_MS,
    TRAILING_STOP_ENABLED: process.env.TRAILING_STOP_ENABLED,
    TRAILING_STOP_DISTANCE_PCT: process.env.TRAILING_STOP_DISTANCE_PCT,
    CRON_SECRET: process.env.CRON_SECRET,
    TELEMETRY_TOKEN: process.env.TELEMETRY_TOKEN,
    ALLOW_SYNTHETIC_MARKET_FALLBACK:
      process.env.ALLOW_SYNTHETIC_MARKET_FALLBACK,
    REQUIRE_REALTIME_MARKET_DATA: process.env.REQUIRE_REALTIME_MARKET_DATA,
    MARKET_TICKER_STALE_MS: process.env.MARKET_TICKER_STALE_MS,
    MARKET_ORDERBOOK_STALE_MS: process.env.MARKET_ORDERBOOK_STALE_MS,
    MARKET_REST_REFRESH_MS: process.env.MARKET_REST_REFRESH_MS,
    MARKET_CANDLE_REFRESH_MS: process.env.MARKET_CANDLE_REFRESH_MS,
    OKX_ACCOUNT_CACHE_TTL_MS: process.env.OKX_ACCOUNT_CACHE_TTL_MS,
    OKX_ACCOUNT_STALE_FALLBACK_MS: process.env.OKX_ACCOUNT_STALE_FALLBACK_MS,
    SWARM_DIAGNOSTIC_VOTE_TIMEOUT_MS:
      process.env.SWARM_DIAGNOSTIC_VOTE_TIMEOUT_MS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
