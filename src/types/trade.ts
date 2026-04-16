import type { AIMode } from "@/lib/configs/models";
import type { TradeSignal } from "./swarm";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "pending" | "filled" | "cancelled" | "rejected";
export type AccountMode = "live" | "paper";

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  size: number;
  price?: number; // limit price (undefined for market orders)
  filledPrice?: number;
  status: OrderStatus;
  createdAt: string; // ISO timestamp
  filledAt?: string; // ISO timestamp
  okxOrderId?: string; // OKX order ID
  accountMode?: AccountMode;
}

export interface Position {
  symbol: string;
  side: OrderSide;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number; // unrealized P&L
  pnlPercent: number;
  openedAt: string; // ISO timestamp
}

export interface AccountAssetBalance {
  currency: string;
  equity: number;
  availableBalance: number;
  availableEquity: number;
  usdValue: number;
  unrealizedPnl: number;
}

export interface SpotBuyingPower {
  symbol?: string;
  quoteCurrency?: string;
  baseCurrency?: string;
  buy: number;
  sell: number;
}

export interface AccountOverview {
  totalEquity: number;
  availableEquity: number;
  adjustedEquity: number;
  isoEquity: number;
  unrealizedPnl: number;
  marginRatio?: number;
  notionalUsd?: number;
  buyingPower: SpotBuyingPower;
  tradingBalances: AccountAssetBalance[];
  fundingBalances: AccountAssetBalance[];
  accountMode: AccountMode;
  warning?: string;
  updatedAt: string;
}

export interface TradeExecutionRequest {
  signal: TradeSignal;
  symbol: string;
  size: number;
  price?: number;
  mode: AIMode;
  confirmed?: boolean;
}

export interface TradeExecutionResult {
  success: boolean;
  order?: Order;
  error?: string;
  executedAt: string;
  simulated?: boolean;
  accountMode?: AccountMode;
}
