import "server-only";

import { OKX_ENDPOINTS } from "@/lib/configs/okx";
import { okxPublicGet } from "@/lib/okx/client";

interface OkxInstrumentRow {
  instId: string;
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
