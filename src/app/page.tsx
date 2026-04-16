"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { CommandBar } from "@/components/dashboard/command-bar";
import { StatusBar } from "@/components/dashboard/status-bar";
import { TickerBar } from "@/components/dashboard/ticker-bar";
import { MarketPanel } from "@/components/dashboard/market-panel";
import { SwarmPanel } from "@/components/dashboard/swarm-panel";
import { VolumeChart } from "@/components/dashboard/volume-chart";
import { PositionsPanel } from "@/components/dashboard/positions-panel";
import { FeedPanel, type FeedEntry } from "@/components/dashboard/feed-panel";

const COMMANDS = [
  { cmd: "analyze", desc: "Run swarm analysis" },
  { cmd: "buy", desc: "Execute buy order" },
  { cmd: "sell", desc: "Execute sell order" },
  { cmd: "positions", desc: "Show open positions" },
  { cmd: "ticker", desc: "Fetch latest ticker" },
  { cmd: "help", desc: "Show available commands" },
  { cmd: "clear", desc: "Clear feed" },
];

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 16;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-4"
      preserveAspectRatio="none"
      role="img"
      aria-label="Sparkline chart"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function CompactMetric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex flex-col border border-border bg-card">
      <div className="terminal-text-xxs text-muted-foreground border-b border-border px-1.5 py-px">
        {label}
      </div>
      <div className={`terminal-text px-1.5 py-0.5 font-bold ${color}`}>
        {value}
      </div>
      {sub && (
        <div className="terminal-text-xxs text-muted-foreground border-t border-border px-1.5 py-px">
          {sub}
        </div>
      )}
    </div>
  );
}

function IndicatorRow({
  label,
  value,
  signal,
}: {
  label: string;
  value: string;
  signal: "bullish" | "bearish" | "neutral";
}) {
  const color =
    signal === "bullish"
      ? "data-positive"
      : signal === "bearish"
        ? "data-negative"
        : "data-neutral";
  const arrow = signal === "bullish" ? "▲" : signal === "bearish" ? "▼" : "◆";
  return (
    <tr className="border-b border-border">
      <td className="terminal-text-xxs text-muted-foreground px-1.5 py-px border-r border-border w-[80px]">
        {label}
      </td>
      <td
        className={`terminal-text px-1.5 py-px font-bold ${color} w-[20px] text-center border-r border-border`}
      >
        {arrow}
      </td>
      <td className={`terminal-text px-1.5 py-px text-right ${color}`}>
        {value}
      </td>
    </tr>
  );
}

