"use client";

import { useEffect, useRef } from "react";
import { Candle, Indicators, Levels, Plan } from "@/lib/types";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";

export function PriceChart({
  bars,
  indicators,
  levels,
  plan,
  timeframe,
}: {
  bars: Candle[];
  indicators: Indicators;
  levels: Levels;
  plan: Plan;
  timeframe: string;
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
        grid: {
          vertLines: { color: palette.grid },
          horzLines: { color: palette.grid },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border, timeVisible: timeframe !== "1d" },
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
        }))
      );

      const vol = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      vol.setData(
        bars.map((b) => ({
          time: b.time as import("lightweight-charts").UTCTimestamp,
          value: b.volume,
          color: b.close >= b.open ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.35)",
        }))
      );

      const addLine = (price: number | null | undefined, color: string, title: string) => {
        if (!price) return;
        candle.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title,
        });
      };

      addLine(indicators.ema20 ?? indicators.ema21, "#60a5fa", "EMA20");
      addLine(indicators.ema50, "#fbbf24", "EMA50");
      addLine(indicators.ema200, "#c084fc", "EMA200");
      addLine(indicators.vwap, "#e2e8f0", "VWAP");
      addLine(levels.r1, "#f87171", "R1");
      addLine(levels.r2, "#f87171", "R2");
      addLine(levels.r3, "#f87171", "R3");
      addLine(levels.s1, "#4ade80", "S1");
      addLine(levels.s2, "#4ade80", "S2");
      addLine(levels.s3, "#4ade80", "S3");
      addLine(plan.ideal_entry, "#38bdf8", "ENTRY");
      addLine(plan.stop, "#fb7185", "STOP");
      addLine(plan.target1, "#34d399", "TP1");
      addLine(plan.target2, "#34d399", "TP2");
      addLine(plan.target3, "#34d399", "TP3");

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
        const ro = (chart as unknown as { __ro?: ResizeObserver }).__ro;
        ro?.disconnect();
        chart.remove();
      }
    };
  }, [bars, indicators, levels, plan, timeframe, theme]);

  return (
    <div className="panel overflow-hidden h-[380px] lg:h-[420px] flex flex-col">
      <div className="px-4 py-2 border-b border-line flex items-center justify-between text-xs">
        <span className="tracking-[0.18em] text-slate-500">PRICE CHART · {timeframe.toUpperCase()}</span>
        <span className="text-slate-500">EMA20 / EMA50 / EMA200 · VWAP · S/R · Entry/Stop/TP</span>
      </div>
      <div ref={ref} className="flex-1" />
    </div>
  );
}
