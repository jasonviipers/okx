"use client";

import {
  type CandlestickData,
  CandlestickSeries,
  ColorType,
  createChart,
  type HistogramData,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TIMEFRAMES,
  useDashboard,
} from "@/features/dashboard/dashboard-context";
import { useMarketSnapshot } from "@/features/dashboard/hooks/use-market-data";

function computeEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema.push(data[0]);
    } else {
      ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
  }
  return ema;
}

function computeBollingerBands(closes: number[], period = 20, mult = 2) {
  const sma: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(
      slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period,
    );
    sma.push(mean);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { sma, upper, lower };
}

export function CandlestickChart() {
  const { selectedSymbol, selectedTimeframe, setSelectedTimeframe } =
    useDashboard();
  const snapshot = useMarketSnapshot(selectedSymbol, selectedTimeframe);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [ohlcTooltip, setOhlcTooltip] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    time: string;
  } | null>(null);
  const [showEMA9, setShowEMA9] = useState(false);
  const [showEMA21, setShowEMA21] = useState(false);
  const [showBB, setShowBB] = useState(false);
  const prevDataKeyRef = useRef("");

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const container = chartContainerRef.current;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#5a6a7a",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#1a2332" },
        horzLines: { color: "#1a2332" },
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: "#00d4aa",
          style: 2,
          width: 1,
          labelBackgroundColor: "#00d4aa",
        },
        horzLine: {
          color: "#00d4aa",
          style: 2,
          width: 1,
          labelBackgroundColor: "#00d4aa",
        },
      },
      rightPriceScale: {
        borderColor: "#1a2332",
      },
      timeScale: {
        borderColor: "#1a2332",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { axisPressedMouseMove: true },
      handleScroll: { vertTouchDrag: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00d4aa",
      downColor: "#ff4444",
      borderUpColor: "#00d4aa",
      borderDownColor: "#ff4444",
      wickUpColor: "#00d4aa",
      wickDownColor: "#ff4444",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const ema9Series = chart.addSeries(LineSeries, {
      color: "#ffd700",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
    });

    const ema21Series = chart.addSeries(LineSeries, {
      color: "#00b8d4",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
    });

    const bbUpperSeries = chart.addSeries(LineSeries, {
      color: "#ff8c0060",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      lineStyle: 2,
      title: "",
    });

    const bbLowerSeries = chart.addSeries(LineSeries, {
      color: "#ff8c0060",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      lineStyle: 2,
      title: "",
    });

    const bbMiddleSeries = chart.addSeries(LineSeries, {
      color: "#ff8c0030",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      lineStyle: 2,
      title: "",
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setOhlcTooltip(null);
        return;
      }
      const data = param.seriesData.get(candleSeries) as
        | CandlestickData<Time>
        | undefined;
      if (!data) {
        setOhlcTooltip(null);
        return;
      }
      setOhlcTooltip({
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume:
          (
            param.seriesData.get(volumeSeries) as
              | HistogramData<Time>
              | undefined
          )?.value ?? 0,
        time: String(param.time),
      });
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema9SeriesRef.current = ema9Series;
    ema21SeriesRef.current = ema21Series;
    bbUpperRef.current = bbUpperSeries;
    bbLowerRef.current = bbLowerSeries;
    bbMiddleRef.current = bbMiddleSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const candles = snapshot.data?.candles;
    if (
      !candles ||
      candles.length === 0 ||
      !candleSeriesRef.current ||
      !volumeSeriesRef.current
    ) {
      return;
    }

    const dataKey = `${selectedSymbol}:${selectedTimeframe}:${candles.length}:${candles[candles.length - 1]?.timestamp}`;
    const dataUnchanged = dataKey === prevDataKeyRef.current;
    prevDataKeyRef.current = dataKey;

    if (!dataUnchanged) {
      const sorted = [...candles].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const candleData: CandlestickData<Time>[] = sorted.map((c) => ({
        time: (new Date(c.timestamp).getTime() / 1000) as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const volumeData: HistogramData<Time>[] = sorted.map((c) => ({
        time: (new Date(c.timestamp).getTime() / 1000) as Time,
        value: c.volume,
        color: c.close >= c.open ? "#00d4aa40" : "#ff444440",
      }));

      const closes = sorted.map((c) => c.close);
      const ema9Data = showEMA9 ? computeEMA(closes, 9) : null;
      const ema21Data = showEMA21 ? computeEMA(closes, 21) : null;
      const bb = showBB ? computeBollingerBands(closes, 20, 2) : null;

      candleSeriesRef.current.setData(candleData);
      volumeSeriesRef.current.setData(volumeData);

      if (showEMA9 && ema9Data && ema9SeriesRef.current) {
        ema9SeriesRef.current.setData(
          ema9Data
            .map((v, i) => ({ time: candleData[i].time, value: v }))
            .filter((p) => !Number.isNaN(p.value)),
        );
      }
      if (showEMA21 && ema21Data && ema21SeriesRef.current) {
        ema21SeriesRef.current.setData(
          ema21Data
            .map((v, i) => ({ time: candleData[i].time, value: v }))
            .filter((p) => !Number.isNaN(p.value)),
        );
      }
      if (
        showBB &&
        bb &&
        bbUpperRef.current &&
        bbLowerRef.current &&
        bbMiddleRef.current
      ) {
        bbUpperRef.current.setData(
          bb.upper
            .map((v, i) => ({ time: candleData[i].time, value: v }))
            .filter((p) => !Number.isNaN(p.value)),
        );
        bbLowerRef.current.setData(
          bb.lower
            .map((v, i) => ({ time: candleData[i].time, value: v }))
            .filter((p) => !Number.isNaN(p.value)),
        );
        bbMiddleRef.current.setData(
          bb.sma
            .map((v, i) => ({ time: candleData[i].time, value: v }))
            .filter((p) => !Number.isNaN(p.value)),
        );
      }
    }

    // Always apply visibility for toggles, even when data is unchanged
    if (ema9SeriesRef.current) {
      ema9SeriesRef.current.applyOptions({ visible: showEMA9 });
    }
    if (ema21SeriesRef.current) {
      ema21SeriesRef.current.applyOptions({ visible: showEMA21 });
    }
    if (bbUpperRef.current) {
      bbUpperRef.current.applyOptions({ visible: showBB });
    }
    if (bbLowerRef.current) {
      bbLowerRef.current.applyOptions({ visible: showBB });
    }
    if (bbMiddleRef.current) {
      bbMiddleRef.current.applyOptions({ visible: showBB });
    }

    if (!dataUnchanged) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [
    snapshot.data,
    selectedSymbol,
    selectedTimeframe,
    showEMA9,
    showEMA21,
    showBB,
  ]);

  return (
    <Card size="sm" className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between w-full gap-2">
          <span>Chart — {selectedSymbol}</span>
          <div className="flex items-center gap-1">
            {TIMEFRAMES.map((tf) => (
              <Button
                key={tf}
                variant={selectedTimeframe === tf ? "default" : "ghost"}
                size="xs"
                onClick={() => setSelectedTimeframe(tf)}
                className="text-[0.5625rem]"
              >
                {tf}
              </Button>
            ))}
          </div>
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-1">
            <Button
              variant={showEMA9 ? "default" : "ghost"}
              size="xs"
              onClick={() => setShowEMA9(!showEMA9)}
              className="text-[0.5625rem]"
            >
              EMA9
            </Button>
            <Button
              variant={showEMA21 ? "default" : "ghost"}
              size="xs"
              onClick={() => setShowEMA21(!showEMA21)}
              className="text-[0.5625rem]"
            >
              EMA21
            </Button>
            <Button
              variant={showBB ? "default" : "ghost"}
              size="xs"
              onClick={() => setShowBB(!showBB)}
              className="text-[0.5625rem]"
            >
              BB
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 relative p-0">
        {ohlcTooltip && (
          <div className="absolute top-1 left-1 z-10 flex gap-2 text-[0.5625rem] font-mono bg-card/90 px-1.5 py-0.5 rounded">
            <span>O: {ohlcTooltip.open.toFixed(2)}</span>
            <span className="text-terminal-green">
              H: {ohlcTooltip.high.toFixed(2)}
            </span>
            <span className="text-terminal-red">
              L: {ohlcTooltip.low.toFixed(2)}
            </span>
            <span>C: {ohlcTooltip.close.toFixed(2)}</span>
            <span className="text-terminal-dim">
              V: {ohlcTooltip.volume.toLocaleString()}
            </span>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full min-h-[250px]" />
      </CardContent>
    </Card>
  );
}