function CompactOrderBook() {
  const asks = [
    { p: 104250.5, s: 0.234 },
    { p: 104248.0, s: 0.567 },
    { p: 104245.5, s: 1.234 },
    { p: 104242.0, s: 0.891 },
    { p: 104240.0, s: 2.1 },
  ];
  const bids = [
    { p: 104238.5, s: 0.456 },
    { p: 104236.0, s: 0.789 },
    { p: 104234.5, s: 1.567 },
    { p: 104232.0, s: 0.345 },
    { p: 104230.0, s: 0.678 },
  ];
  const maxSize = Math.max(...asks.map((a) => a.s), ...bids.map((b) => b.s));

  return (
    <div className="flex flex-col h-full">
      <div className="terminal-text-xxs text-muted-foreground border-b border-border px-1.5 py-px flex justify-between">
        <span>PRICE</span>
        <span>SIZE</span>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col justify-end">
        {asks.reverse().map((a) => (
          <div key={`a-${a.p}`} className="relative border-b border-border/30">
            <div
              className="absolute right-0 top-0 bottom-0 bg-terminal-red/10"
              style={{ width: `${(a.s / maxSize) * 100}%` }}
            />
            <div className="relative flex justify-between terminal-text-xxs px-1.5 py-px">
              <span className="data-negative">{a.p.toFixed(1)}</span>
              <span className="text-muted-foreground">{a.s.toFixed(3)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="terminal-text font-bold text-center py-px border-y border-border bg-secondary data-positive">
        104239.0
      </div>
      <div className="flex-1 overflow-hidden">
        {bids.map((b) => (
          <div key={`b-${b.p}`} className="relative border-b border-border/30">
            <div
              className="absolute right-0 top-0 bottom-0 bg-terminal-green/10"
              style={{ width: `${(b.s / maxSize) * 100}%` }}
            />
            <div className="relative flex justify-between terminal-text-xxs px-1.5 py-px">
              <span className="data-positive">{b.p.toFixed(1)}</span>
              <span className="text-muted-foreground">{b.s.toFixed(3)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapCell({
  label,
  intensity,
}: {
  label: string;
  intensity: number;
}) {
  const absInt = Math.min(Math.abs(intensity), 1);
  const bg =
    intensity >= 0
      ? `rgba(0, 212, 170, ${absInt * 0.3})`
      : `rgba(255, 68, 68, ${absInt * 0.3})`;
  const fg = intensity >= 0 ? "data-positive" : "data-negative";

  return (
    <div
      className="border border-border flex items-center justify-center terminal-text-xxs font-bold px-0.5 py-px"
      style={{ background: bg }}
    >
      <span className={fg}>{label}</span>
    </div>
  );
}

function CorrelationMatrix() {
  const pairs = ["BTC", "ETH", "SOL", "XRP", "DOGE"];
  const matrix: number[][] = [
    [1.0, 0.85, 0.72, 0.45, 0.38],
    [0.85, 1.0, 0.68, 0.52, 0.41],
    [0.72, 0.68, 1.0, 0.55, 0.62],
    [0.45, 0.52, 0.55, 1.0, 0.48],
    [0.38, 0.41, 0.62, 0.48, 1.0],
  ];

  return (
    <div className="h-full overflow-auto">
      <div
        className="grid gap-px bg-border"
        style={{ gridTemplateColumns: `40px repeat(${pairs.length}, 1fr)` }}
      >
        <div className="bg-card" />
        {pairs.map((p) => (
          <div
            key={p}
            className="terminal-text-xxs text-muted-foreground text-center bg-card py-px font-bold"
          >
            {p}
          </div>
        ))}
        {pairs.map((row, ri) => (
          <React.Fragment key={`row-${row}`}>
            <div className="terminal-text-xxs text-muted-foreground flex items-center justify-center bg-card font-bold border-r border-border">
              {row}
            </div>
            {pairs.map((col, ci) => (
              <HeatmapCell
                key={`${row}-${col}`}
                label={matrix[ri][ci].toFixed(2)}
                intensity={matrix[ri][ci] - 0.5}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function FundingRates() {
  const rates = [
    { sym: "BTC", rate: 0.01, next: "08:00", oi: "12.4B" },
    { sym: "ETH", rate: 0.0085, next: "08:00", oi: "5.2B" },
    { sym: "SOL", rate: -0.0052, next: "08:00", oi: "1.8B" },
    { sym: "XRP", rate: 0.0034, next: "08:00", oi: "890M" },
    { sym: "DOGE", rate: -0.0121, next: "08:00", oi: "430M" },
  ];

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="terminal-text-xxs text-muted-foreground text-left px-1.5 py-px">
              SYM
            </th>
            <th className="terminal-text-xxs text-muted-foreground text-right px-1.5 py-px">
              RATE
            </th>
            <th className="terminal-text-xxs text-muted-foreground text-right px-1.5 py-px">
              NEXT
            </th>
            <th className="terminal-text-xxs text-muted-foreground text-right px-1.5 py-px">
              OI
            </th>
          </tr>
        </thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.sym} className="border-b border-border/50">
              <td className="terminal-text-xxs text-primary font-bold px-1.5 py-px">
                {r.sym}
              </td>
              <td
                className={`terminal-text-xxs text-right px-1.5 py-px font-bold ${r.rate >= 0 ? "data-positive" : "data-negative"}`}
              >
                {r.rate >= 0 ? "+" : ""}
                {(r.rate * 100).toFixed(4)}%
              </td>
              <td className="terminal-text-xxs text-muted-foreground text-right px-1.5 py-px">
                {r.next}
              </td>
              <td className="terminal-text-xxs text-muted-foreground text-right px-1.5 py-px">
                {r.oi}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiquidationLevels() {
  const levels = [
    { price: 105000, side: "short" as const, amount: "23.5M", est: true },
    { price: 104500, side: "short" as const, amount: "18.2M", est: false },
    { price: 103800, side: "long" as const, amount: "31.4M", est: false },
    { price: 103200, side: "long" as const, amount: "45.8M", est: true },
    { price: 102500, side: "long" as const, amount: "67.1M", est: false },
  ];

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="terminal-text-xxs text-muted-foreground text-right px-1.5 py-px">
              PRICE
            </th>
            <th className="terminal-text-xxs text-muted-foreground text-center px-1.5 py-px">
              SIDE
            </th>
            <th className="terminal-text-xxs text-muted-foreground text-right px-1.5 py-px">
              AMT
            </th>
            <th className="terminal-text-xxs text-muted-foreground text-center px-1.5 py-px">
              EST
            </th>
          </tr>
        </thead>
        <tbody>
          {levels.map((l) => (
            <tr key={`liq-${l.price}`} className="border-b border-border/50">
              <td className="terminal-text-xxs text-right px-1.5 py-px font-bold">
                {l.price.toLocaleString()}
              </td>
              <td
                className={`terminal-text-xxs text-center px-1.5 py-px font-bold ${l.side === "long" ? "data-positive" : "data-negative"}`}
              >
                {l.side.toUpperCase()}
              </td>
              <td className="terminal-text-xxs text-right px-1.5 py-px">
                {l.amount}
              </td>
              <td className="terminal-text-xxs text-center px-1.5 py-px text-muted-foreground">
                {l.est ? "~" : "●"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MacroeconomicStrip() {
  const indicators = [
    { label: "DXY", value: "104.23", chg: -0.12, signal: "bearish" as const },
    { label: "VIX", value: "18.45", chg: 1.34, signal: "bearish" as const },
    { label: "TNX", value: "4.28%", chg: 0.02, signal: "neutral" as const },
    { label: "SPX", value: "5,432", chg: 0.45, signal: "bullish" as const },
    { label: "NDX", value: "19,234", chg: 0.67, signal: "bullish" as const },
    { label: "CL", value: "78.43", chg: -0.89, signal: "neutral" as const },
    { label: "GC", value: "2,412", chg: 0.34, signal: "bullish" as const },
  ];

  return (
    <div className="flex h-full">
      {indicators.map((ind, i) => {
        const color =
          ind.signal === "bullish"
            ? "data-positive"
            : ind.signal === "bearish"
              ? "data-negative"
              : "data-neutral";
        return (
          <div
            key={ind.label}
            className={`flex flex-col flex-1 border-r border-border ${i === indicators.length - 1 ? "" : ""}`}
          >
            <div className="terminal-text-xxs text-muted-foreground border-b border-border px-1.5 py-px flex justify-between">
              <span>{ind.label}</span>
              <span className={color}>
                {ind.chg >= 0 ? "+" : ""}
                {ind.chg.toFixed(2)}%
              </span>
            </div>
            <div
              className={`terminal-text px-1.5 py-0.5 font-bold ${color} text-center`}
            >
              {ind.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TechnicalSummary() {
  const indicators = [
    { label: "RSI(14)", value: "62.4", signal: "bullish" as const },
    { label: "MACD", value: "125.3", signal: "bullish" as const },
    { label: "STOCH", value: "78.1", signal: "neutral" as const },
    { label: "BB%B", value: "0.84", signal: "bearish" as const },
    { label: "ATR(14)", value: "842", signal: "neutral" as const },
    { label: "ADX", value: "34.2", signal: "bullish" as const },
    { label: "EMA20", value: "103,842", signal: "bullish" as const },
    { label: "EMA50", value: "102,456", signal: "bullish" as const },
    { label: "VWAP", value: "103,912", signal: "neutral" as const },
    { label: "OBV", value: "1.2M", signal: "bullish" as const },
    { label: "CMF", value: "0.08", signal: "neutral" as const },
    { label: "ICHIMOKU", value: "ABOVE", signal: "bullish" as const },
  ];

  const bullCount = indicators.filter((i) => i.signal === "bullish").length;
  const bearCount = indicators.filter((i) => i.signal === "bearish").length;
  const neuCount = indicators.filter((i) => i.signal === "neutral").length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-border">
        <div className="flex-1 border-r border-border flex items-center justify-center py-0.5">
          <span className="terminal-text-xxs data-positive font-bold">
            ▲ {bullCount} BULL
          </span>
        </div>
        <div className="flex-1 border-r border-border flex items-center justify-center py-0.5">
          <span className="terminal-text-xxs data-neutral font-bold">
            ◆ {neuCount} NEU
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center py-0.5">
          <span className="terminal-text-xxs data-negative font-bold">
            ▼ {bearCount} BEAR
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <tbody>
            {indicators.map((ind) => (
              <IndicatorRow
                key={ind.label}
                label={ind.label}
                value={ind.value}
                signal={ind.signal}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FearGreedGauge() {
  const value = 68;
  const label =
    value >= 80
      ? "EXTREME GREED"
      : value >= 60
        ? "GREED"
        : value >= 40
          ? "NEUTRAL"
          : value >= 20
            ? "FEAR"
            : "EXTREME FEAR";
  const color =
    value >= 60
      ? "data-positive"
      : value >= 40
        ? "text-terminal-amber"
        : "data-negative";

  return (
    <div className="h-full flex flex-col items-center justify-center gap-0.5">
      <div className="terminal-text-xxs text-muted-foreground">
        FEAR & GREED
      </div>
      <div className={`terminal-text font-bold ${color}`}>{value}</div>
      <div className="w-full h-1 bg-muted border border-border relative">
        <div
          className={`h-full ${value >= 60 ? "bg-terminal-green" : value >= 40 ? "bg-terminal-amber" : "bg-terminal-red"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <div className={`terminal-text-xxs font-bold ${color}`}>{label}</div>
    </div>
  );
}

function QuickMetrics() {
  const sparkData = [42, 45, 38, 51, 48, 53, 47, 55, 52, 58, 54, 61];
  return (
    <div className="grid grid-cols-4 gap-px bg-border h-full">
      <CompactMetric
        label="BTC.DOM"
        value="52.4%"
        sub="+0.3%"
        color="data-positive"
      />
      <CompactMetric
        label="STABLE.R"
        value="7.2%"
        sub="-0.1%"
        color="data-neutral"
      />
      <CompactMetric
        label="VOL 24H"
        value="$98.5B"
        sub="+12.3%"
        color="data-positive"
      />
      <div className="flex flex-col border border-border bg-card">
        <div className="terminal-text-xxs text-muted-foreground border-b border-border px-1.5 py-px">
          FG INDEX
        </div>
        <div className="flex-1 px-1 py-0.5">
          <MiniSparkline data={sparkData} color="var(--terminal-green)" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [timeframe, setTimeframe] = useState("1H");
  const [runTrigger, setRunTrigger] = useState(0);
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);
  const feedIdRef = useRef(0);

  const addFeed = useCallback((type: FeedEntry["type"], msg: string) => {
    const ts = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setFeedEntries((prev) =>
      [
        { ts, type, msg, id: `${Date.now()}-${feedIdRef.current++}` },
        ...prev,
      ].slice(0, 200),
    );
  }, []);

  useEffect(() => {
    addFeed("SYS", "DASHBOARD INITIALIZED");
    addFeed("SYS", `SYMBOL: ${symbol} | TF: ${timeframe}`);
  }, [addFeed, symbol, timeframe]);

  const handleCommand = useCallback(
    (cmd: string, args?: string) => {
      addFeed("CMD", `> ${cmd}${args ? ` ${args}` : ""}`);

      switch (cmd) {
        case "analyze":
          setRunTrigger((n) => n + 1);
          addFeed("SYS", `SWARM ANALYSIS TRIGGERED: ${symbol} ${timeframe}`);
          break;
        case "buy":
          addFeed("TRD", `BUY ORDER: ${args ?? symbol}`);
          break;
        case "sell":
          addFeed("TRD", `SELL ORDER: ${args ?? symbol}`);
          break;
        case "positions":
          addFeed("SYS", "POSITIONS REFRESH");
          break;
        case "ticker":
          addFeed("MKT", `TICKER: ${symbol}`);
          break;
        case "help":
          for (const c of COMMANDS) {
            addFeed("CMD", `${c.cmd.toUpperCase().padEnd(14)}${c.desc}`);
          }
          break;
        case "clear":
          setFeedEntries([]);
          break;
        default:
          addFeed("WRN", `UNKNOWN COMMAND: ${cmd}`);
      }
    },
    [addFeed, symbol, timeframe],
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <div className="fixed top-0 left-0 right-0 z-50">
        <CommandBar
          onCommand={handleCommand}
          symbol={symbol}
          setSymbol={setSymbol}
          timeframe={timeframe}
          setTimeframe={setTimeframe}
        />
      </div>

      <div className="flex flex-col h-full pt-7">
        <TickerBar />

        <div className="border-b border-border" style={{ height: "38px" }}>
          <MacroeconomicStrip />
        </div>

        <div
          className="flex-1 grid gap-px bg-border overflow-hidden"
          style={{
            gridTemplateColumns: "1fr 1fr 1fr",
            gridTemplateRows: "1fr 1fr 1fr",
          }}
        >
          <div className="overflow-hidden">
            <MarketPanel symbol={symbol} timeframe={timeframe} />
          </div>

          <div className="overflow-hidden">
            <SwarmPanel
              symbol={symbol}
              timeframe={timeframe}
              runTrigger={runTrigger}
            />
          </div>

          <div className="flex flex-col gap-px bg-border overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <div className="bloomberg-panel h-full">
                <div className="bloomberg-header">
                  <span>ORDER BOOK</span>
                  <span className="text-terminal-dim">L2</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CompactOrderBook />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="bloomberg-panel h-full">
                <div className="bloomberg-header">
                  <span>FUNDING RATES</span>
                  <span className="text-terminal-dim">PERP</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <FundingRates />
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden">
            <VolumeChart symbol={symbol} timeframe={timeframe} />
          </div>

          <div className="overflow-hidden">
            <PositionsPanel symbol={symbol} />
          </div>

          <div className="flex flex-col gap-px bg-border overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <div className="bloomberg-panel h-full">
                <div className="bloomberg-header">
                  <span>LIQUIDATION LEVELS</span>
                  <span className="text-terminal-dim">HEATMAP</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <LiquidationLevels />
                </div>
              </div>
            </div>
            <div className="overflow-hidden" style={{ height: "33%" }}>
              <div className="bloomberg-panel h-full">
                <div className="bloomberg-header">
                  <span>FEAR & GREED</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <FearGreedGauge />
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden">
            <div className="bloomberg-panel h-full flex flex-col">
              <div className="bloomberg-header">
                <span>TECHNICALS</span>
                <span className="text-terminal-dim">SUMMARY</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <TechnicalSummary />
              </div>
            </div>
          </div>

          <div className="overflow-hidden">
            <FeedPanel entries={feedEntries} />
          </div>

          <div className="flex flex-col gap-px bg-border overflow-hidden">
            <div className="overflow-hidden" style={{ height: "50%" }}>
              <div className="bloomberg-panel h-full flex flex-col">
                <div className="bloomberg-header">
                  <span>CORRELATION</span>
                  <span className="text-terminal-dim">30D</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CorrelationMatrix />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="bloomberg-panel h-full flex flex-col">
                <div className="bloomberg-header">
                  <span>MARKET METRICS</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <QuickMetrics />
                </div>
              </div>
            </div>
          </div>
        </div>

        <StatusBar />
      </div>
    </div>
  );
}
