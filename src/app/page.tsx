"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import {
  controlAutonomy,
  getAccount,
  getAutonomyStatus,
  getCandles,
  getConsensus,
  getMemoryRecent,
  getPositions,
  getRuntimeSystemStatus,
  getSwarmHistory,
  getTicker,
  getTradeHistory,
} from "@/lib/api/client";
import type { AutonomyStatus, RuntimeStatus } from "@/types/api";
import type { StoredSwarmRun, StoredTradeExecution } from "@/types/history";
import type { Candle, OKXTicker } from "@/types/market";
import type { MemoryRecord } from "@/types/memory";
import type {
  AgentVote,
  ConsensusResult,
  SwarmStreamEvent,
} from "@/types/swarm";
import type { AccountOverview, Position } from "@/types/trade";
import "streamdown/styles.css";

const SYMBOL = "BTC-USDT";
const TIMEFRAME = "1H";

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "--- --";
  }
}

function pctClass(v: number): string {
  if (v > 0) return "data-positive";
  if (v < 0) return "data-negative";
  return "data-neutral";
}

function pnlClass(v: number): string {
  if (v > 0) return "data-positive";
  if (v < 0) return "data-negative";
  return "";
}

function signalClass(s: string): string {
  if (s === "BUY") return "data-positive";
  if (s === "SELL") return "data-negative";
  return "data-neutral";
}

