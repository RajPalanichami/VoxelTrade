"use client";

import { useEffect, useRef } from "react";
import { Mag7Range, PERF_RANGES } from "@/lib/mag7";
import { sectorColor } from "@/lib/sectors";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";

export function SectorChart({
  series,
  range,
  onRange,
  legend,
}: {
  series: Record<string, { time: number; value: number }[]>;
  range: Mag7Range;
  onRange: (r: Mag7Range) => void;
  legend: Record<string, number | null>;
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
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border },
        width: ref.current.clientWidth,
        height: 300,
      });
      Object.entries(series).forEach(([name, pts], i) => {
        if (!pts?.length) return;
        const line = chart!.addLineSeries({
          color: sectorColor(name, i),
          lineWidth: 2,
          title: name,
          priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(1) },
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
          <div className="text-[11px] tracking-[0.18em] text-slate-500">RELATIVE PERFORMANCE</div>
          <div className="text-sm text-white">Normalized to 100 at the start of {range}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {PERF_RANGES.map((r) => (
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
        {Object.entries(legend)
          .sort((a, b) => (b[1] || 0) - (a[1] || 0))
          .map(([k, v], i) => (
            <span key={k} className="flex items-center gap-1.5 text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ background: sectorColor(k, i) }} />
              {k} {v != null ? v.toFixed(1) : "—"}
            </span>
          ))}
      </div>
      <div ref={ref} className="h-[300px]" />
    </div>
  );
}
