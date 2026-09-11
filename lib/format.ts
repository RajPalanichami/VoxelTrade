export function money(n?: number | null, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function usd(n?: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${money(n)}`;
}

export function pct(n?: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function compact(n?: number | null) {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return money(n, 0);
}

export function toneClass(v?: string | number | null) {
  if (typeof v === "number") return v > 0 ? "text-bull" : v < 0 ? "text-bear" : "text-slate-400";
  const s = String(v || "").toUpperCase();
  if (["BUY", "STRONG_BUY", "BULLISH", "LIVE", "OPEN", "HIGH"].includes(s)) return "text-bull";
  if (["SELL", "BEARISH", "STALE", "UNAVAILABLE"].includes(s)) return "text-bear";
  if (["WAIT", "WEAK", "CAUTION", "NEUTRAL", "HOLD", "NO_TRADE", "DELAYED"].includes(s)) return "text-warn";
  return "text-slate-300";
}

export function signalLabel(s?: string) {
  return (s || "WAIT").replaceAll("_", " ");
}

export function statusDot(status?: string) {
  const s = (status || "").toUpperCase();
  if (s === "LIVE" || s === "OPEN") return "bg-bull shadow-[0_0_8px_#4ade80]";
  if (s === "STALE" || s === "UNAVAILABLE") return "bg-bear";
  return "bg-warn";
}