function candleRow(c: Candle, i: number): React.ReactNode {
  const chg = c.close - c.open;
  const cls = chg > 0 ? "data-positive" : chg < 0 ? "data-negative" : "";
  return (
    <tr key={i} className="border-b border-border">
      <td className="data-cell data-neutral">{fmtTs(c.timestamp)}</td>
      <td className="data-cell">{fmt(c.open)}</td>
      <td className="data-cell">{fmt(c.high)}</td>
      <td className="data-cell">{fmt(c.low)}</td>
      <td className={`data-cell ${cls}`}>{fmt(c.close)}</td>
      <td className="data-cell data-neutral">{fmtK(c.volume)}</td>
    </tr>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 28;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  const lastChg =
    data.length >= 2 ? data[data.length - 1] - data[data.length - 2] : 0;
  const stroke = lastChg >= 0 ? "var(--terminal-green)" : "var(--terminal-red)";
  return (
    <svg
      width={w}
      height={h}
      className="inline-block"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Price sparkline"
    >
      <title>Price sparkline</title>
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" points={points} />
    </svg>
  );
}

function VoteBar({ vote }: { vote: AgentVote }) {
  return (
    <div className="flex items-center border-b border-border min-h-[1.25rem]">
      <span className="data-cell w-[7%] truncate">{vote.modelRole}</span>
      <span className={`data-cell w-[6%] ${signalClass(vote.signal)}`}>
        {vote.signal}
      </span>
      <span className="data-cell w-[6%]">
        {(vote.confidence * 100).toFixed(0)}%
      </span>
      <span className="data-cell w-[4%] data-neutral">
        {vote.voteWeight.toFixed(1)}
      </span>
      <span className="data-cell flex-1 truncate data-neutral text-[0.6rem]">
        {vote.reasoning}
      </span>
      <span className="data-cell w-[6%] text-right data-neutral">
        {vote.elapsedMs}ms
      </span>
    </div>
  );
}

function CommandBar({
  onCommand,
  statusText,
}: {
  onCommand: (cmd: string) => void;
  statusText: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (v) {
      onCommand(v);
      setValue("");
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-secondary border-b border-primary/60 flex items-center h-[1.75rem]">
      <span className="px-2 text-primary font-bold text-xs select-none">
        {">"}
      </span>
      <form onSubmit={handleSubmit} className="flex-1 flex">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="command-input flex-1 h-[1.5rem] border-0 rounded-none px-1"
          placeholder="ENTER COMMAND..."
          spellCheck={false}
          autoComplete="off"
        />
      </form>
      <span className="px-2 text-terminal-amber text-[0.5625rem] uppercase tracking-wide truncate max-w-[40%]">
        {statusText}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const [ticker, setTicker] = useState<OKXTicker | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [account, setAccount] = useState<AccountOverview | null>(null);
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(
    null,
  );
  const [autonomy, setAutonomy] = useState<AutonomyStatus | null>(null);
  const [swarmHistory, setSwarmHistory] = useState<StoredSwarmRun[]>([]);
  const [tradeHistory, setTradeHistory] = useState<StoredTradeExecution[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [cmdLog, setCmdLog] = useState<string[]>([
    "SYS: DASHBOARD INITIALIZED",
  ]);
  const [agentDiscussion, setAgentDiscussion] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const discussionEndRef = useRef<HTMLDivElement>(null);
  const discussionLenRef = useRef(0);
  const fetchRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [t, c, p, a, cs, rs, au, sh, th, mr] = await Promise.allSettled([
          getTicker(SYMBOL),
          getCandles(SYMBOL, TIMEFRAME, 20),
          getPositions(),
          getAccount(SYMBOL),
          getConsensus(SYMBOL, TIMEFRAME),
          getRuntimeSystemStatus(),
          getAutonomyStatus(),
          getSwarmHistory(20),
          getTradeHistory(20),
          getMemoryRecent(SYMBOL, TIMEFRAME, 12),
        ]);

        if (!cancelled) {
          if (t.status === "fulfilled") setTicker(t.value.data.ticker);
          if (c.status === "fulfilled") setCandles(c.value.data.candles ?? []);
          if (p.status === "fulfilled")
            setPositions(p.value.data.positions ?? []);
          if (a.status === "fulfilled") setAccount(a.value.data.overview);
          if (cs.status === "fulfilled") setConsensus(cs.value.data.consensus);
          if (rs.status === "fulfilled") setRuntimeStatus(rs.value);
          if (au.status === "fulfilled") setAutonomy(au.value.data.autonomy);
          if (sh.status === "fulfilled")
            setSwarmHistory(sh.value.data.entries ?? []);
          if (th.status === "fulfilled")
            setTradeHistory(th.value.data.entries ?? []);
          if (mr.status === "fulfilled")
            setMemories(mr.value.data.entries ?? []);
        }
      } catch {
        if (!cancelled) {
          setCmdLog((prev) => [...prev.slice(-40), "ERR: DATA FETCH FAILED"]);
        }
      }
    }

    load();
    const iv = setInterval(load, 15000);
    const tickIv = setInterval(() => {
      fetchRef.current += 1;
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      clearInterval(tickIv);
    };
  }, []);

  useEffect(() => {
    let aborted = false;
    let eventSource: EventSource | null = null;

    function connect() {
      if (aborted) return;
      eventSource = new EventSource(
        `/api/ai/swarm/stream?symbol=${SYMBOL}&timeframe=${TIMEFRAME}`,
      );
      setIsStreaming(true);

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as SwarmStreamEvent;
          if (event.type === "vote" && event.vote) {
            const v = event.vote;
            discussionLenRef.current += 1;
            setAgentDiscussion((prev) => {
              const block = [
                `### ${v.modelRole} [${v.model}]`,
                `**Signal:** ${v.signal} | **Confidence:** ${(v.confidence * 100).toFixed(0)}% | **Weight:** ${v.voteWeight.toFixed(1)}`,
                "",
                v.reasoning,
                "",
                "---",
                "",
              ].join("\n");
              return prev ? `${prev}\n${block}` : block;
            });
          } else if (event.type === "consensus" && event.consensus) {
            const c = event.consensus;
            discussionLenRef.current += 1;
            setAgentDiscussion((prev) => {
              const block = [
                "## ═══ SWARM CONSENSUS ═══",
                `**Decision:** ${c.decision ?? c.signal} | **Confidence:** ${(c.confidence * 100).toFixed(1)}% | **Agreement:** ${(c.agreement * 100).toFixed(1)}%`,
                c.blocked ? `> ⛔ **BLOCKED** — ${c.blockReason ?? "N/A"}` : "",
                c.regime
                  ? `**Regime:** ${c.regime.regime} (${(c.regime.confidence * 100).toFixed(0)}%)`
                  : "",
                "",
                "---",
                "",
              ]
                .filter(Boolean)
                .join("\n");
              return prev ? `${prev}\n${block}` : block;
            });
          } else if (event.type === "status" && event.message) {
            discussionLenRef.current += 1;
            setAgentDiscussion((prev) => {
              const line = `> _${event.message}_\n\n`;
              return prev ? `${prev}${line}` : line;
            });
          } else if (event.type === "error" && event.message) {
            discussionLenRef.current += 1;
            setAgentDiscussion((prev) => {
              const line = `> **ERROR:** ${event.message}\n\n`;
              return prev ? `${prev}${line}` : line;
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      eventSource.onerror = () => {
        setIsStreaming(false);
        eventSource?.close();
        if (!aborted) {
          setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      aborted = true;
      eventSource?.close();
      setIsStreaming(false);
    };
  }, []);

  useEffect(() => {
    if (discussionLenRef.current > 0) {
      discussionEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

  const handleCommand = useCallback(async (cmd: string) => {
    const upper = cmd.toUpperCase();
    setCmdLog((prev) => [...prev.slice(-40), `> ${upper}`]);

    if (upper === "START" || upper === "AUTONOMY START") {
      try {
        const res = await controlAutonomy({
          action: "start",
          symbol: SYMBOL,
          timeframe: TIMEFRAME,
        });
        setAutonomy(res.data.autonomy);
        setCmdLog((prev) => [...prev.slice(-40), "SYS: AUTONOMY ENABLED"]);
      } catch {
        setCmdLog((prev) => [...prev.slice(-40), "ERR: AUTONOMY START FAILED"]);
      }
    } else if (upper === "STOP" || upper === "AUTONOMY STOP") {
      try {
        const res = await controlAutonomy({ action: "stop" });
        setAutonomy(res.data.autonomy);
        setCmdLog((prev) => [...prev.slice(-40), "SYS: AUTONOMY DISABLED"]);
      } catch {
        setCmdLog((prev) => [...prev.slice(-40), "ERR: AUTONOMY STOP FAILED"]);
      }
    } else if (upper === "CLEAR") {
      setCmdLog([]);
    } else if (upper === "DISCUSS" || upper === "STREAM") {
      setAgentDiscussion("");
      discussionLenRef.current = 0;
      setCmdLog((prev) => [
        ...prev.slice(-40),
        "SYS: DISCUSSION CLEARED — SSE RECONNECTING",
      ]);
    } else if (upper === "STATUS") {
      setCmdLog((prev) => [...prev.slice(-40), "SYS: REFRESH TRIGGERED"]);
    } else {
      setCmdLog((prev) => [...prev.slice(-40), `ERR: UNKNOWN CMD '${upper}'`]);
    }
  }, []);

  const statusText = runtimeStatus
    ? `${SYMBOL} ${TIMEFRAME} | OKX:${runtimeStatus.okx.available ? "ON" : "OFF"} | MKT:${runtimeStatus.marketData.connectionState.toUpperCase()} | AUTO:${autonomy?.running ? "RUN" : "IDLE"} | SSE:${isStreaming ? "LIVE" : "OFF"}`
    : "LOADING...";

  const change24h = ticker?.change24h ?? 0;
  const sparkData = candles.map((c) => c.close);

  return (
    <div className="min-h-screen bg-background text-foreground scanline">
      <CommandBar onCommand={handleCommand} statusText={statusText} />

      <div className="pt-[1.75rem] flex flex-col h-screen">
        {/* ─── ROW 1: Price + Account + System ─────────────────────── */}
        <div className="flex border-b border-border">
          {/* TICKER PANEL */}
          <div className="bloomberg-panel flex-1 min-w-0">
            <div className="bloomberg-header">
              <span>{SYMBOL} TICKER</span>
              <span className="text-terminal-amber">
                {ticker ? fmtTs(ticker.timestamp) : "--:--:--"}
              </span>
            </div>
            <div className="p-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0 text-[0.6875rem]">
              <span className="data-neutral">LAST</span>
              <span className={pnlClass(change24h)}>
                {ticker ? fmt(ticker.last) : "---.--"}
              </span>
              <span className="data-neutral">BID</span>
              <span>{ticker ? fmt(ticker.bid) : "---.--"}</span>
              <span className="data-neutral">ASK</span>
              <span>{ticker ? fmt(ticker.ask) : "---.--"}</span>
              <span className="data-neutral">24H</span>
              <span className={pctClass(change24h)}>
                {ticker
                  ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`
                  : "--.--%"}
              </span>
              <span className="data-neutral">HIGH</span>
              <span>{ticker ? fmt(ticker.high24h) : "---.--"}</span>
              <span className="data-neutral">LOW</span>
              <span>{ticker ? fmt(ticker.low24h) : "---.--"}</span>
              <span className="data-neutral">VOL</span>
              <span className="data-neutral">
                {ticker ? fmtK(ticker.vol24h) : "---.--"}
              </span>
              <span className="data-neutral">SPARK</span>
              <span>
                {sparkData.length > 1 ? <Sparkline data={sparkData} /> : "---"}
              </span>
            </div>
          </div>

          {/* ACCOUNT PANEL */}
          <div className="bloomberg-panel w-[240px] flex-shrink-0">
            <div className="bloomberg-header">
              <span>ACCOUNT</span>
              <span
                className={
                  account?.accountMode === "live"
                    ? "data-negative"
                    : "data-neutral"
                }
              >
                {account?.accountMode?.toUpperCase() ?? "---"}
              </span>
            </div>
            <div className="p-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0 text-[0.6875rem]">
              <span className="data-neutral">EQUITY</span>
              <span>{account ? `$${fmt(account.totalEquity)}` : "---.--"}</span>
              <span className="data-neutral">AVAIL</span>
              <span>
                {account ? `$${fmt(account.availableEquity)}` : "---.--"}
              </span>
              <span className="data-neutral">U-PNL</span>
              <span className={pnlClass(account?.unrealizedPnl ?? 0)}>
                {account ? `$${fmt(account.unrealizedPnl)}` : "---.--"}
              </span>
              <span className="data-neutral">NOTION</span>
              <span className="data-neutral">
                {account?.notionalUsd
                  ? `$${fmtK(account.notionalUsd)}`
                  : "---.--"}
              </span>
              <span className="data-neutral">MARGIN</span>
              <span className="data-neutral">
                {account?.marginRatio != null
                  ? `${(account.marginRatio * 100).toFixed(1)}%`
                  : "---"}
              </span>
            </div>
          </div>

          {/* SYSTEM STATUS PANEL */}
          <div className="bloomberg-panel w-[200px] flex-shrink-0">
            <div className="bloomberg-header">
              <span>SYSTEM</span>
              <span
                className={runtimeStatus ? "data-positive" : "data-neutral"}
              >
                {runtimeStatus ? "LIVE" : "---"}
              </span>
            </div>
            <div className="p-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0 text-[0.6875rem]">
              <span className="data-neutral">OKX</span>
              <span
                className={
                  runtimeStatus?.okx.available
                    ? "data-positive"
                    : "data-negative"
                }
              >
                {runtimeStatus
                  ? runtimeStatus.okx.available
                    ? "CONNECTED"
                    : "DOWN"
                  : "---"}
              </span>
              <span className="data-neutral">MKT</span>
              <span
                className={
                  runtimeStatus?.marketData.connectionState === "connected"
                    ? "data-positive"
                    : "data-neutral"
                }
              >
                {runtimeStatus?.marketData.connectionState.toUpperCase() ??
                  "---"}
              </span>
              <span className="data-neutral">REDIS</span>
              <span
                className={
                  runtimeStatus?.redis.available
                    ? "data-positive"
                    : "data-negative"
                }
              >
                {runtimeStatus
                  ? runtimeStatus.redis.available
                    ? "UP"
                    : "DOWN"
                  : "---"}
              </span>
              <span className="data-neutral">OLLAMA</span>
              <span
                className={
                  runtimeStatus?.ollama.available
                    ? "data-positive"
                    : "data-negative"
                }
              >
                {runtimeStatus
                  ? runtimeStatus.ollama.available
                    ? "UP"
                    : "DOWN"
                  : "---"}
              </span>
              <span className="data-neutral">WEB</span>
              <span
                className={
                  runtimeStatus?.webResearch.available
                    ? "data-positive"
                    : "data-negative"
                }
              >
                {runtimeStatus
                  ? runtimeStatus.webResearch.available
                    ? "UP"
                    : "DOWN"
                  : "---"}
              </span>
              <span className="data-neutral">AUTO</span>
              <span
                className={autonomy?.running ? "data-positive" : "data-neutral"}
              >
                {autonomy ? (autonomy.running ? "ACTIVE" : "IDLE") : "---"}
              </span>
              <span className="data-neutral">ITER</span>
              <span className="data-neutral">
                {autonomy?.iterationCount ?? "---"}
              </span>
            </div>
          </div>
        </div>

        {/* ─── ROW 2: Candles + Consensus + Positions ───────────── */}
        <div className="flex flex-1 min-h-0 border-b border-border">
          {/* OHLCV TABLE */}
          <div className="bloomberg-panel flex-[2] min-w-0 flex flex-col">
            <div className="bloomberg-header">
              <span>OHLCV {TIMEFRAME}</span>
              <span className="data-neutral">{candles.length} BARS</span>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="data-header text-left">TIME</th>
                    <th className="data-header text-right">OPEN</th>
                    <th className="data-header text-right">HIGH</th>
                    <th className="data-header text-right">LOW</th>
                    <th className="data-header text-right">CLOSE</th>
                    <th className="data-header text-right">VOL</th>
                  </tr>
                </thead>
                <tbody>{candles.slice().reverse().map(candleRow)}</tbody>
              </table>
            </div>
          </div>

          {/* CONSENSUS PANEL */}
          <div className="bloomberg-panel flex-[3] min-w-0 flex flex-col">
            <div className="bloomberg-header">
              <span>SWARM CONSENSUS</span>
              <span>
                {consensus ? (
                  <span className={signalClass(consensus.signal)}>
                    {consensus.signal} {(consensus.confidence * 100).toFixed(0)}
                    %
                  </span>
                ) : (
                  <span className="data-neutral">---</span>
                )}
              </span>
            </div>
            {consensus ? (
              <div className="flex-1 overflow-auto flex flex-col">
                <div className="grid grid-cols-[auto_1fr] gap-x-2 p-1 text-[0.6875rem] border-b border-border">
                  <span className="data-neutral">SIGNAL</span>
                  <span
                    className={signalClass(
                      consensus.decision ?? consensus.signal,
                    )}
                  >
                    {consensus.decision ?? consensus.signal}
                  </span>
                  <span className="data-neutral">CONF</span>
                  <span>{(consensus.confidence * 100).toFixed(1)}%</span>
                  <span className="data-neutral">AGREE</span>
                  <span>{(consensus.agreement * 100).toFixed(1)}%</span>
                  <span className="data-neutral">BLOCKED</span>
                  <span
                    className={
                      consensus.blocked ? "data-negative" : "data-positive"
                    }
                  >
                    {consensus.blocked
                      ? `YES — ${consensus.blockReason ?? "N/A"}`
                      : "NO"}
                  </span>
                  <span className="data-neutral">REGIME</span>
                  <span>{consensus.regime?.regime ?? "---"}</span>
                  {consensus.expectedValue && (
                    <>
                      <span className="data-neutral">NET EDGE</span>
                      <span
                        className={
                          consensus.expectedValue.netEdgeBps > 0
                            ? "data-positive"
                            : "data-negative"
                        }
                      >
                        {consensus.expectedValue.netEdgeBps.toFixed(1)} BPS
                      </span>
                      <span className="data-neutral">R:R</span>
                      <span>
                        {consensus.expectedValue.rewardRiskRatio.toFixed(2)}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex-1 overflow-auto">
                  {consensus.votes.map((v) => (
                    <VoteBar key={`${v.model}-${v.role}`} vote={v} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center data-neutral text-[0.6875rem]">
                NO CONSENSUS DATA
              </div>
            )}
          </div>

          {/* POSITIONS PANEL */}
          <div className="bloomberg-panel w-[220px] flex-shrink-0 flex flex-col">
            <div className="bloomberg-header">
              <span>POSITIONS</span>
              <span className="data-neutral">{positions.length}</span>
            </div>
            <div className="overflow-auto flex-1">
              {positions.length === 0 ? (
                <div className="p-2 text-[0.625rem] data-neutral uppercase">
                  No open positions
                </div>
              ) : (
                positions.map((p) => (
                  <div
                    key={`${p.symbol}-${p.side}`}
                    className="border-b border-border p-1 text-[0.6875rem]"
                  >
                    <div className="flex justify-between">
                      <span
                        className={
                          p.side === "buy" ? "data-positive" : "data-negative"
                        }
                      >
                        {p.symbol}
                      </span>
                      <span className="data-neutral">
                        {p.side.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="data-neutral">SIZE</span>
                      <span>{p.size}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="data-neutral">ENTRY</span>
                      <span>{fmt(p.entryPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="data-neutral">PNL</span>
                      <span className={pnlClass(p.pnl)}>
                        {p.pnl >= 0 ? "+" : ""}
                        {fmt(p.pnl)} ({p.pnlPercent >= 0 ? "+" : ""}
                        {p.pnlPercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ─── ROW 3: History + Memory + Command Log ─────────────── */}
        <div className="flex flex-1 min-h-0 border-b border-border">
          {/* SWARM HISTORY */}
          <div className="bloomberg-panel flex-1 min-w-0 flex flex-col">
            <div className="bloomberg-header">
              <span>SWARM LOG</span>
              <span className="data-neutral">{swarmHistory.length}</span>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="data-header text-left">TIME</th>
                    <th className="data-header text-left">SYM</th>
                    <th className="data-header text-left">SIG</th>
                    <th className="data-header text-right">CONF</th>
                    <th className="data-header text-right">MS</th>
                  </tr>
                </thead>
                <tbody>
                  {swarmHistory.slice(0, 15).map((e) => (
                    <tr key={e.id} className="border-b border-border">
                      <td className="data-cell data-neutral">
                        {fmtTs(e.timestamp)} {fmtDate(e.timestamp)}
                      </td>
                      <td className="data-cell">{e.symbol}</td>
                      <td
                        className={`data-cell ${signalClass(e.consensus.signal)}`}
                      >
                        {e.consensus.signal}
                      </td>
                      <td className="data-cell text-right">
                        {(e.consensus.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="data-cell text-right data-neutral">
                        {e.totalElapsedMs}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* TRADE HISTORY */}
          <div className="bloomberg-panel w-[280px] flex-shrink-0 flex flex-col">
            <div className="bloomberg-header">
              <span>TRADES</span>
              <span className="data-neutral">{tradeHistory.length}</span>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="data-header text-left">TIME</th>
                    <th className="data-header text-left">SYM</th>
                    <th className="data-header text-left">SIDE</th>
                    <th className="data-header text-right">SIZE</th>
                    <th className="data-header text-left">STS</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeHistory.slice(0, 15).map((e) => (
                    <tr key={e.id} className="border-b border-border">
                      <td className="data-cell data-neutral">
                        {fmtTs(e.timestamp)}
                      </td>
                      <td className="data-cell">{e.order.symbol}</td>
                      <td
                        className={`data-cell ${e.order.side === "buy" ? "data-positive" : "data-negative"}`}
                      >
                        {e.order.side.toUpperCase()}
                      </td>
                      <td className="data-cell text-right">{e.order.size}</td>
                      <td
                        className={`data-cell ${e.success ? "data-positive" : "data-negative"}`}
                      >
                        {e.success ? "OK" : "FAIL"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MEMORY */}
          <div className="bloomberg-panel w-[260px] flex-shrink-0 flex flex-col">
            <div className="bloomberg-header">
              <span>MEMORY</span>
              <span className="data-neutral">{memories.length}</span>
            </div>
            <div className="overflow-auto flex-1">
              {memories.slice(0, 12).map((m) => (
                <div
                  key={m.id}
                  className="border-b border-border p-1 text-[0.625rem]"
                >
                  <div className="flex justify-between">
                    <span className={`data-neutral`}>{fmtTs(m.createdAt)}</span>
                    <span className={signalClass(m.signal)}>{m.signal}</span>
                    <span className="data-neutral">
                      {(m.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="data-neutral truncate">{m.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── ROW 4: Agent Discussion + CLI Log ─────────────────── */}
        <div className="flex flex-1 min-h-0">
          {/* AGENT DISCUSSION (Streamdown) */}
          <div className="bloomberg-panel flex-[3] min-w-0 flex flex-col">
            <div className="bloomberg-header">
              <span>AGENT DISCUSSION</span>
              <span className={isStreaming ? "data-positive" : "data-neutral"}>
                {isStreaming ? "STREAMING" : "IDLE"}
              </span>
            </div>
            <div className="overflow-auto flex-1 p-2 text-[0.6875rem] leading-[1.25rem]">
              {agentDiscussion ? (
                <Streamdown
                  animated
                  isAnimating={status === "streaming"}
                  className="[&_h2]:text-terminal-amber [&_h2]:text-xs [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:mb-1 [&_h2]:mt-2 [&_h3]:text-terminal-cyan [&_h3]:text-xs [&_h3]:uppercase [&_h3]:tracking-wider [&_h3]:mb-1 [&_h3]:mt-1 [&_strong]:text-foreground [&_em]:text-terminal-dim [&_hr]:border-border [&_hr]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-terminal-amber [&_blockquote]:pl-2 [&_blockquote]:text-terminal-amber [&_p]:mb-2 [&_p]:text-foreground"
                >
                  {agentDiscussion}
                </Streamdown>
              ) : (
                <span className="data-neutral">AWAITING AGENT VOTES...</span>
              )}
              <div ref={discussionEndRef} />
            </div>
          </div>

          {/* CLI LOG */}
          <div className="bloomberg-panel w-[280px] flex-shrink-0 flex flex-col">
            <div className="bloomberg-header">
              <span>CLI</span>
              <span className="data-neutral">
                CMD: START|STOP|STATUS|CLEAR|DISCUSS
              </span>
            </div>
            <div className="overflow-auto flex-1 p-1 text-[0.625rem] leading-[1.1rem]">
              {cmdLog.map((line, i) => (
                <div
                  key={`log-${i}-${line.slice(0, 12)}`}
                  className={
                    line.startsWith("ERR")
                      ? "data-negative"
                      : line.startsWith("SYS")
                        ? "data-positive"
                        : "data-neutral"
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
