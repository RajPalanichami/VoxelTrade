"use client";

import { useEffect, useRef } from "react";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { StockDecisionBar, StockDecisionLevel, StockDecisionMap } from "@/lib/stockDecision";

export type DecisionOverlays = {
  vwap: boolean;
  ema: boolean;
  sr: boolean;
  volume: boolean;
};

export function DecisionChart({
  bars,
  overlays,
  map,
  timeframe,
}: {
  bars: StockDecisionBar[];
  overlays: DecisionOverlays;
  map: StockDecisionMap;
  timeframe: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current || !bars.length) return;
    let chart: import("lightweight-charts").IChartApi | undefined;
    let disposed = false;
    let ro: ResizeObserver | undefined;
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
      candle.setData(
        bars.map((b) => ({
          time: b.time as import("lightweight-charts").UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      );
      if (overlays.volume) {
        const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        vol.setData(
          bars.map((b) => ({
            time: b.time as import("lightweight-charts").UTCTimestamp,
            value: b.volume,
            color: b.close >= b.open ? "rgba(74,222,128,0.32)" : "rgba(248,113,113,0.32)",
          })),
        );
      }
      const line = (price: number | null | undefined, color: string, title: string) => {
        if (price == null) return;
        candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });
      };
      if (overlays.vwap) line(map.vwap.value, "#fb923c", "VWAP");
      if (overlays.ema) {
        line(map.overlays.ema9, "#67e8f9", "EMA9");
        line(map.overlays.ema21, "#38bdf8", "EMA21");
        line(map.overlays.sma50, "#fbbf24", "SMA50");
        line(map.overlays.sma200, "#c084fc", "SMA200");
      }
      if (overlays.sr) {
        const addLevels = (levels: StockDecisionLevel[], color: string) => {
          for (const l of levels) line(l.price, color, l.label);
        };
        addLevels(map.supports, "#34d399");
        addLevels(map.resistances, "#f87171");
        line(map.breakout.resistance, "#fb7185", "Breakout");
      }
      chart.timeScale().fitContent();
      ro = new ResizeObserver(() => {
        if (ref.current && chart) chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight });
      });
      ro.observe(ref.current);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.remove();
    };
  }, [bars, map, overlays, timeframe, theme]);

  return (
    <div
      ref={ref}
      className="h-[380px] w-full"
      data-testid="decision-chart"
      role="img"
      aria-label={`${map.symbol} ${timeframe} candlestick chart with optional VWAP, moving averages, and support/resistance`}
    />
  );
}
