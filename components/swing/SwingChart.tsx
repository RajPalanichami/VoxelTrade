"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { Candle, SwingOverlays, SwingPlan, SwingStrategyId, SwingTimeframe } from "@/lib/types";
import { SWING_TIMEFRAMES } from "@/lib/types";

type ToggleKey = "indicators" | "sr" | "fib" | "liquidity" | "entry" | "targets" | "signals";

function lineGroup(title: string): ToggleKey | null {
  const t = title.toLowerCase();
  if (t.includes("fib")) return "fib";
  if (t.includes("hvn") || t.includes("liquidity")) return "liquidity";
  if (t.includes("swing high") || t.includes("swing low") || /^s\d/.test(t) || /^r\d/.test(t) || t === "s1" || t === "r1") return "sr";
  if (t.includes("entry") || t.includes("stop") || t.includes("invalid")) return "entry";
  if (t.includes("target") || t.startsWith("tp") || /^t[123]$/.test(t)) return "targets";
  if (t.includes("ema") || t.includes("bb") || t.includes("vwap") || t.includes("atr")) return "indicators";
  return "indicators";
}

export function SwingChart({
  symbol,
  timeframe,
  onTimeframe,
  strategyId,
  bars,
  overlays,
  plan,
}: {
  symbol: string;
  timeframe: SwingTimeframe;
  onTimeframe: (tf: SwingTimeframe) => void;
  strategyId: SwingStrategyId;
  bars: Candle[];
  overlays: SwingOverlays;
  plan: SwingPlan;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<import("lightweight-charts").IChartApi | null>(null);
  const { theme } = useTheme();
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    indicators: overlays.emas,
    sr: overlays.supportResistance,
    fib: overlays.fibonacci,
    liquidity: overlays.liquidity,
    entry: overlays.entryExit,
    targets: overlays.targets,
    signals: overlays.historical,
  });

  useEffect(() => {
    setToggles({
      indicators: overlays.emas,
      sr: overlays.supportResistance,
      fib: overlays.fibonacci,
      liquidity: overlays.liquidity,
      entry: overlays.entryExit,
      targets: overlays.targets,
      signals: overlays.historical,
    });
  }, [overlays, symbol, timeframe, strategyId]);

  const visibleLines = useMemo(() => {
    const extra = [...overlays.lines];
    if (toggles.entry && plan.allowed) {
      if (plan.entry != null) extra.push({ price: plan.entry, color: "#38bdf8", title: "ENTRY", style: "solid" });
      if (plan.entryLow != null && plan.entryLow !== plan.entry) extra.push({ price: plan.entryLow, color: "#7dd3fc", title: "ENTRY LOW", style: "dashed" });
      if (plan.entryHigh != null && plan.entryHigh !== plan.entry) extra.push({ price: plan.entryHigh, color: "#7dd3fc", title: "ENTRY HIGH", style: "dashed" });
      if (plan.stop != null) extra.push({ price: plan.stop, color: "#fb7185", title: "STOP", style: "solid" });
      if (plan.invalidation != null && plan.invalidation !== plan.stop) {
        extra.push({ price: plan.invalidation, color: "#f43f5e", title: "INVALID", style: "dashed" });
      }
    }
    if (toggles.targets && plan.allowed) {
      if (plan.target1 != null) extra.push({ price: plan.target1, color: "#34d399", title: "T1", style: "solid" });
      if (plan.target2 != null) extra.push({ price: plan.target2, color: "#6ee7b7", title: "T2", style: "dashed" });
      if (plan.target3 != null) extra.push({ price: plan.target3, color: "#a7f3d0", title: "T3", style: "dashed" });
    }
    return extra.filter((line) => {
      const group = lineGroup(line.title);
      return !group || toggles[group];
    });
  }, [overlays.lines, plan, toggles]);

  useEffect(() => {
    if (!host.current || !bars.length) return;
    let chart: import("lightweight-charts").IChartApi | undefined;
    let disposed = false;

    (async () => {
      const { createChart, ColorType, CrosshairMode } = await import("lightweight-charts");
      if (disposed || !host.current) return;
      const palette = chartPalette();
      chart = createChart(host.current, {
        layout: {
          background: { type: ColorType.Solid, color: palette.background },
          textColor: palette.text,
          fontFamily: "Inter, sans-serif",
        },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: palette.border },
        timeScale: {
          borderColor: palette.border,
          timeVisible: timeframe !== "1d" && timeframe !== "1w",
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        width: host.current.clientWidth,
        height: host.current.clientHeight,
      });
      chartRef.current = chart;

      const candle = chart.addCandlestickSeries({
        upColor: "#4ade80",
        downColor: "#f87171",
        borderUpColor: "#4ade80",
        borderDownColor: "#f87171",
        wickUpColor: "#4ade80",
        wickDownColor: "#f87171",
      });
      const candles = [...bars]
        .filter((b) => Number.isFinite(b.time))
        .sort((a, b) => a.time - b.time)
        .filter((b, i, arr) => i === 0 || b.time !== arr[i - 1].time);
      candle.setData(
        candles.map((b) => ({
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
        candles.map((b) => ({
          time: b.time as import("lightweight-charts").UTCTimestamp,
          value: b.volume,
          color: b.close >= b.open ? "rgba(74,222,128,0.28)" : "rgba(248,113,113,0.28)",
        })),
      );

      for (const line of visibleLines) {
        candle.createPriceLine({
          price: line.price,
          color: line.color,
          lineWidth: 1,
          lineStyle: line.style === "solid" ? 0 : 2,
          axisLabelVisible: true,
          title: line.title,
        });
      }

      if (toggles.signals && overlays.markers.length) {
        const candleTimes = new Set(candles.map((b) => b.time));
        const markers = [...overlays.markers]
          .filter((m) => Number.isFinite(m.time) && Number.isFinite(m.price) && candleTimes.has(m.time))
          .sort((a, b) => a.time - b.time)
          .filter((m, i, arr) => i === 0 || m.time !== arr[i - 1].time);
        if (markers.length) {
          candle.setMarkers(
            markers.map((m) => ({
              time: m.time as import("lightweight-charts").UTCTimestamp,
              position: m.kind === "low" ? "belowBar" : "aboveBar",
              color: m.kind === "low" ? "#4ade80" : m.kind === "sweep" ? "#facc15" : "#f87171",
              shape: m.kind === "low" ? "arrowUp" : "arrowDown",
              text: m.kind === "sweep" ? "SWEEP" : m.kind === "high" ? "SH" : m.kind === "low" ? "SL" : "SIG",
            })),
          );
        }
      }

      chart.timeScale().fitContent();
      const ro = new ResizeObserver(() => {
        if (host.current && chart) chart.applyOptions({ width: host.current.clientWidth, height: host.current.clientHeight });
      });
      ro.observe(host.current);
      (chart as unknown as { __ro?: ResizeObserver }).__ro = ro;
    })();

    return () => {
      disposed = true;
      chartRef.current = null;
      if (chart) {
        const ro = (chart as unknown as { __ro?: ResizeObserver }).__ro;
        ro?.disconnect();
        chart.remove();
      }
    };
  }, [bars, timeframe, theme, visibleLines, toggles.signals, overlays.markers, symbol, strategyId]);

  const flip = (key: ToggleKey) => setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="panel overflow-hidden flex flex-col" data-testid={`swing-chart-${strategyId}`}>
      <div className="px-3 py-2 border-b border-line flex flex-wrap items-center gap-2 text-[11px]">
        <span className="tracking-[0.16em] text-slate-500">{symbol} · {timeframe.toUpperCase()}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {(
            [
              ["indicators", "Indicators"],
              ["sr", "S/R"],
              ["fib", "Fibonacci"],
              ["liquidity", "Liquidity"],
              ["entry", "Entry/Exit"],
              ["targets", "Targets"],
              ["signals", "Signals"],
            ] as [ToggleKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => flip(key)}
              className={`px-2 py-1 rounded border ${toggles[key] ? "border-accent/50 text-white bg-accent/15" : "border-line text-slate-500"}`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="px-2 py-1 rounded border border-line text-slate-400"
            onClick={() => chartRef.current?.timeScale().fitContent()}
          >
            Reset zoom
          </button>
        </div>
      </div>
      <div className="px-3 py-2 border-b border-line flex flex-wrap items-center gap-1">
        {SWING_TIMEFRAMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTimeframe(t.id)}
            className={`px-2 py-1 rounded text-[11px] border ${
              t.id === timeframe ? "border-accent/60 bg-accent/20 text-white" : "border-line text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
        <p className="text-[11px] text-slate-500 ml-2">Drag to pan · scroll to zoom · timeframe updates all 10 strategies</p>
      </div>
      <div ref={host} className="h-[340px] lg:h-[380px]" />
    </div>
  );
}
