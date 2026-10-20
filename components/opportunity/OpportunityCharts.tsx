"use client";

import { useEffect, useRef } from "react";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { OpportunityChartBar } from "@/lib/opportunity";

export function OpportunityChart({
  bars,
  title,
  resistance,
  support,
  entry,
  stop,
  t1,
}: {
  bars: OpportunityChartBar[];
  title: string;
  resistance?: number | null;
  support?: number | null;
  entry?: number | null;
  stop?: number | null;
  t1?: number | null;
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
        timeScale: { borderColor: palette.border, timeVisible: title !== "Daily" },
        width: ref.current.clientWidth,
        height: 180,
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
      const addLine = (price: number | null | undefined, color: string, titleText: string) => {
        if (price == null) return;
        candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: titleText });
      };
      addLine(resistance, "#f59e0b", "Res");
      addLine(support, "#38bdf8", "Sup");
      addLine(entry, "#a78bfa", "Entry");
      addLine(stop, "#f87171", "Inv");
      addLine(t1, "#4ade80", "T1");
      const ro = new ResizeObserver(() => {
        if (ref.current && chart) chart.applyOptions({ width: ref.current.clientWidth });
      });
      ro.observe(ref.current);
      return () => ro.disconnect();
    })();
    return () => {
      disposed = true;
      chart?.remove();
    };
  }, [bars, title, resistance, support, entry, stop, t1, theme]);

  if (!bars.length) {
    return (
      <div className="panel p-3">
        <div className="text-[11px] tracking-[0.14em] text-slate-500 mb-2">{title}</div>
        <div className="h-[180px] grid place-items-center text-xs text-slate-500">Chart unavailable</div>
      </div>
    );
  }

  return (
    <div className="panel p-3">
      <div className="text-[11px] tracking-[0.14em] text-slate-500 mb-2">{title}</div>
      <div ref={ref} className="h-[180px] w-full" />
    </div>
  );
}
