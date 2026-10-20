"use client";

import { useEffect, useRef, useState } from "react";
import type { ScalpAnalysis, ScalpChartTimeframe } from "@/lib/scalp";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";

const CHART_TFS: ScalpChartTimeframe[] = ["5m", "15m", "30m", "1h", "1d"];

export function ScalpChart({
  data,
  chartTf,
  onChartTf,
}: {
  data: ScalpAnalysis;
  chartTf: ScalpChartTimeframe;
  onChartTf: (tf: ScalpChartTimeframe) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [show, setShow] = useState({ vwap: true, ema: true, levels: true, plan: true });

  useEffect(() => {
    const bars = data.barSets?.[chartTf]?.length ? data.barSets[chartTf]! : data.bars;
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
        timeScale: { borderColor: palette.border, timeVisible: chartTf !== "1d" },
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
      candle.setData(bars.map((b) => ({ time: b.time as import("lightweight-charts").UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
      const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(bars.map((b) => ({ time: b.time as import("lightweight-charts").UTCTimestamp, value: b.volume, color: b.close >= b.open ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.35)" })));
      const line = (price: number | null | undefined, color: string, title: string) => {
        if (price == null || !Number.isFinite(price)) return;
        candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });
      };
      if (show.ema) {
        line(data.overlays.ema9, "#38bdf8", "EMA9");
        line(data.overlays.ema20, "#c084fc", "EMA20");
        line(data.overlays.ema50, "#fbbf24", "EMA50");
      }
      if (show.vwap) line(data.overlays.vwap, "#e2e8f0", "VWAP");
      if (show.levels) {
        for (const lv of data.keyLevels) {
          if (!lv.price) continue;
          if (["pdh", "pdl", "pmh", "pml", "orh", "orl", "vwap"].includes(lv.id)) {
            line(lv.price, lv.id.includes("l") ? "#4ade80" : "#f87171", lv.id.toUpperCase());
          }
        }
      }
      if (show.plan) {
        line(data.riskReward.entry, "#38bdf8", "ENTRY");
        line(data.riskReward.stop, "#fb7185", "STOP");
        line(data.riskReward.t1, "#34d399", "T1");
      }
      chart.timeScale().fitContent();
      const ro = new ResizeObserver(() => {
        if (ref.current && chart) chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight });
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
  }, [data, chartTf, theme, show]);

  const bars = data.barSets?.[chartTf]?.length ? data.barSets[chartTf]! : data.bars;
  const last = bars[bars.length - 1];
  return (
    <div className="panel overflow-hidden h-[380px] xl:h-[440px] flex flex-col" data-testid="scalp-chart">
      <div className="px-3 py-2 border-b border-line flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="tracking-[0.16em] text-slate-500">PRICE CHART</span>
          <span className="text-slate-300 tick">
            {data.ticker} · {chartTf.toUpperCase()}
            {last ? `  O ${last.open.toFixed(2)} H ${last.high.toFixed(2)} L ${last.low.toFixed(2)} C ${last.close.toFixed(2)}` : ""}
          </span>
          {data.timeframes[data.primaryTimeframe]?.forming && <span className="text-warn">LIVE / FORMING</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {CHART_TFS.map((tf) => (
            <button key={tf} type="button" onClick={() => onChartTf(tf)} className={`px-2 py-0.5 rounded border ${chartTf === tf ? "border-accent text-white bg-accent/15" : "border-line text-slate-400"}`}>
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 py-1 border-b border-line flex flex-wrap gap-2 text-[10px] text-slate-400">
        {(["vwap", "ema", "levels", "plan"] as const).map((key) => (
          <label key={key} className="inline-flex items-center gap-1">
            <input type="checkbox" checked={show[key]} onChange={() => setShow((s) => ({ ...s, [key]: !s[key] }))} />
            {key.toUpperCase()}
          </label>
        ))}
      </div>
      <div ref={ref} className="flex-1 min-h-[240px]" />
    </div>
  );
}
