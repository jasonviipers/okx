import "server-only";

import { AI_MODE_CONFIGS } from "@/lib/configs/models";
import {
  getOkxAccountModeLabel,
  hasOkxTradingCredentials,
} from "@/lib/configs/okx";
import { placeOrder } from "@/lib/okx/orders";
import { recordTradeExecution } from "@/lib/persistence/history";
import type { TradeExecutionRequest } from "@/types/trade";

export class TradeExecutionServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TradeExecutionServiceError";
    this.status = status;
  }
}

export async function executeTradeRequest(input: TradeExecutionRequest) {
  const modeConfig = AI_MODE_CONFIGS[input.mode];
  if (!modeConfig) {
    throw new TradeExecutionServiceError(`Invalid AI mode: ${input.mode}`, 400);
  }

  if (!modeConfig.autoExecute && !input.confirmed) {
    throw new TradeExecutionServiceError(
      `Mode '${input.mode}' requires human confirmation before execution.`,
      403,
    );
  }

  if (input.signal === "HOLD") {
    throw new TradeExecutionServiceError("Cannot execute HOLD signal", 400);
  }

  const order = await placeOrder({
    symbol: input.symbol,
    marketType: input.marketType,
    side: input.signal === "BUY" ? "buy" : "sell",
    type: input.price ? "limit" : "market",
    size: input.size,
    price: input.price,
    tdMode: input.executionContext?.tdMode,
    posSide: input.executionContext?.posSide,
    reduceOnly: input.executionContext?.reduceOnly,
  });

  await recordTradeExecution(order, {
    decisionSnapshot: input.decisionSnapshot,
    executionContext: input.executionContext,
  });

  return {
    order,
    simulated: !hasOkxTradingCredentials(),
    accountMode: getOkxAccountModeLabel(),
  };
}
