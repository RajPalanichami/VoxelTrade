"use client";

import { useEffect, useRef } from "react";
import type { CryptoCandle, CryptoChartTimeframe, CryptoMarketRange, CryptoSeriesPoint } from "@/lib/crypto";
import { CRYPTO_CHART_TIMEFRAMES, CRYPTO_MARKET_RANGES } from "@/lib/crypto";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";

export function CryptoCandleChart({
  bars,
  timeframe,
  onTimeframe,
  livePrice,
}: {
  bars: CryptoCandle[];
  timeframe: CryptoChartTimeframe;
  onTimeframe: (tf: CryptoChartTimeframe) => void;
  livePrice?: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current || !bars.length) return;
    let chart: import("lightweight-charts").IChartApi | undefined;
    let disposed = false;
    (async () => {
      const { createChart, ColorType, CrosshairMode } = await import("lightweight-charts");
      if (disposed || !ref.current) return;
      const palette = chartPalette();
      chart = createChart(ref.current, {
        layout: { background: { type: ColorType.Solid, color: palette.background }, textColor: palette.text, fontFamily: "Inter, sans-serif" },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border, timeVisible: timeframe !== "1d" && timeframe !== "1w" && timeframe !== "1M" },
        width: ref.current.clientWidth,
        height: ref.current.clientHeight,
      });
      const candle = chart.addCandlestickSeries({
        upColor: "#4ade80",
        downColor: "#f87171",
        borderUpColor: "#4ade80",
        borderDownColor: "#f87171",
        wickUpColor: "#4ade80",
        wickDownColor: "#f87171",
      });
      const data = bars.map((b) => ({
        time: b.time as import("lightweight-charts").UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: livePrice && b === bars[bars.length - 1] ? livePrice : b.close,
      }));
      candle.setData(data);
      const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      vol.setData(
        bars.map((b) => ({
          time: b.time as import("lightweight-charts").UTCTimestamp,
          value: b.volume,
          color: b.close >= b.open ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.35)",
        })),
      );
      chart.timeScale().fitContent();
      const ro = new ResizeObserver(() => {
        if (ref.current && chart) chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight });
      });
      ro.observe(ref.current);
      return () => ro.disconnect();
    })();
    return () => {
      disposed = true;
      chart?.remove();
    };
  }, [bars, timeframe, theme, livePrice]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-1" data-testid="crypto-timeframes">
        {CRYPTO_CHART_TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => onTimeframe(tf)}
            className={`px-2.5 py-1 rounded-md border text-[11px] ${tf === timeframe ? "border-accent bg-accent/15 text-white" : "border-line text-slate-400"}`}
          >
            {tf.toUpperCase()}
          </button>
        ))}
      </div>
      <div ref={ref} className="h-[320px] w-full" data-testid="crypto-candle-chart" role="img" aria-label={`Bitcoin ${timeframe} candlestick chart`} />
      {!bars.length ? <div className="text-sm text-slate-500">Chart unavailable for this timeframe.</div> : null}
    </div>
  );
}

export function CryptoAreaChart({
  series,
  range,
  onRange,
  label,
}: {
  series: CryptoSeriesPoint[];
  range: CryptoMarketRange;
  onRange: (r: CryptoMarketRange) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current || !series.length) return;
    let chart: import("lightweight-charts").IChartApi | undefined;
    let disposed = false;
    (async () => {
      const { createChart, ColorType } = await import("lightweight-charts");
      if (disposed || !ref.current) return;
      const palette = chartPalette();
      chart = createChart(ref.current, {
        layout: { background: { type: ColorType.Solid, color: palette.background }, textColor: palette.text, fontFamily: "Inter, sans-serif" },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border },
        width: ref.current.clientWidth,
        height: ref.current.clientHeight,
      });
      const area = chart.addAreaSeries({ lineColor: "#38bdf8", topColor: "rgba(56,189,248,0.28)", bottomColor: "rgba(56,189,248,0.02)" });
      area.setData(series.map((p) => ({ time: p.time as import("lightweight-charts").UTCTimestamp, value: p.value })));
      chart.timeScale().fitContent();
    })();
    return () => {
      disposed = true;
      chart?.remove();
    };
  }, [series, theme]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" data-testid="crypto-market-ranges">
        {CRYPTO_MARKET_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRange(r)}
            className={`px-2.5 py-1 rounded-md border text-[11px] ${r === range ? "border-accent bg-accent/15 text-white" : "border-line text-slate-400"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <div ref={ref} className="h-[220px] w-full" data-testid="crypto-marketcap-chart" role="img" aria-label={label} />
      {!series.length ? <div className="text-sm text-slate-500">Historical series unavailable for this range.</div> : null}
    </div>
  );
}
