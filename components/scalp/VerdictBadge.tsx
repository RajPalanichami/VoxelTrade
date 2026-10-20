import type { ScalpDirection, ScalpVerdict } from "@/lib/scalp";

const VERDICT: Record<ScalpVerdict, string> = {
  YES: "bg-bull/15 text-bull border-bull/40",
  NO: "bg-bear/15 text-bear border-bear/40",
  NEUTRAL: "bg-warn/15 text-warn border-warn/40",
  INSUFFICIENT_DATA: "bg-slate-700/40 text-slate-300 border-line",
};

export function VerdictBadge({ verdict }: { verdict: ScalpVerdict }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold tracking-wide ${VERDICT[verdict]}`}>
      {verdict === "INSUFFICIENT_DATA" ? "INSUFFICIENT DATA" : verdict}
    </span>
  );
}

export function DirectionText({ direction }: { direction?: ScalpDirection }) {
  if (!direction) return null;
  const cls = direction === "BULLISH" ? "text-bull" : direction === "BEARISH" ? "text-bear" : "text-slate-400";
  return <span className={`text-[10px] ${cls}`}>{direction === "BULLISH" ? "↑" : direction === "BEARISH" ? "↓" : "→"} {direction}</span>;
}
