"use client";

import { useEffect, useRef } from "react";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { BreakoutChartBar } from "@/lib/breakoutPotential";

export function BreakoutChart({
  bars,
  overlays,
  highlightTime,
}: {
  bars: BreakoutChartBar[];
  overlays: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    support: number | null;
    resistance: number | null;
    high20: number | null;
    high50: number | null;
    swingHigh: number | null;
    swingLow: number | null;
  };
  highlightTime?: string | null;
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
        layout: {
          background: { type: ColorType.Solid, color: palette.background },
          textColor: palette.text,
          fontFamily: "Inter, sans-serif",
        },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border, timeVisible: true },
        width: ref.current.clientWidth,
        height: 260,
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
      const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
      vol.setData(
        bars.map((b) => ({
          time: b.time as import("lightweight-charts").UTCTimestamp,
          value: b.volume,
          color: b.close >= b.open ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.35)",
        })),
      );
      const line = (price: number | null | undefined, color: string, title: string) => {
        if (price == null) return;
        candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });
      };
      line(overlays.resistance, "#f59e0b", "Res");
      line(overlays.support, "#38bdf8", "Sup");
      line(overlays.ema20, "#60a5fa", "EMA20");
      line(overlays.ema50, "#a78bfa", "EMA50");
      line(overlays.ema200, "#94a3b8", "EMA200");
      line(overlays.high20, "#fbbf24", "20H");
      line(overlays.swingHigh, "#fb7185", "Swing H");
      line(overlays.swingLow, "#34d399", "Swing L");
      if (highlightTime) {
        const ts = Math.floor(new Date(highlightTime).getTime() / 1000);
        const match = bars.find((b) => Math.abs(b.time - ts) < 3 * 24 * 3600) || bars[bars.length - 1];
        if (match) chart.timeScale().setVisibleLogicalRange({ from: bars.length - 40, to: bars.length });
      }
      const ro = new ResizeObserver(() => {
        if (ref.current && chart) chart.applyOptions({ width: ref.current.clientWidth });
      });
      ro.observe(ref.current);
    })();
    return () => {
      disposed = true;
      chart?.remove();
    };
  }, [bars, overlays, highlightTime, theme]);

  if (!bars.length) {
    return <div className="h-[260px] grid place-items-center text-xs text-slate-500">Chart unavailable</div>;
  }
  return <div ref={ref} className="h-[260px] w-full" />;
}
