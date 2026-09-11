"use client";

export function Sparkline({ values, up, compact }: { values: number[]; up: boolean; compact?: boolean }) {
  if (!values || values.length < 2) {
    return <div className={compact ? "h-[22px] w-full" : "h-8 w-24"} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = compact ? 72 : 96;
  const h = compact ? 22 : 32;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = up ? "#4ade80" : "#f87171";
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={compact ? "w-full h-[22px] overflow-visible" : "overflow-visible"}
      preserveAspectRatio="none"
    >
      <polyline fill="none" stroke={color} strokeWidth={compact ? 1.4 : 1.6} points={pts} />
    </svg>
  );
}
