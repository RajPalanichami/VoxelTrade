"use client";

import { useEffect, useRef } from "react";
import { MAG7_COLORS } from "@/lib/mag7";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";

export function Mag7CompareChart({
  series,
  legend,
  label,
  colors,
  testId = "mag7-compare-chart",
}: {
  series: Record<string, { time: number; value: number }[]>;
  legend: Record<string, number | null>;
  label: string;
  colors?: Record<string, string>;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const paletteColors = colors || MAG7_COLORS;

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
        height: 280,
      });
      Object.entries(series).forEach(([name, pts]) => {
        if (!pts?.length) return;
        const line = chart!.addLineSeries({
          color: paletteColors[name] || "#94a3b8",
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
  }, [series, theme, paletteColors]);

  return (
    <div className="panel overflow-hidden" data-testid={testId}>
      <div className="px-4 py-3 border-b border-line">
        <div className="text-[11px] tracking-[0.18em] text-slate-500">RELATIVE PERFORMANCE · {label.toUpperCase()}</div>
        <div className="text-sm text-white">Normalized to 100 at the start of the visible window</div>
      </div>
      <div className="px-4 pt-2 flex flex-wrap gap-3 text-[11px]">
        {Object.entries(legend)
          .sort((a, b) => (b[1] || 0) - (a[1] || 0))
          .map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ background: paletteColors[k] || "#94a3b8" }} />
              {k} {v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}` : "—"}
            </span>
          ))}
      </div>
      <div ref={ref} className="h-[280px]" />
    </div>
  );
}
