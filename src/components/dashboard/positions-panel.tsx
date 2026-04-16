"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccount, getPositions } from "@/lib/api/client";
import type { SourceHealth } from "@/types/api";
import type { AccountOverview, Position } from "@/types/trade";

interface PositionsPanelProps {
  symbol: string;
}

export function PositionsPanel({ symbol }: PositionsPanelProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [positionHealth, setPositionHealth] = useState<SourceHealth | null>(
    null,
  );
  const [accountHealth, setAccountHealth] = useState<SourceHealth | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      const [positionsResponse, accountResponse] = await Promise.all([
        getPositions(),
        getAccount(symbol),
      ]);

      setPositions(positionsResponse.data.positions ?? []);
      setOverview(accountResponse.data.overview ?? null);
      setPositionHealth(positionsResponse.sourceHealth?.positions ?? null);
      setAccountHealth(accountResponse.sourceHealth?.account ?? null);
      setError(null);
    } catch {
      setError("Connection error");
    }
  }, [symbol]);

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 15000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const accountWarning =
    overview?.warning ?? accountHealth?.warning ?? positionHealth?.warning;

  const renderBalanceTable = (
    title: string,
    balances: AccountOverview["tradingBalances"],
    emptyLabel: string,
    usdLabel: string,
  ) => (
    <div className="space-y-1">
      <div className="text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {balances.length > 0 ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border/50">
              <th className="terminal-cell terminal-cell-header text-left">
                CCY
              </th>
              <th className="terminal-cell terminal-cell-header text-right">
                EQ
              </th>
              <th className="terminal-cell terminal-cell-header text-right">
                AVAIL
              </th>
              <th className="terminal-cell terminal-cell-header text-right">
                {usdLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {balances.map((balance) => (
              <tr
                key={`${title}-${balance.currency}`}
                className="border-b border-border/30"
              >
                <td className="terminal-cell font-bold text-primary">
                  {balance.currency}
                </td>
                <td className="terminal-cell text-right">
                  {balance.equity.toFixed(4)}
                </td>
                <td className="terminal-cell text-right">
                  {balance.availableBalance.toFixed(4)}
                </td>
                <td className="terminal-cell text-right">
                  {usdLabel === "USD"
                    ? balance.usdValue.toFixed(2)
                    : balance.availableEquity.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </div>
  );

  return (
    <div className="bloomberg-panel h-full">
      <div className="bloomberg-header">
        <span>POSITIONS [{positions.length}]</span>
        <span
          className={`text-[0.5625rem] font-bold ${totalPnl >= 0 ? "data-positive" : "data-negative"}`}
        >
          PnL: {totalPnl >= 0 ? "+" : ""}
          {totalPnl.toFixed(2)}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-1">
        {overview && (
          <div className="border border-border mb-1">
            <div className="bg-secondary px-2 py-0.5 border-b border-border">
              <span className="text-[0.5625rem] text-muted-foreground uppercase">
                Account: {(accountHealth?.source ?? "unknown").toUpperCase()} |
                Positions: {(positionHealth?.source ?? "unknown").toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border border-b border-border">
              <div className="data-cell flex items-center justify-between bg-card">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-bold text-primary">
                  {overview.accountMode}
                </span>
              </div>
              <div className="data-cell flex items-center justify-between bg-card">
                <span className="text-muted-foreground">Spot Buy</span>
                <span className="font-bold text-foreground">
                  {overview.buyingPower.buy.toFixed(2)}{" "}
                  {overview.buyingPower.quoteCurrency ?? ""}
                </span>
              </div>
              <div className="data-cell flex items-center justify-between bg-card">
                <span className="text-muted-foreground">Trading Eq</span>
                <span className="font-bold text-foreground">
                  {overview.totalEquity.toFixed(2)}
                </span>
              </div>
              <div className="data-cell flex items-center justify-between bg-card">
                <span className="text-muted-foreground">Trading Avail</span>
                <span className="font-bold text-foreground">
                  {overview.availableEquity.toFixed(2)}
                </span>
              </div>
              <div className="data-cell flex items-center justify-between bg-card">
                <span className="text-muted-foreground">Spot Sell</span>
                <span className="font-bold text-foreground">
                  {overview.buyingPower.sell.toFixed(6)}{" "}
                  {overview.buyingPower.baseCurrency ?? ""}
                </span>
              </div>
              <div className="data-cell flex items-center justify-between bg-card">
                <span className="text-muted-foreground">Selected Pair</span>
                <span className="font-bold text-primary">
                  {overview.buyingPower.symbol ?? symbol}
                </span>
              </div>
            </div>
            {accountWarning && (
              <div className="px-2 py-0.5 text-[0.5625rem] uppercase tracking-wider data-negative">
                {accountWarning}
              </div>
            )}
          </div>
        )}

        {positions.length === 0 ? (
          <div className="p-2 text-center text-[0.5625rem] text-muted-foreground uppercase tracking-wider">
            {error ? `ERR: ${error}` : "NO OPEN POSITIONS"}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="data-header text-left">SYM</th>
                <th className="data-header text-center">SIDE</th>
                <th className="data-header text-right">SIZE</th>
                <th className="data-header text-right">ENTRY</th>
                <th className="data-header text-right">MARK</th>
                <th className="data-header text-right">PnL</th>
                <th className="data-header text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.symbol} className="border-b border-border/50">
                  <td className="data-cell font-bold text-foreground">
                    {p.symbol.replace("-USDT", "")}
                  </td>
                  <td className="data-cell text-center">
                    <span
                      className={`text-[0.5625rem] font-bold px-1 ${p.side === "buy" ? "data-positive" : "data-negative"}`}
                    >
                      {p.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="data-cell text-right">{p.size.toFixed(4)}</td>
                  <td className="data-cell text-right">
                    {p.entryPrice.toFixed(2)}
                  </td>
                  <td className="data-cell text-right">
                    {p.currentPrice.toFixed(2)}
                  </td>
                  <td
                    className={`data-cell text-right font-bold ${p.pnl >= 0 ? "data-positive" : "data-negative"}`}
                  >
                    {p.pnl >= 0 ? "+" : ""}
                    {p.pnl.toFixed(2)}
                  </td>
                  <td
                    className={`data-cell text-right font-bold ${p.pnlPercent >= 0 ? "data-positive" : "data-negative"}`}
                  >
                    {p.pnlPercent >= 0 ? "+" : ""}
                    {p.pnlPercent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
