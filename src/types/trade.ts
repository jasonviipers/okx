import type { AIMode } from "@/lib/configs/models";
import type { DecisionSource, RejectionReason, TradeSignal } from "./swarm";

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
  notionalUsd?: number;
  price?: number; // limit price (undefined for market orders)
  filledPrice?: number;
  referencePrice?: number;
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
  cashAvailableUsd: number;
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

export interface TradeDecisionSnapshot {
  signal: TradeSignal;
  directionalSignal: TradeSignal;
  decision: TradeSignal;
  confidence: number;
  agreement: number;
  executionEligible: boolean;
  decisionSource?: DecisionSource;
  expectedNetEdgeBps?: number;
  marketQualityScore?: number;
  riskFlags?: string[];
  featureSummary?: Record<string, number>;
  rejectionReasons: RejectionReason[];
  validatedAt?: string;
}

export interface TradeExecutionContext {
  referencePrice?: number;
  targetNotionalUsd?: number;
  normalizedSize?: number;
  expectedNetEdgeBps?: number;
  marketQualityScore?: number;
  stopLoss?: number | null;
  takeProfitLevels?: number[];
  trailingStopDistancePct?: number;
  positionOrderId?: string;
  exitReason?:
    | "take_profit_1"
    | "take_profit_2"
    | "take_profit_3"
    | "stop_loss"
    | "trailing_stop";
  exitTargetIndex?: number;
  remainingSizeAfterExit?: number;
}

export interface TradeOutcomeWindow {
  horizonMinutes: number;
  targetTime: string;
  observedAt?: string;
  markPrice?: number;
  signedReturnBps?: number;
  pnlUsd?: number;
  pnlPct?: number;
}

export interface TradePerformanceMetrics {
  referencePrice?: number;
  filledPrice?: number;
  realizedSlippageBps?: number;
  realizedSlippageUsd?: number;
  latestMarkPrice?: number;
  latestObservedAt?: string;
  latestSignedReturnBps?: number;
  latestPnlUsd?: number;
  latestPnlPct?: number;
  outcomeWindows: TradeOutcomeWindow[];
}

export interface TradeExecutionRequest {
  signal: TradeSignal;
  symbol: string;
  size: number;
  price?: number;
  mode: AIMode;
  confirmed?: boolean;
  decisionSnapshot?: TradeDecisionSnapshot;
  executionContext?: TradeExecutionContext;
}

export interface TradeExecutionResult {
  success: boolean;
  order?: Order;
  error?: string;
  executedAt: string;
  simulated?: boolean;
  accountMode?: AccountMode;
}
