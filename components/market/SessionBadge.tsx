import { formatMarketSession, type MarketSession, type SessionAvailability } from "@/lib/extendedHours";

export function SessionBadge({ session }: { session?: MarketSession | null }) {
  if (!session) return null;
  const tone =
    session === "REGULAR"
      ? "border-bull/40 text-bull"
      : session === "CLOSED"
        ? "border-line text-slate-500"
        : "border-warn/40 text-warn";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold tracking-wide ${tone}`}>
      {formatMarketSession(session)}
    </span>
  );
}

export function AvailabilityText({ value }: { value?: SessionAvailability | null }) {
  if (!value) return null;
  return <span className="text-[10px] text-slate-500">{value.replaceAll("_", " ")}</span>;
}
