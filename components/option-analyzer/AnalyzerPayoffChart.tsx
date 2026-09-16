"use client";

import { useMemo } from "react";
import { usd } from "@/lib/format";
import type { PriceZone } from "@/src/engines/optionAnalyzerPayoff";

export function AnalyzerPayoffChart({
  curve,
  spot,
  strikes,
  breakevens,
  hoverPrice,
  onHover,
  maxLossZones = [],
  maxProfitZones = [],
  lossContinues = false,
}: {
  curve: { price: number; pnl: number }[];
  spot: number;
  strikes: number[];
  breakevens: number[];
  hoverPrice: number;
  onHover: (price: number) => void;
  maxLossZones?: PriceZone[];
  maxProfitZones?: PriceZone[];
  lossContinues?: boolean;
}) {
  const W = 720;
  const H = 300;
  const pad = { l: 58, r: 16, t: 18, b: 40 };

  const geom = useMemo(() => {
    if (!curve.length) return null;
    const xs = curve.map((p) => p.price);
    const ys = curve.map((p) => p.pnl);
    const minX = xs[0];
    const maxX = xs[xs.length - 1];
    const rawMinY = Math.min(...ys, 0);
    const rawMaxY = Math.max(...ys, 0);
    const padY = Math.max((rawMaxY - rawMinY) * 0.12, 40);
    const minY = rawMinY - padY;
    const maxY = rawMaxY + padY;
    const x = (px: number) => pad.l + ((px - minX) / (maxX - minX || 1)) * (W - pad.l - pad.r);
    const y = (py: number) => pad.t + ((maxY - py) / (maxY - minY || 1)) * (H - pad.t - pad.b);
    const pts = curve.map((p) => `${x(p.price).toFixed(1)},${y(p.pnl).toFixed(1)}`).join(" ");
    return { minX, maxX, x, y, pts, zero: y(0) };
  }, [curve]);

  if (!geom || !curve.length) {
    return <div className="h-[300px] grid place-items-center text-sm text-slate-500">Select a strategy to see the expiration payoff</div>;
  }

  const { x, y, pts, zero, minX, maxX } = geom;
  const nearest = curve.reduce((best, p) => (Math.abs(p.price - hoverPrice) < Math.abs(best.price - hoverPrice) ? p : best), curve[0]);

  function priceFromClientX(clientX: number, target: SVGSVGElement) {
    const box = target.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * W;
    const t = (sx - pad.l) / (W - pad.l - pad.r);
    return minX + Math.min(1, Math.max(0, t)) * (maxX - minX);
  }

  function zoneRect(zone: PriceZone, fill: string) {
    const left = x(zone.from == null ? minX : Math.max(minX, zone.from));
    const right = x(zone.to == null ? maxX : Math.min(maxX, zone.to));
    return <rect key={`${fill}-${left}-${right}`} x={left} y={pad.t} width={Math.max(0, right - left)} height={H - pad.t - pad.b} fill={fill} />;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[300px]"
      data-testid="analyzer-payoff-chart"
      onMouseMove={(e) => onHover(priceFromClientX(e.clientX, e.currentTarget))}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) onHover(priceFromClientX(t.clientX, e.currentTarget));
      }}
    >
      <rect x="0" y="0" width={W} height={H} fill="transparent" />
      {maxLossZones.map((z) => zoneRect(z, "rgba(248,113,113,0.12)"))}
      {maxProfitZones.map((z) => zoneRect(z, "rgba(74,222,128,0.10)"))}
      <line x1={pad.l} x2={W - pad.r} y1={zero} y2={zero} stroke="currentColor" className="text-slate-500" strokeDasharray="4 4" />
      <polygon points={`${x(curve[0].price)},${zero} ${pts} ${x(curve[curve.length - 1].price)},${zero}`} fill="url(#analyzerPnlFill)" opacity="0.35" />
      <defs>
        <linearGradient id="analyzerPnlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="50%" stopColor="#4ade80" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#f87171" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#f87171" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="#38bdf8" strokeWidth="2.2" />
      {strikes.map((k) => (
        <g key={`k-${k}`}>
          <line x1={x(k)} x2={x(k)} y1={pad.t} y2={H - pad.b} stroke="#64748b" strokeOpacity="0.35" strokeDasharray="2 3" />
          <text x={x(k) + 3} y={pad.t + 10} className="fill-slate-500" fontSize="9">
            K {usd(k)}
          </text>
        </g>
      ))}
      <line x1={x(spot)} x2={x(spot)} y1={pad.t} y2={H - pad.b} stroke="#fbbf24" strokeDasharray="2 4" />
      <text x={x(spot) + 4} y={H - pad.b - 6} className="fill-slate-400" fontSize="10">
        Now {usd(spot)}
      </text>
      {breakevens.map((b) => (
        <g key={b}>
          <circle cx={x(b)} cy={zero} r="3.5" fill="#f8fafc" />
          <text x={x(b) + 6} y={zero - 8} className="fill-slate-300" fontSize="10">
            BE {usd(b)}
          </text>
        </g>
      ))}
      <line x1={x(nearest.price)} x2={x(nearest.price)} y1={pad.t} y2={H - pad.b} stroke="#64748b" strokeOpacity="0.6" />
      <circle cx={x(nearest.price)} cy={y(nearest.pnl)} r="4" fill="#38bdf8" />
      <text x={pad.l} y={H - 10} className="fill-slate-500" fontSize="10">
        Underlying price at expiration →
      </text>
      <text x="8" y={pad.t + 8} className="fill-slate-500" fontSize="10">
        $ P/L
      </text>
      {lossContinues ? (
        <text x={W - pad.r - 8} y={pad.t + 12} className="fill-rose-300" fontSize="10" textAnchor="end">
          Loss continues beyond displayed range →
        </text>
      ) : null}
    </svg>
  );
}
