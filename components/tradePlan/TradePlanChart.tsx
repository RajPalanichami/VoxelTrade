"use client";

import { useEffect, useRef } from "react";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { TradePlanLevel } from "@/lib/tradePlan";

const COLORS: Record<string, string> = {
  "major-high": "#f43f5e",
  "b-wave": "#22d3ee",
  "y-high": "#e879f9",
  fib236: "#67e8f9",
  fib382: "#7dd3fc",
  fib500: "#818cf8",
  fib618: "#a78bfa",
  fib786: "#c084fc",
  fib886: "#d8b4fe",
  pre: "#facc15",
  vwap: "#fb923c",
  "wave-a": "#fde047",
  ext110: "#fb7185",
  ext127: "#4ade80",
  ext162: "#86efac",
  s1: "#34d399",
  s2: "#2dd4bf",
  "major-sup": "#fb7185",
  l1: "#4ade80",
  l2: "#fb7185",
  l3: "#fb923c",
  l4: "#a78bfa",
  l5: "#fbbf24",
  l6: "#34d399",
  l7: "#2dd4bf",
  l8: "#f43f5e",
};

export function TradePlanChart({
  bars,
  levels,
  timeframe,
}: {
  bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  levels: TradePlanLevel[];
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
        timeScale: { borderColor: palette.border, timeVisible: timeframe !== "4h" },
        width: ref.current.clientWidth,
        height: ref.current.clientHeight,
      });
      const candle = chart.addCandlestickSeries({
        upColor: "#4ade80",
        downColor: "#f43f5e",
        borderUpColor: "#4ade80",
        borderDownColor: "#f43f5e",
        wickUpColor: "#4ade80",
        wickDownColor: "#f43f5e",
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
      const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(
        bars.map((b) => ({
          time: b.time as import("lightweight-charts").UTCTimestamp,
          value: b.volume,
          color: b.close >= b.open ? "rgba(74,222,128,0.28)" : "rgba(244,63,94,0.28)",
        })),
      );
      const seen: number[] = [];
      for (const level of levels) {
        if (level.price == null) continue;
        if (seen.some((p) => Math.abs(p - level.price!) < 0.01)) continue;
        seen.push(level.price);
        candle.createPriceLine({
          price: level.price,
          color: COLORS[level.id] || "#94a3b8",
          lineWidth: level.starred ? 2 : 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: level.label,
        });
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
  }, [bars, levels, timeframe, theme]);

  return <div ref={ref} className="h-[480px] w-full" data-testid="trade-plan-chart" role="img" aria-label={`${timeframe} trade plan chart`} />;
}
