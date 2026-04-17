"use client";

import React from "react";
import type { StoredSwarmRun, StoredTradeExecution } from "@/types/history";
import type { AccountOverview, Position } from "@/types/trade";
import { formatMs, formatTime } from "./swarm-panels";

const SIGNAL_COLORS: Record<string, string> = {
  BUY: "text-terminal-green",
  SELL: "text-terminal-red",
  HOLD: "text-terminal-amber",
};

function formatUsd(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function AccountPanel({ overview }: { overview: AccountOverview | null }) {
  if (!overview) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">NO DATA</div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="terminal-text text-muted-foreground">EQUITY</span>
        <span className="terminal-text font-bold text-terminal-green">
          {formatUsd(overview.totalEquity)}
        </span>
        <span className="terminal-text text-muted-foreground">AVAIL</span>
        <span className="terminal-text">
          {formatUsd(overview.availableEquity)}
        </span>
        <span className="terminal-text text-muted-foreground">ADJ</span>
        <span className="terminal-text">
          {formatUsd(overview.adjustedEquity)}
        </span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="terminal-text text-muted-foreground">UNRL P&L</span>
        <span
          className={`terminal-text ${overview.unrealizedPnl >= 0 ? "text-terminal-green" : "text-terminal-red"}`}
        >
          {formatUsd(overview.unrealizedPnl)}
        </span>
        {overview.marginRatio !== undefined && (
          <>
            <span className="terminal-text text-muted-foreground">MARGIN</span>
            <span className="terminal-text">
              {(overview.marginRatio * 100).toFixed(2)}%
            </span>
          </>
        )}
        {overview.notionalUsd !== undefined && (
          <>
            <span className="terminal-text text-muted-foreground">
              NOTIONAL
            </span>
            <span className="terminal-text">
              {formatUsd(overview.notionalUsd)}
            </span>
          </>
        )}
      </div>
      {overview.buyingPower && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="terminal-text text-muted-foreground">BUY PWR</span>
          <span className="terminal-text text-terminal-green">
            {formatUsd(overview.buyingPower.buy)}
          </span>
          <span className="terminal-text text-muted-foreground">SELL PWR</span>
          <span className="terminal-text text-terminal-red">
            {formatUsd(overview.buyingPower.sell)}
          </span>
          {overview.buyingPower.baseCurrency && (
            <span className="terminal-text-xs text-muted-foreground">
              {overview.buyingPower.baseCurrency}
            </span>
          )}
        </div>
      )}
      {overview.tradingBalances.length > 0 && (
        <div className="mt-1">
          <div className="data-header">TRADING BALANCES</div>
          <div className="grid grid-cols-[auto_auto_auto] gap-x-2 gap-y-0 ml-1">
            {overview.tradingBalances.map((b) => (
              <React.Fragment key={b.currency}>
                <span className="terminal-text-xs text-terminal-cyan">
                  {b.currency}
                </span>
                <span className="terminal-text-xs text-right tabular-nums">
                  {formatUsd(b.equity)}
                </span>
                <span className="terminal-text-xs text-muted-foreground text-right tabular-nums">
                  avail:{formatUsd(b.availableBalance)}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {overview.fundingBalances.length > 0 && (
        <div className="mt-1">
          <div className="data-header">FUNDING</div>
          <div className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0 ml-1">
            {overview.fundingBalances.map((b) => (
              <React.Fragment key={b.currency}>
                <span className="terminal-text-xs text-terminal-cyan">
                  {b.currency}
                </span>
                <span className="terminal-text-xs tabular-nums">
                  {formatUsd(b.usdValue)}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {overview.warning && (
        <div className="terminal-text-xs text-terminal-amber mt-1">
          {overview.warning}
        </div>
      )}
      <div className="terminal-text-xxs text-muted-foreground mt-1">
        MODE:{overview.accountMode} {formatTime(overview.updatedAt)}
      </div>
    </div>
  );
}

function PositionsPanel({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">
        NO OPEN POSITIONS
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      <div className="data-header">POSITIONS ({positions.length})</div>
      {positions.map((pos) => (
        <div
          key={pos.symbol}
          className="flex items-baseline gap-2 terminal-text-xs"
        >
          <span className="text-terminal-cyan w-[5rem] truncate">
            {pos.symbol}
          </span>
          <span
            className={`w-[2.5rem] ${pos.side === "buy" ? "text-terminal-green" : "text-terminal-red"}`}
          >
            {pos.side.toUpperCase()}
          </span>
          <span className="tabular-nums">{pos.size}</span>
          <span className="text-muted-foreground">
            @{pos.entryPrice.toFixed(2)}
          </span>
          <span className="text-muted-foreground">
            now:{pos.currentPrice.toFixed(2)}
          </span>
          <span
            className={
              pos.pnl >= 0 ? "text-terminal-green" : "text-terminal-red"
            }
            tabular-nums
          >
            {pos.pnlPercent >= 0 ? "+" : ""}
            {pos.pnlPercent.toFixed(2)}%
          </span>
          <span
            className={
              pos.pnl >= 0 ? "text-terminal-green" : "text-terminal-red"
            }
            tabular-nums
          >
            {formatUsd(pos.pnl)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TradeHistoryPanel({ entries }: { entries: StoredTradeExecution[] }) {
  if (entries.length === 0) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">NO TRADES</div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      <div className="data-header">TRADES ({entries.length})</div>
      {entries.slice(0, 15).map((entry) => (
        <div
          key={entry.id}
          className="flex items-baseline gap-2 terminal-text-xs"
        >
          <span className="text-muted-foreground">
            {formatTime(entry.timestamp)}
          </span>
          <span className="text-terminal-cyan w-[5rem] truncate">
            {entry.symbol}
          </span>
          <span
            className={`w-[2.5rem] ${entry.order.side === "buy" ? "text-terminal-green" : "text-terminal-red"}`}
          >
            {entry.order.side.toUpperCase()}
          </span>
          <span className="tabular-nums">{entry.order.size}</span>
          {entry.order.filledPrice !== undefined && (
            <span className="text-muted-foreground">
              @{entry.order.filledPrice.toFixed(2)}
            </span>
          )}
          <span
            className={
              entry.success ? "text-terminal-green" : "text-terminal-red"
            }
          >
            {entry.success ? "OK" : "FAIL"}
          </span>
          {entry.order.okxOrderId && (
            <span className="text-muted-foreground truncate max-w-[4rem]">
              {entry.order.okxOrderId}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function SwarmHistoryPanel({ entries }: { entries: StoredSwarmRun[] }) {
  if (entries.length === 0) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">
        NO HISTORY
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      <div className="data-header">SWARM RUNS ({entries.length})</div>
      {entries.slice(0, 15).map((entry) => {
        const c = entry.consensus;
        const decision = c.decision ?? c.signal;
        return (
          <div key={entry.id} className="flex flex-col gap-px terminal-text-xs">
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground">
                {formatTime(entry.timestamp)}
              </span>
              <span className="text-terminal-cyan w-[5rem] truncate">
                {entry.symbol}
              </span>
              <span
                className={SIGNAL_COLORS[decision] ?? "text-muted-foreground"}
              >
                {decision}
              </span>
              {c.directionalSignal !== decision && (
                <span className="text-muted-foreground">
                  raw:{c.directionalSignal}
                </span>
              )}
              <span className="text-muted-foreground tabular-nums">
                {(c.confidence * 100).toFixed(0)}%
              </span>
              <span className="text-muted-foreground tabular-nums">
                agr:{(c.agreement * 100).toFixed(0)}%
              </span>
              {c.blocked && <span className="text-terminal-red">BLK</span>}
              <span className="text-muted-foreground">
                {formatMs(entry.totalElapsedMs)}
              </span>
              {entry.cached && (
                <span className="text-terminal-dim">cached</span>
              )}
            </div>
            {c.rejectionReasons.length > 0 && (
              <div className="text-terminal-red">
                {c.rejectionReasons[0]?.summary}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export {
  AccountPanel,
  PositionsPanel,
  TradeHistoryPanel,
  SwarmHistoryPanel,
  formatUsd,
};
