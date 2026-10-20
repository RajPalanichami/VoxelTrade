"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { chartPalette } from "@/lib/theme";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { ChartCandle, FibSet, GapZone, PriceZone, TrendLine } from "@/src/engines/technicalChart";

export type ChartEma = { period: number; color: string; series: (number | null)[] };

export function TechnicalChart({
  candles,
  emas,
  zones,
  fib,
  gap,
  trendlines,
  showZones,
  showFib,
  showVolume,
  timeframe,
  onCandle,
  resetRef,
}: {
  candles: ChartCandle[];
  emas: ChartEma[];
  zones: PriceZone[];
  fib: FibSet | null;
  gap: GapZone | null;
  trendlines: TrendLine[];
  showZones: boolean;
  showFib: boolean;
  showVolume: boolean;
  timeframe: string;
  onCandle: (candle: ChartCandle | null) => void;
  resetRef: MutableRefObject<(() => void) | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCandleRef = useRef(onCandle);
  onCandleRef.current = onCandle;
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current || !candles.length) return;
    let chart: import("lightweight-charts").IChartApi | undefined;
    let disposed = false;
    const host = ref.current;

    (async () => {
      const { createChart, ColorType, CrosshairMode } = await import("lightweight-charts");
      if (disposed || !host) return;
      const palette = chartPalette();
      chart = createChart(host, {
        layout: { background: { type: ColorType.Solid, color: palette.background }, textColor: palette.text, fontFamily: "Inter, sans-serif" },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border, timeVisible: timeframe !== "1d" && timeframe !== "1w", rightOffset: 6 },
        width: host.clientWidth,
        height: host.clientHeight,
        handleScroll: true,
        handleScale: true,
      });
      const precision = (candles[candles.length - 1]?.close ?? 1) < 2 ? 4 : 2;
      const candleSeries = chart.addCandlestickSeries({
        upColor: "#4ade80",
        downColor: "#f87171",
        borderUpColor: "#4ade80",
        borderDownColor: "#f87171",
        wickUpColor: "#4ade80",
        wickDownColor: "#f87171",
        priceFormat: { type: "price", precision, minMove: precision === 4 ? 0.0001 : 0.01 },
      });
      candleSeries.setData(
        candles.map((candle) => ({
          time: candle.time as import("lightweight-charts").UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })),
      );
      if (showVolume) {
        const volume = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
        volume.setData(
          candles.map((candle) => ({
            time: candle.time as import("lightweight-charts").UTCTimestamp,
            value: candle.volume ?? 0,
            color: candle.close >= candle.open ? "rgba(74,222,128,0.45)" : "rgba(248,113,113,0.45)",
          })),
        );
      }
      for (const ema of emas) {
        const line = chart.addLineSeries({
          color: ema.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        line.setData(
          candles.flatMap((candle, index) => {
            const value = ema.series[index];
            return value == null ? [] : [{ time: candle.time as import("lightweight-charts").UTCTimestamp, value }];
          }),
        );
      }
      const markers = markerSet(candles, fib);
      if (markers.length) candleSeries.setMarkers(markers);
      if (showZones) {
        for (const zone of zones.slice(0, 4)) {
          candleSeries.createPriceLine({
            price: (zone.low + zone.high) / 2,
            color: zone.kind === "support" ? "#4ade80" : "#f87171",
            lineWidth: 1,
            lineStyle: zone.established ? 0 : 2,
            axisLabelVisible: true,
            title: `${zone.kind === "support" ? "S" : "R"} ${zone.low.toFixed(precision)}-${zone.high.toFixed(precision)}`,
          });
        }
      }
      if (showFib && fib) {
        for (const level of fib.levels) {
          candleSeries.createPriceLine({
            price: level.price,
            color: "#38bdf8",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: level.label,
          });
        }
      }
      for (const trend of trendlines) {
        const line = chart.addLineSeries({
          color: trend.kind === "descending" ? "#fb7185" : "#34d399",
          lineWidth: 2,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const points = [...trend.anchors, trend.projected]
          .sort((a, b) => a.time - b.time)
          .filter((point, index, all) => index === 0 || point.time !== all[index - 1].time);
        if (points.length >= 2) {
          line.setData(points.map((point) => ({ time: point.time as import("lightweight-charts").UTCTimestamp, value: point.price })));
        }
      }
      if (gap) {
        drawLevel(chart, candles, gap.low, gap.direction === "up" ? "rgba(74,222,128,0.9)" : "rgba(248,113,113,0.9)");
        drawLevel(chart, candles, gap.high, gap.direction === "up" ? "rgba(74,222,128,0.9)" : "rgba(248,113,113,0.9)");
      }
      chart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          onCandleRef.current(null);
          return;
        }
        const match = candles.find((candle) => candle.time === param.time);
        onCandleRef.current(match ?? null);
      });
      chart.timeScale().fitContent();
      resetRef.current = () => chart?.timeScale().fitContent();
      const observer = new ResizeObserver(() => {
        if (host && chart) chart.applyOptions({ width: host.clientWidth, height: host.clientHeight });
      });
      observer.observe(host);
      (chart as unknown as { __ro?: ResizeObserver }).__ro = observer;
    })();

    return () => {
      disposed = true;
      resetRef.current = null;
      if (chart) {
        (chart as unknown as { __ro?: ResizeObserver }).__ro?.disconnect();
        chart.remove();
      }
    };
  }, [candles, emas, fib, gap, resetRef, showFib, showVolume, showZones, theme, timeframe, trendlines, zones]);

  return <div ref={ref} className="h-full w-full" role="img" aria-label={`Candlestick chart, ${timeframe}`} />;
}

function markerSet(candles: ChartCandle[], fib: FibSet | null) {
  if (!fib) return [];
  const high = candles.find((candle) => candle.time === fib.high.time);
  const low = candles.find((candle) => candle.time === fib.low.time);
  const markers: import("lightweight-charts").SeriesMarker<import("lightweight-charts").UTCTimestamp>[] = [];
  if (high) {
    markers.push({
      time: high.time as import("lightweight-charts").UTCTimestamp,
      position: "aboveBar",
      color: "#f87171",
      shape: "arrowDown",
      text: "Swing high",
    });
  }
  if (low) {
    markers.push({
      time: low.time as import("lightweight-charts").UTCTimestamp,
      position: "belowBar",
      color: "#4ade80",
      shape: "arrowUp",
      text: "Swing low",
    });
  }
  return markers.sort((a, b) => (a.time as number) - (b.time as number));
}

function drawLevel(chart: import("lightweight-charts").IChartApi, candles: ChartCandle[], price: number, color: string) {
  const line = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last || first.time === last.time) return;
  line.setData([
    { time: first.time as import("lightweight-charts").UTCTimestamp, value: price },
    { time: last.time as import("lightweight-charts").UTCTimestamp, value: price },
  ]);
}
