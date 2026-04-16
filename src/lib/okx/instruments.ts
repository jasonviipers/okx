import "server-only";

import { OKX_ENDPOINTS } from "@/lib/configs/okx";
import { okxPublicGet } from "@/lib/okx/client";

interface OkxInstrumentRow {
  instId: string;
  instType?: string;
  quoteCcy?: string;
  tickSz: string;
  lotSz: string;
  minSz: string;
  state?: string;
}

export interface InstrumentRules {
  symbol: string;
  tickSize: number;
  lotSize: number;
  minSize: number;
  state: string;
}

const DEFAULT_AUTONOMOUS_SYMBOLS = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "BNB-USDT",
  "XRP-USDT",
  "ADA-USDT",
  "DOGE-USDT",
  "LINK-USDT",
] as const;

function toNumber(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getInstrumentRules(
  symbol: string,
): Promise<InstrumentRules> {
  const [row] = await okxPublicGet<OkxInstrumentRow>(
    OKX_ENDPOINTS.instruments,
    new URLSearchParams({
      instType: "SPOT",
      instId: symbol,
    }),
  );

  return {
    symbol,
    tickSize: toNumber(row?.tickSz, 0.00000001),
    lotSize: toNumber(row?.lotSz, 0.00000001),
    minSize: toNumber(row?.minSz, 0),
    state: row?.state ?? "live",
  };
}

export function normalizeOrderSize(size: number, lotSize: number): number {
  if (lotSize <= 0) {
    return size;
  }

  return Math.floor(size / lotSize) * lotSize;
}

function parseSymbolList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function listSpotInstruments(quoteCurrency = "USDT") {
  const rows = await okxPublicGet<OkxInstrumentRow>(
    OKX_ENDPOINTS.instruments,
    new URLSearchParams({
      instType: "SPOT",
    }),
  );

  return rows
    .filter(
      (row) =>
        row.instId &&
        (row.state ?? "live") === "live" &&
        (row.quoteCcy?.toUpperCase() ??
          row.instId.split("-")[1]?.toUpperCase()) ===
          quoteCurrency.toUpperCase(),
    )
    .map((row) => row.instId);
}

export async function getAutonomousSymbolUniverse(): Promise<string[]> {
  const explicit = parseSymbolList(process.env.AUTONOMOUS_SYMBOLS);
  if (explicit.length > 0) {
    return explicit;
  }

  const limit = Math.max(
    1,
    Math.min(20, parseNumber(process.env.AUTONOMOUS_SYMBOL_LIMIT, 8)),
  );
  return [...DEFAULT_AUTONOMOUS_SYMBOLS].slice(0, limit);
}
