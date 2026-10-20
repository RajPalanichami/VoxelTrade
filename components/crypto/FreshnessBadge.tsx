import type { CryptoFreshness, CryptoFreshnessState } from "@/lib/crypto";

const TONE: Record<CryptoFreshnessState, string> = {
  LIVE: "text-bull",
  RECENT: "text-warn",
  STALE: "text-bear",
  UNAVAILABLE: "text-slate-500",
};

const DOT: Record<CryptoFreshnessState, string> = {
  LIVE: "bg-bull",
  RECENT: "bg-warn",
  STALE: "bg-bear",
  UNAVAILABLE: "bg-slate-600",
};

export function FreshnessBadge({
  freshness,
  label,
}: {
  freshness?: CryptoFreshness | null;
  label?: string;
}) {
  const state = freshness?.state || "UNAVAILABLE";
  const age =
    freshness?.ageSeconds != null
      ? freshness.ageSeconds < 5
        ? "just now"
        : freshness.ageSeconds < 60
          ? `${freshness.ageSeconds}s ago`
          : `${Math.round(freshness.ageSeconds / 60)}m ago`
      : "";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] ${TONE[state]}`} title={freshness?.source}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} aria-hidden />
      <span className="sr-only">{label || "Data status"}:</span>
      <span>{state}</span>
      {age && state !== "UNAVAILABLE" ? <span className="text-slate-500">{age}</span> : null}
    </span>
  );
}
