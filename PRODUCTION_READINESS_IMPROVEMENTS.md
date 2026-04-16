# Production Readiness Improvements

## Purpose

This document summarizes the current architecture of the OKX trading swarm, evaluates whether it is truly using real-time data today, and lays out the improvements required to make it production-ready for live autonomous trading.

It is based on the current code paths in:

- `src/lib/okx/market.ts`
- `src/lib/swarm/pipeline.ts`
- `src/lib/agents/create-agent.ts`
- `src/lib/swarm/autoExecute.ts`
- `src/lib/autonomy/service.ts`
- `src/app/api/ai/swarm/consensus/route.ts`
- `src/components/dashboard/market-panel.tsx`
- `src/components/dashboard/ticker-bar.tsx`

## Current System Summary

The system already has a meaningful strategy stack:

- specialist agent votes
- weighted consensus
- regime classification
- strategy-engine selection
- expected-value gating
- reliability weighting
- validator and harness layers
- auto-execution with circuit breaker and sizing guards

That is a strong foundation.

However, the market-data path is still mostly snapshot-oriented, not true event-driven real time.

Today the app fetches ticker, candles, and order book through REST helpers in `src/lib/okx/market.ts`. Those helpers use short-lived cache and can fall back to synthetic data when requests fail. The dashboard then polls those API routes on intervals:

- `MarketPanel`: every 5 seconds
- `TickerBar`: every 30 seconds
- history refresh: every 30 seconds
- autonomy loop: default every 60 seconds

This means the system is "near-real-time polling" rather than a true real-time market ingestion system.

## Current Strategy Approach

The strategy logic is now layered in a sensible way.

### 1. Specialist agent layer

The active swarm uses specialist roles:

- `trend_follower`
- `momentum_analyst`
- `sentiment_reader`
- `macro_filter`
- `execution_tactician`

Each role has deterministic heuristics in `src/lib/agents/create-agent.ts`, and when configured, LLM reasoning can refine the vote.

### 2. Consensus layer

Raw votes are combined into a weighted consensus using role weights and veto behavior.

### 3. Regime layer

`src/lib/swarm/regime.ts` classifies the current market into:

- `trend`
- `breakout`
- `mean_reversion`
- `stress`
- `illiquid`

### 4. Engine layer

`src/lib/swarm/engines.ts` maps the strategy into explicit engines:

- `trend_continuation`
- `breakout`
- `mean_reversion`
- `microstructure`

### 5. Meta-selector

`src/lib/swarm/meta-selector.ts` adjusts or suppresses the signal based on whether the chosen engine fits the detected regime.

### 6. Expected-value gate

`src/lib/swarm/expected-value.ts` rejects trades whose estimated edge is too weak after fees, slippage, and reward/risk checks.

### 7. Reliability weighting

`src/lib/swarm/reliability.ts` uses historical swarm runs to reduce confidence or suppress weak setups when the same regime-engine combination has not behaved well recently.

### 8. Harness and validator

The final decision is passed through:

- `src/lib/swarm/validator.ts`
- `src/lib/swarm/harness.ts`

These layers add tradeability and memory-aware gating.

### Assessment

The strategy architecture is much better than a flat vote-only swarm.

The main weakness is not the structure of the strategy. The main weakness is that the live execution loop is consuming snapshot data, cached data, and potentially fallback synthetic data, which creates an unacceptable gap between analysis, UI, and market reality in production.

## Real-Time Data Assessment

### What works today

- The app can fetch current public market data from OKX.
- The swarm stream endpoint emits vote-by-vote progress to the UI through SSE.
- The autonomy loop can repeatedly analyze and execute without manual confirmation.

### What is missing

#### 1. No OKX websocket ingestion

The codebase has a configured OKX websocket URL in `src/lib/configs/okx.ts`, but the current market-data stack does not consume a live websocket feed.

That means:

- no tick-by-tick ticker updates
- no real-time order book updates
- no live trade feed
- no locally maintained rolling candles

#### 2. Polling is driving the UI

The UI refreshes using timers, not a subscribed event stream from a market-data service.

That means:

- visible lag in dashboard data
- different panels can be out of sync
- swarm decisions can be made on different snapshots than the operator sees

#### 3. Synthetic fallback is still enabled

`src/lib/okx/market.ts` falls back to generated ticker, candles, and order book when public requests fail.

That is helpful in development, but dangerous in production because the system can continue operating on invented prices.

#### 4. No stale-data guardrail

There is no hard rule that says:

- do not trade if ticker is stale
- do not trade if order book is stale
- do not trade if candles are stale
- do not trade if source health is degraded

#### 5. No central market-state engine

There is no single in-memory market service that owns:

- latest ticker
- latest order book
- live trades
- derived candles
- last update timestamp
- freshness state
- reconnect state

Without that, each caller fetches snapshots independently.

## Production Risks

The biggest production blockers are:

- synthetic fallback data can be mistaken for real market state
- no websocket-driven market data
- no freshness or stale-data kill switch
- autonomous loop runs in-process inside the app runtime
- no durable trade journal with outcome attribution by strategy engine
- no execution idempotency ledger across restarts
- no hard portfolio-level risk engine
- no model-performance evaluation loop based on realized outcomes

## Improvements We Should Add

## Priority 0: Production Safety Gates

These should be added before trusting live autonomous trading.

### A. Disable synthetic fallback in production

Add an env flag such as:

```bash
ALLOW_SYNTHETIC_MARKET_FALLBACK=false
```

Required behavior:

- in development: fallback may remain allowed
- in production: public market-data fetch failure must mark source unhealthy and stop analysis/trading

### B. Add stale-data kill switches

Add freshness checks for:

- ticker age
- order book age
- candle age
- websocket connection health

If any required feed is stale, the swarm may analyze for observability, but execution must resolve to `HOLD`.

### C. Add source-health enforcement before execution

Execution should require:

- market data source = real OKX feed
- freshness within thresholds
- instrument state = live
- account mode explicitly known

## Priority 1: Real-Time Market Data Layer

This is the most important architecture improvement.

### A. Build an OKX websocket ingestion service

Add a server-side market data service that connects to OKX public websocket channels for:

- tickers
- trades
- books5 or books
- candles if appropriate, or derive candles locally from trades/ticks

Suggested file group:

- `src/lib/okx/ws-client.ts`
- `src/lib/market-data/service.ts`
- `src/lib/market-data/store.ts`
- `src/lib/market-data/types.ts`

### B. Maintain an in-memory authoritative market state

For each symbol, keep:

- latest ticker
- latest order book
- last trade
- rolling candle builder
- update timestamps
- feed status
- stale flags
- reconnect count

This service should be the only source used by:

- swarm analysis
- autonomy loop
- market dashboard panels
- ticker bar

### C. Push updates to the UI

Replace dashboard polling with live subscription transport:

- SSE is acceptable for one-way market and agent updates
- WebSocket is better if we want bidirectional controls and richer real-time telemetry

The UI should subscribe to a single real-time stream that emits:

- market updates
- swarm status
- agent votes
- consensus output
- execution result
- risk blocks
- source-health changes

## Priority 2: Execution and Risk Hardening

### A. Add a real portfolio risk engine

Before any live order:

- max position per symbol
- max gross exposure
- max daily trades
- max daily loss
- max drawdown
- cooldown after loss streak
- stop-trading state after repeated abnormal conditions

### B. Add execution idempotency and intent journaling

Store a durable execution intent before placing an order:

- strategy decision id
- symbol
- side
- target size
- normalized size
- market snapshot hash
- execution status transitions

This prevents duplicate execution after process restarts or route replays.

### C. Separate autonomy from the app process

The current loop in `src/lib/autonomy/service.ts` is in-process memory. A restart clears state.

For production, move autonomy to a durable worker or job runner so it can:

- recover after crash
- resume state
- persist open intents
- apply locks cleanly

## Priority 3: Strategy and Evaluation Improvements

### A. Replace heuristic reliability with realized outcome attribution

The current reliability layer uses historical swarm-run behavior, which is a good start but not enough.

Add outcome tracking per:

- regime
- selected engine
- symbol
- timeframe
- agent role
- final execution result
- realized PnL
- max adverse excursion
- max favorable excursion

Then use that data to:

- reweight engines
- down-rank weak market regimes
- adapt confidence by actual performance

### B. Add replay and backtest infrastructure

Build a deterministic replay harness so we can test:

- strategy changes
- risk rules
- engine selection rules
- expected-value thresholds

Without this, we are tuning a live system too blindly.

### C. Add model governance

Track:

- which model voted
- token and latency cost
- disagreement rate
- vote drift over time
- realized value contribution by role

That allows us to know whether a model is helping or just adding noise and cost.

## Priority 4: UI and Operator Visibility

The UI already shows much more than before, but for production operations it should add:

- live source-health badge for every market feed
- freshness timestamps and stale warnings
- websocket connection state
- current autonomy loop state and last market snapshot time
- agent discussion timeline as a live event log
- execution intent, submit, accept, fill, reject lifecycle
- risk-block reasons in a dedicated panel
- real realized PnL and exposure panel

Most importantly, the dashboard should make it impossible to confuse:

- live data
- cached data
- fallback data
- stale data

## Recommended Implementation Roadmap

### Phase A: Real-time data foundation

Build first:

1. OKX websocket client
2. central market-state store
3. freshness tracking
4. kill switches for stale or degraded feeds
5. UI live stream for market state

### Phase B: Execution hardening

Build next:

1. durable execution intent journal
2. idempotency keys
3. portfolio risk engine
4. crash-safe autonomy worker

### Phase C: Strategy evaluation

Build after that:

1. realized-outcome journal
2. replay harness
3. regime-engine scorecards
4. adaptive weighting from actual performance

### Phase D: Operator-grade observability

Finish with:

1. unified live event stream
2. feed freshness panel
3. execution lifecycle panel
4. risk and exposure panel
5. audit trail exports

## Recommended Definition of "Production Ready"

This system should only be called production-ready for live autonomous trading when all of the following are true:

- no synthetic market fallback in production
- real-time OKX websocket ingestion is active
- every trading decision uses freshness-validated market state
- execution intents are durable and idempotent
- autonomy runs outside volatile in-process memory
- portfolio-level risk limits are enforced
- live and stale feed states are visible in the UI
- realized performance is recorded and attributable by strategy regime and engine

## Suggested Next Build

If we want the highest-value next implementation, it should be:

1. build a real-time OKX websocket market-data service
2. wire the swarm and UI to that single authoritative feed
3. disable synthetic fallback when production mode is enabled

That change would improve:

- execution safety
- strategy quality
- UI trustworthiness
- observability
- production readiness

more than any other single improvement in the current codebase.
