"use client";

import { useMemo } from "react";
import { usd } from "@/lib/format";

export function PayoffChart({
  curve,
  spot,
  strike,
  breakevens,
  hoverPrice,
  onHover,
}: {
  curve: { price: number; pnl: number }[];
  spot: number;
  strike?: number;
  breakevens: number[];
  hoverPrice: number;
  onHover: (price: number) => void;
}) {
  const W = 720;
  const H = 280;
  const pad = { l: 58, r: 16, t: 16, b: 36 };

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
    const zero = y(0);
    const gain = curve.filter((p) => p.pnl >= 0);
    const loss = curve.filter((p) => p.pnl <= 0);
    return { minX, maxX, x, y, pts, zero, gain, loss };
  }, [curve]);

  if (!geom || !curve.length) {
    return <div className="h-[280px] grid place-items-center text-sm text-slate-500">Select a contract to see gain / loss</div>;
  }

  const { x, y, pts, zero, minX, maxX } = geom;
  const hoverX = x(hoverPrice);
  const hoverY = y(curve.reduce((best, p) => (Math.abs(p.price - hoverPrice) < Math.abs(best.price - hoverPrice) ? p : best), curve[0]).pnl);

  function priceFromClientX(clientX: number, target: SVGSVGElement) {
    const box = target.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * W;
    const t = (sx - pad.l) / (W - pad.l - pad.r);
    return minX + Math.min(1, Math.max(0, t)) * (maxX - minX);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[280px]"
      data-testid="payoff-chart"
      onMouseMove={(e) => onHover(priceFromClientX(e.clientX, e.currentTarget))}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) onHover(priceFromClientX(t.clientX, e.currentTarget));
      }}
    >
      <rect x="0" y="0" width={W} height={H} fill="transparent" />
      <line x1={pad.l} x2={W - pad.r} y1={zero} y2={zero} stroke="currentColor" className="text-slate-600" strokeDasharray="4 4" />
      <polygon points={`${x(curve[0].price)},${zero} ${pts} ${x(curve[curve.length - 1].price)},${zero}`} fill="url(#pnlFill)" opacity="0.35" />
      <defs>
        <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="50%" stopColor="#4ade80" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#f87171" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#f87171" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="#38bdf8" strokeWidth="2.2" />
      {strike != null && (
        <g>
          <line x1={x(strike)} x2={x(strike)} y1={pad.t} y2={H - pad.b} stroke="#a78bfa" strokeDasharray="3 3" />
          <text x={x(strike) + 4} y={pad.t + 12} className="fill-slate-400" fontSize="10">
            Strike {usd(strike)}
          </text>
        </g>
      )}
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
      <line x1={hoverX} x2={hoverX} y1={pad.t} y2={H - pad.b} stroke="#64748b" strokeOpacity="0.6" />
      <circle cx={hoverX} cy={hoverY} r="4" fill="#38bdf8" />
      <text x={pad.l} y={H - 10} className="fill-slate-500" fontSize="10">
        Stock price at expiration →
      </text>
      <text x="8" y={pad.t + 8} className="fill-slate-500" fontSize="10">
        $ P/L
      </text>
    </svg>
  );
}
