"use client";

import { useState, useCallback } from "react";

const COMMANDS = [
  { cmd: "analyze", desc: "Run swarm analysis", shortcut: "Ctrl+A" },
  { cmd: "buy", desc: "Execute buy order", shortcut: "Ctrl+B" },
  { cmd: "sell", desc: "Execute sell order", shortcut: "Ctrl+S" },
  { cmd: "positions", desc: "Show open positions", shortcut: "Ctrl+P" },
  { cmd: "ticker", desc: "Fetch latest ticker", shortcut: "Ctrl+T" },
  { cmd: "set-symbol", desc: "Change trading pair", shortcut: "" },
  { cmd: "set-timeframe", desc: "Change candle timeframe", shortcut: "" },
  { cmd: "clear", desc: "Clear feed", shortcut: "" },
  { cmd: "help", desc: "Show available commands", shortcut: "Ctrl+H" },
];

interface CommandBarProps {
  onCommand: (cmd: string, args?: string) => void;
  symbol: string;
  setSymbol: (s: string) => void;
  timeframe: string;
  setTimeframe: (t: string) => void;
}

export function CommandBar({
  onCommand,
  symbol,
  setSymbol,
  timeframe,
  setTimeframe,
}: CommandBarProps) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;

      setHistory((prev) => [trimmed, ...prev].slice(0, 50));
      setHistIdx(-1);

      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(" ");

      if (cmd === "set-symbol" && args) {
        setSymbol(args.toUpperCase());
      } else if (cmd === "set-timeframe" && args) {
        setTimeframe(args);
      } else {
        onCommand(cmd, args);
      }

      setInput("");
    },
    [input, onCommand, setSymbol, setTimeframe],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.min(histIdx + 1, history.length - 1);
        if (next >= 0 && history[next]) {
          setHistIdx(next);
          setInput(history[next]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = histIdx - 1;
        if (next >= 0 && history[next]) {
          setHistIdx(next);
          setInput(history[next]);
        } else {
          setHistIdx(-1);
          setInput("");
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        const partial = input.toLowerCase().trim();
        const match = COMMANDS.find((c) => c.cmd.startsWith(partial));
        if (match) {
          setInput(match.cmd + " ");
        }
      }
    },
    [histIdx, history, input],
  );

  return (
    <div className="flex items-center border-b border-border bg-card h-7">
      <div className="flex items-center px-2 border-r border-border h-full shrink-0 gap-2">
        <span className="text-[0.5625rem] uppercase tracking-wider text-primary font-bold">
          CMD
        </span>
      </div>
      <div className="flex items-center px-2 border-r border-border h-full shrink-0 gap-2">
        <span className="text-[0.5625rem] text-muted-foreground">SYM:</span>
        <span className="text-[0.625rem] text-primary font-bold">{symbol}</span>
      </div>
      <div className="flex items-center px-2 border-r border-border h-full shrink-0 gap-2">
        <span className="text-[0.5625rem] text-muted-foreground">TF:</span>
        <span className="text-[0.625rem] text-terminal-amber font-bold">
          {timeframe}
        </span>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-1 items-center px-2">
        <span className="text-[0.625rem] text-terminal-dim pr-2 shrink-0">
          &gt;_
        </span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ENTER COMMAND..."
          className="cmd-input flex-1 h-5 bg-transparent border-0 px-0 text-[0.6875rem] focus:ring-0 focus:border-0"
          autoComplete="off"
          spellCheck={false}
        />
      </form>
      <div className="flex items-center px-2 border-l border-border h-full shrink-0 gap-4">
        <span className="text-[0.5625rem] text-muted-foreground">
          ^UP/^DN:HIST
        </span>
        <span className="text-[0.5625rem] text-muted-foreground">TAB:AUTO</span>
        <span className="text-[0.5625rem] text-muted-foreground">^H:HELP</span>
      </div>
    </div>
  );
}
