"use client";

import { useEffect, useMemo, useRef } from "react";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { ComparePayload } from "@/lib/compare";

export function CompareChart({
  data,
  mode,
  overlays,
}: {
  data: ComparePayload;
  mode: "absolute" | "normalized" | "percent";
  overlays: { ema20: boolean; ema50: boolean; ema200: boolean };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const series = useMemo(() => {
    const map = (pts: ComparePayload["chart"]["t1"], color: string, title: string) => {
      if (!pts.length) return { title, color, pts: [] as { time: number; value: number }[] };
      const first = pts[0].close;
      const mapped = pts.map((p) => {
        let value = p.close;
        if (mode === "normalized" && first) value = (p.close / first) * 100;
        if (mode === "percent" && first) value = ((p.close - first) / first) * 100;
        return { time: p.time, value };
      });
      return { title, color, pts: mapped };
    };
    return [
      map(data.chart.t1, "#38bdf8", data.ticker1.symbol),
      map(data.chart.t2, "#fbbf24", data.ticker2.symbol),
    ];
  }, [data, mode]);

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
        height: 320,
      });
      for (const s of series) {
        if (!s.pts.length) continue;
        const line = chart.addLineSeries({ color: s.color, lineWidth: 2, title: s.title });
        line.setData(s.pts.map((p) => ({ time: p.time as import("lightweight-charts").UTCTimestamp, value: p.value })));
      }
      if (mode === "absolute") {
        const addEma = (key: "ema20" | "ema50" | "ema200", color: string) => {
          const pts = data.chart.t1.filter((p) => p[key] != null).map((p) => ({ time: p.time as import("lightweight-charts").UTCTimestamp, value: p[key] as number }));
          if (!pts.length) return;
          chart!.addLineSeries({ color, lineWidth: 1, title: key.toUpperCase() }).setData(pts);
        };
        if (overlays.ema20) addEma("ema20", "#4ade80");
        if (overlays.ema50) addEma("ema50", "#a78bfa");
        if (overlays.ema200) addEma("ema200", "#f87171");
      }
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
  }, [series, theme, mode, overlays, data.chart.t1]);

  return <div ref={ref} className="w-full h-[320px]" data-testid="compare-chart" />;
}
