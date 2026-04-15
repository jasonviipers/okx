import type { AIMode } from "@/lib/configs/models";
import type { TradeSignal } from "./swarm";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "pending" | "filled" | "cancelled" | "rejected";

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
}
