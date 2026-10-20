import { cacheGet, cacheSet } from "@/src/lib/cache";
import { httpGetJson, toFloat } from "@/src/lib/http";
import { freshnessFromTimestamps, unavailableFreshness } from "@/src/engines/cryptoFreshness";
import { getFearGreedClassification } from "@/lib/fearGreed";

export async function fetchCryptoFearGreed() {
  const key = "altme:fng";
  const hit = cacheGet<ReturnType<typeof normalize>>(key);
  if (hit) return hit;
  try {
    const body = await httpGetJson<{ data?: Array<{ value?: string; timestamp?: string; value_classification?: string }> }>(
      "https://api.alternative.me/fng/",
      { limit: 30 },
    );
    const rows = (body.data || [])
      .map((r) => {
        const value = toFloat(r.value);
        const ts = r.timestamp ? Number(r.timestamp) : NaN;
        if (value == null || !Number.isFinite(ts)) return null;
        return { time: ts, value };
      })
      .filter((r): r is { time: number; value: number } => r != null)
      .sort((a, b) => a.time - b.time);
    const latest = rows[rows.length - 1];
    const out = normalize(latest?.value ?? null, rows);
    cacheSet(key, out, 300);
    return out;
  } catch {
    return {
      value: null,
      label: null,
      history: [],
      source: "Alternative.me",
      freshness: unavailableFreshness("Alternative.me"),
    };
  }
}

function normalize(value: number | null, history: { time: number; value: number }[]) {
  const provider = history.length ? new Date(history[history.length - 1].time * 1000) : null;
  const ageHours = provider ? (Date.now() - provider.getTime()) / 3_600_000 : null;
  const freshness = freshnessFromTimestamps({
    source: "Alternative.me",
    providerTimestamp: provider,
    available: value != null,
  });
  if (value != null && ageHours != null && ageHours <= 36) freshness.state = ageHours <= 24 ? "LIVE" : "RECENT";
  return {
    value,
    label: value != null ? getFearGreedClassification(value) : null,
    history,
    source: "Alternative.me",
    freshness,
  };
}
