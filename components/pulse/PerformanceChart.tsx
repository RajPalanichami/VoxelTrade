"use client";

import { useEffect, useRef } from "react";
import { PulseRange } from "@/lib/pulse";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";

const COLORS: Record<string, string> = {
  SPY: "#38bdf8",
  QQQ: "#a78bfa",
  IWM: "#fb923c",
  "S&P 500": "#4ade80",
  Nasdaq: "#22d3ee",
};

const RANGES: PulseRange[] = ["1D", "1W", "1M", "3M", "1Y"];

export function PerformanceChart({
  series,
  range,
  onRange,
}: {
  series: Record<string, { time: number; value: number }[]>;
  range: PulseRange;
  onRange: (r: PulseRange) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current) return;
    let chart: import("lightweight-charts").IChartApi | undefined;
    let disposed = false;
    (async () => {
      const { createChart, ColorType } = await import("lightweight-charts");
      if (disposed || !ref.current) return;
      const palette = chartPalette();
      chart = createChart(ref.current, {
        layout: {
          background: { type: ColorType.Solid, color: palette.background },
          textColor: palette.text,
          fontFamily: "Inter, sans-serif",
        },
        grid: {
          vertLines: { color: palette.grid },
          horzLines: { color: palette.grid },
        },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border, timeVisible: range === "1D" || range === "1W" },
        width: ref.current.clientWidth,
        height: 280,
      });
      Object.entries(series).forEach(([name, pts]) => {
        if (!pts?.length) return;
        const line = chart!.addLineSeries({
          color: COLORS[name] || "#94a3b8",
          lineWidth: 2,
          title: name,
          priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(2)}%` },
        });
        line.setData(pts.map((p) => ({ time: p.time as import("lightweight-charts").UTCTimestamp, value: p.value })));
      });
      chart.timeScale().fitContent();
      const ro = new ResizeObserver(() => {
        if (ref.current && chart) chart.applyOptions({ width: ref.current.clientWidth });
      });
      ro.observe(ref.current);
      (chart as unknown as { __ro?: ResizeObserver }).__ro = ro;
    })();
    return () => {
      disposed = true;
      if (chart) {
        (chart as unknown as { __ro?: ResizeObserver }).__ro?.disconnect();
        chart.remove();
      }
    };
  }, [series, range, theme]);

  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] tracking-[0.18em] text-slate-500">MARKET PERFORMANCE</div>
          <div className="text-sm text-white">Percent change · {range}</div>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onRange(r)}
              className={`px-2.5 py-1 rounded text-xs ${r === range ? "bg-accent/20 text-white border border-accent/50" : "text-slate-400 border border-transparent hover:text-white"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pt-2 flex flex-wrap gap-3 text-[11px]">
        {Object.keys(COLORS).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} />
            {k}
          </span>
        ))}
      </div>
      <div ref={ref} className="h-[280px]" />
    </div>
  );
}
