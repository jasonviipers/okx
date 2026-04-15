"use client";

import { useCallback, useEffect, useState } from "react";
import { CandleChart } from "@/components/market/CandleChart";
import { OrderBook } from "@/components/market/OrderBook";
import { TickerBar } from "@/components/market/TickerBar";
import { AgentCard } from "@/components/swarm/AgentCard";
import { ConsensusPanel } from "@/components/swarm/ConsensusPanel";
import { SwarmVoteChart } from "@/components/swarm/SwarmVoteChart";
import { PositionList } from "@/components/trade/PositionList";
import { CommandBar } from "@/components/ui/CommandBar";
import { type AIMode, DEFAULT_AI_MODE } from "@/lib/configs/models";
import type {
  Candle,
  OKXTicker,
  OrderBook as OrderBookType,
} from "@/types/market";
import type { ConsensusResult } from "@/types/swarm";
import type { Position } from "@/types/trade";

const DEFAULT_SYMBOL = "BTC-USDT";
const DEFAULT_TIMEFRAME = "1H";

export default function DashboardPage() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [ticker, setTicker] = useState<OKXTicker | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [orderbook, setOrderbook] = useState<OrderBookType | null>(null);
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [mode] = useState<AIMode>(DEFAULT_AI_MODE);

  const fetchMarketData = useCallback(async () => {
    try {
      const [tickerRes, candlesRes, positionsRes] = await Promise.all([
        fetch(`/api/market/ticker?symbol=${symbol}`),
        fetch(
          `/api/market/candles?symbol=${symbol}&timeframe=${DEFAULT_TIMEFRAME}&limit=50`,
        ),
        fetch("/api/trade/positions"),
      ]);

      const tickerData = await tickerRes.json();
      const candlesData = await candlesRes.json();
      const positionsData = await positionsRes.json();

      if (tickerData.ticker) setTicker(tickerData.ticker);
      if (candlesData.candles) setCandles(candlesData.candles);
      if (positionsData.positions) setPositions(positionsData.positions);
    } catch (error) {
      console.error("Failed to fetch market data:", error);
    }
  }, [symbol]);

  const runSwarmAnalysis = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/swarm/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe: DEFAULT_TIMEFRAME }),
      });

      const data = await response.json();
      if (data.consensus) {
        setConsensus(data.consensus);
        setTicker(data.marketContext?.ticker ?? null);
        setCandles(data.marketContext?.candles ?? []);
        setOrderbook(data.marketContext?.orderbook ?? null);
      }
    } catch (error) {
      console.error("Swarm analysis failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTradeExecution = async () => {
    if (!consensus || consensus.signal === "HOLD") return;

    setTradeLoading(true);
    try {
      const response = await fetch("/api/trade/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: consensus.signal,
          symbol,
          size: 0.001,
          mode,
          confirmed: mode !== "ai_only",
        }),
      });

      const data = await response.json();
      if (data.success) {
        console.log("Trade executed:", data.order);
      }
    } catch (error) {
      console.error("Trade execution failed:", error);
    } finally {
      setTradeLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
  }, [fetchMarketData]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <CommandBar
        symbol={symbol}
        onSymbolChange={setSymbol}
        onRefresh={fetchMarketData}
        onAnalyze={runSwarmAnalysis}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto p-1">
        <div className="grid grid-cols-1 gap-px">
          <TickerBar ticker={ticker} />

          <div
            className="bloomberg-grid grid-cols-1 lg:grid-cols-[2fr_1fr]"
            style={{ display: "grid" }}
          >
            <CandleChart candles={candles} />
            {orderbook ? (
              <OrderBook orderbook={orderbook} />
            ) : (
              <div className="bloomberg-panel hidden lg:flex items-center justify-center">
                <span className="text-[10px] text-[var(--muted-foreground)] uppercase">
                  — Run analysis for orderbook —
                </span>
              </div>
            )}
          </div>

          {consensus && (
            <div className="grid grid-cols-1 gap-px">
              <div
                className="bloomberg-grid grid-cols-1 lg:grid-cols-[1fr_1fr]"
                style={{ display: "grid" }}
              >
                <ConsensusPanel
                  consensus={consensus}
                  mode={mode}
                  onExecute={handleTradeExecution}
                  loading={tradeLoading}
                />
                <SwarmVoteChart votes={consensus.votes} />
              </div>

              <div
                className="bloomberg-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
                style={{ display: "grid" }}
              >
                {consensus.votes.map((vote, i) => (
                  <AgentCard
                    key={`${vote.model}-${vote.role}`}
                    vote={vote}
                    index={i}
                  />
                ))}
              </div>
            </div>
          )}

          <PositionList positions={positions} />

          <div className="bloomberg-panel">
            <div className="flex items-center gap-4 text-[9px] text-[var(--muted-foreground)] py-0.5">
              <span>AI Trading Swarm v0.1</span>
              <span>│</span>
              <span>Mode: {mode}</span>
              <span>│</span>
              <span>Symbol: {symbol}</span>
              <span>│</span>
              <span>TF: {DEFAULT_TIMEFRAME}</span>
              <span className="ml-auto">
                /SYMBOL &lt;instId&gt; │ /REFRESH │ /ANALYZE
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
