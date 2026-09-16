import { PATTERN_TIMEFRAMES, SWING_TIMEFRAMES, TIMEFRAMES, TIMEFRAME_LABELS, getSettings } from "@/src/config/env";
import { isPatternTimeframe, isSwingTimeframe } from "@/src/config/timeframes";
import { buildSwingAnalysis } from "@/src/services/swing";
import { buildChartPatternAnalysis } from "@/src/services/chartPattern";
import { BY_SYMBOL } from "@/src/data/universe";
import { getSector } from "@/src/data/sectors";
import { runBacktest } from "@/src/engines/backtest";
import { envelope } from "@/src/lib/envelope";
import { HttpError, ProviderError } from "@/src/lib/errors";
import { isRegularHours } from "@/src/providers/base";
import { addWatch, createAlert, deleteAlert, listAlerts, listWatchlist, persistSnapshot, removeWatch } from "@/src/repositories/store";
import { analysis } from "@/src/services/analysis";
import { buildMag7, INDICATOR_TF as MAG7_TF, RANGES as MAG7_RANGES } from "@/src/services/mag7";
import { fetchChain, payoffFromPayload } from "@/src/services/options";
import { buildPulse } from "@/src/services/pulse";
import { buildMarketEvents } from "@/src/services/marketEvents";
import { buildSector, INDICATOR_TF as SECTOR_TF, RANGES as SECTOR_RANGES, listSectors } from "@/src/services/sectorIntel";
import { buildCompare } from "@/src/services/compare";
import { buildBasketCompare, buildMag7Compare, parseBasketTickers } from "@/src/services/mag7Compare";

const TF_ALIASES: Record<string, string> = {
  "5min": "5m",
  "5minutes": "5m",
  "15min": "15m",
  "15minutes": "15m",
  "30min": "30m",
  "30minutes": "30m",
  "1hour": "1h",
  "60m": "1h",
  "4hour": "4h",
  "4hours": "4h",
  daily: "1d",
  "1day": "1d",
  d: "1d",
  weekly: "1w",
  "1week": "1w",
  "1wk": "1w",
  w: "1w",
  monthly: "1M",
  "1month": "1M",
  "1mo": "1M",
  "1m": "1M",
};

export function normalizeTimeframe(value: string) {
  let v = value.toLowerCase().replace(/\s+/g, "");
  v = TF_ALIASES[v] || v;
  if (!TIMEFRAMES.includes(v as (typeof TIMEFRAMES)[number])) {
    throw new HttpError(400, `Unsupported timeframe '${value}'. Use: ${TIMEFRAMES.join(", ")}`);
  }
  return v;
}

export function normalizeSwingTimeframe(value: string) {
  let v = value.toLowerCase().replace(/\s+/g, "");
  v = TF_ALIASES[v] || v;
  if (!isSwingTimeframe(v)) {
    throw new HttpError(400, `Unsupported swing timeframe '${value}'. Use: ${SWING_TIMEFRAMES.join(", ")}`);
  }
  return v;
}

export function normalizePatternTimeframe(value: string) {
  const raw = value.trim();
  if (raw === "1M") return "1M";
  let v = raw.toLowerCase().replace(/\s+/g, "");
  v = TF_ALIASES[v] || v;
  if (v === "1m") v = "1M";
  if (!isPatternTimeframe(v)) {
    throw new HttpError(400, `Unsupported pattern timeframe '${value}'. Use: ${PATTERN_TIMEFRAMES.join(", ")}`);
  }
  return v;
}

function tf(value: string) {
  return normalizeTimeframe(value);
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function errorResponse(err: unknown) {
  if (err instanceof HttpError) return json({ detail: err.message }, err.status);
  if (err instanceof ProviderError) return json({ detail: err.message }, 502);
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("Unknown sector") || message.includes("unavailable")) {
    return json({ detail: message }, message.startsWith("Unknown") ? 404 : 502);
  }
  console.error("[api]", message);
  return json({ detail: message }, 500);
}

export async function handleV1(method: string, path: string[], url: URL, body: unknown) {
  getSettings().validateRuntime();
  const segs = path.filter(Boolean);

  if ((method === "GET" || method === "POST") && segs[0] === "compare" && segs[1] === "mag7") {
    const bodyObj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const timeframe = String(bodyObj.timeframe || url.searchParams.get("timeframe") || "4h");
    const data = await buildMag7Compare(timeframe);
    return json(envelope(data, "compare-engine", "LIVE", 0));
  }

  if ((method === "GET" || method === "POST") && segs[0] === "compare" && segs[1] === "basket") {
    const bodyObj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const tickers = parseBasketTickers(bodyObj.tickers ?? url.searchParams.get("tickers") ?? "");
    const timeframe = String(bodyObj.timeframe || url.searchParams.get("timeframe") || "4h");
    const data = await buildBasketCompare(tickers, timeframe);
    return json(envelope(data, "compare-engine", "LIVE", 0));
  }

  if ((method === "POST" || method === "GET") && segs[0] === "compare") {
    const bodyObj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const ticker1 = String(bodyObj.ticker1 || url.searchParams.get("ticker1") || "");
    const ticker2 = String(bodyObj.ticker2 || url.searchParams.get("ticker2") || "");
    const timeframe = String(bodyObj.timeframe || url.searchParams.get("timeframe") || "1d");
    const period = String(bodyObj.period || url.searchParams.get("period") || "1Y");
    if (!ticker1.trim() || !ticker2.trim()) throw new HttpError(400, "ticker1 and ticker2 are required");
    const data = await buildCompare(String(ticker1), String(ticker2), timeframe, period);
    return json(envelope(data, "compare-engine", "LIVE", 0));
  }

  if (method === "GET" && segs[0] === "search") {
    const q = url.searchParams.get("q") || "";
    if (!q.trim()) throw new HttpError(400, "q is required");
    return json(envelope(analysis.search(q), "universe", "LIVE", 0));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "quote") {
    const q = await analysis.quote(segs[1]);
    return json(envelope(q, q.freshness.source, q.freshness.data_status, q.freshness.latency_ms));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "bars") {
    const timeframe = tf(url.searchParams.get("timeframe") || "1h");
    const [data, source, latency] = await analysis.bars(segs[1], timeframe);
    return json(envelope(data, source, "LIVE", latency));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "indicators") {
    const timeframe = tf(url.searchParams.get("timeframe") || "1h");
    const [ind, , source, latency] = await analysis.indicators(segs[1], timeframe);
    return json(envelope(ind, source, "LIVE", latency));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "levels") {
    const timeframe = tf(url.searchParams.get("timeframe") || "1h");
    const [lv, ind, , source, latency] = await analysis.levels(segs[1], timeframe);
    return json(
      envelope(
        {
          pivot: lv.pivot,
          support: { s1: lv.s1, s2: lv.s2, s3: lv.s3 },
          resistance: { r1: lv.r1, r2: lv.r2, r3: lv.r3 },
          swingHigh: lv.swing_high,
          swingLow: lv.swing_low,
          vwap: lv.vwap,
          zones: { support: lv.support_zones, resistance: lv.resistance_zones },
          methods: lv.methods_used,
          price: ind.last_close,
        },
        source,
        "LIVE",
        latency,
      ),
    );
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "signal") {
    const timeframe = tf(url.searchParams.get("timeframe") || "1h");
    const persist = url.searchParams.get("persist") !== "false";
    const bundle = await analysis.analyze(segs[1], timeframe, false);
    const sig = bundle.signal as Record<string, unknown>;
    if (persist) {
      persistSnapshot({
        symbol: segs[1].toUpperCase(),
        timeframe,
        score: Number(sig.score),
        signal: String(sig.signal),
        confidence: String(sig.confidence),
        evidence: { categories: sig.categories, filters: sig.hard_filters },
        data_timestamp: String(sig.data_timestamp),
        algorithm_version: String(sig.algorithm_version),
      });
    }
    const f = bundle.freshness as { source: string; data_status: "LIVE"; latency_ms: number };
    return json(envelope(sig, f.source, f.data_status, f.latency_ms));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "trading-plan") {
    const timeframe = tf(url.searchParams.get("timeframe") || "1h");
    const bundle = await analysis.analyze(segs[1], timeframe, false);
    const f = bundle.freshness as { source: string; data_status: "LIVE"; latency_ms: number };
    return json(envelope({ long: bundle.long_plan, short: bundle.short_plan }, f.source, f.data_status, f.latency_ms));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "multi-timeframe") {
    const bundle = await analysis.analyze(segs[1], "1h", true);
    const f = bundle.freshness as { source: string; data_status: "LIVE"; latency_ms: number };
    return json(envelope(bundle.multi_timeframe, f.source, f.data_status, f.latency_ms));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "swing") {
    const timeframe = normalizeSwingTimeframe(url.searchParams.get("timeframe") || "4h");
    const bundle = await buildSwingAnalysis(segs[1], timeframe);
    const f = bundle.freshness;
    return json(envelope(bundle, f.source, f.data_status, f.latency_ms));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "chart-pattern") {
    const timeframe = normalizePatternTimeframe(url.searchParams.get("timeframe") || "1d");
    const bundle = await buildChartPatternAnalysis(segs[1], timeframe);
    const f = bundle.freshness;
    return json(envelope(bundle, f.source, f.data_status, f.latency_ms));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "analysis") {
    const timeframe = tf(url.searchParams.get("timeframe") || "1h");
    const bundle = await analysis.analyze(segs[1], timeframe, true) as Record<string, unknown>;
    const sig = bundle.signal as Record<string, unknown>;
    persistSnapshot({
      symbol: segs[1].toUpperCase(),
      timeframe,
      score: Number(sig.score),
      signal: String(sig.signal),
      confidence: String(sig.confidence),
      evidence: { categories: sig.categories, filters: sig.hard_filters },
      data_timestamp: String(sig.data_timestamp),
      algorithm_version: String(sig.algorithm_version),
    });
    const f = bundle.freshness as { source: string; data_status: "LIVE"; latency_ms: number };
    console.info("[api] analysis complete", {
      symbol: segs[1].toUpperCase(),
      timeframe,
      score: Number(sig.score),
      signal: String(sig.signal),
      bars: Array.isArray(bundle.bars) ? (bundle.bars as unknown[]).length : 0,
      latency_ms: f.latency_ms,
      source: f.source,
    });
    bundle.timeframe_label = TIMEFRAME_LABELS[timeframe];
    bundle.meta = BY_SYMBOL[segs[1].toUpperCase()] || null;
    return json(envelope(bundle, f.source, f.data_status, f.latency_ms));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "fundamentals") {
    const fund = (await analysis.first("fetchFundamentals", segs[1])) as Record<string, unknown> | null;
    const earn = (await analysis.first("fetchEarnings", segs[1])) as Record<string, unknown> | null;
    if (!fund && !earn) throw new HttpError(404, "Fundamentals unavailable — values are not invented.");
    return json(envelope({ fundamentals: fund, earnings: earn }, String((fund || earn || {}).source || "composite"), "EOD", 0));
  }

  if (method === "GET" && segs[0] === "stocks" && segs[2] === "news") {
    const items = ((await analysis.first("fetchNews", segs[1])) as unknown[]) || [];
    return json(envelope(items, "composite", "DELAYED", 0));
  }

  if (method === "GET" && segs[0] === "market" && segs[1] === "pulse") {
    const range = (url.searchParams.get("range") || "1W").toUpperCase();
    const allowed = new Set(["1D", "1W", "1M", "3M", "1Y"]);
    if (!allowed.has(range)) throw new HttpError(400, `Unsupported range. Use: ${[...allowed].sort().join(", ")}`);
    const data = await buildPulse(range);
    const status = (data.cards as unknown[])?.length ? "LIVE" : "UNAVAILABLE";
    return json(envelope(data, "composite", status, Number(data.latency_ms || 0)));
  }

  if (method === "GET" && segs[0] === "market" && segs[1] === "events") {
    const data = await buildMarketEvents();
    return json(envelope(data, data.source || "composite", data.data_status, 0));
  }

  if (method === "GET" && segs[0] === "market" && segs[1] === "overview") {
    const data = await analysis.marketOverview();
    try {
      data.treasury = await analysis.fred.dgs10();
    } catch {
      data.treasury = null;
    }
    return json(envelope(data, "composite", "LIVE", 0));
  }

  if (method === "GET" && segs[0] === "market" && segs[1] === "status") {
    const open = isRegularHours();
    return json(envelope({ state: open ? "OPEN" : "CLOSED", session: open ? "REGULAR" : "CLOSED", timezone: "America/New_York" }, "clock", "LIVE", 0));
  }

  if (method === "GET" && segs[0] === "market" && segs[1] === "mag7") {
    const timeframe = (url.searchParams.get("timeframe") || "1d").toLowerCase();
    const rng = (url.searchParams.get("range") || "1M").toUpperCase();
    if (!MAG7_TF.has(timeframe) && !MAG7_RANGES.has(timeframe.toUpperCase())) {
      throw new HttpError(400, `Unsupported timeframe. Use: ${[...MAG7_TF].sort().join(", ")}`);
    }
    if (!MAG7_RANGES.has(rng)) throw new HttpError(400, `Unsupported range. Use: ${[...MAG7_RANGES].sort().join(", ")}`);
    const data = await buildMag7(timeframe, rng);
    const status = (data.stocks as unknown[])?.length ? "LIVE" : "UNAVAILABLE";
    return json(envelope(data, "composite", status, Number(data.latency_ms || 0)));
  }

  if (method === "GET" && segs[0] === "market" && segs[1] === "sectors" && !segs[2]) {
    return json(envelope(listSectors(), "universe", "LIVE", 0));
  }

  if (method === "GET" && segs[0] === "market" && segs[1] === "sector" && segs[2]) {
    if (!getSector(segs[2])) throw new HttpError(404, `Unknown sector '${segs[2]}'`);
    const timeframe = (url.searchParams.get("timeframe") || "1d").toLowerCase();
    const rng = (url.searchParams.get("range") || "1M").toUpperCase();
    if (!SECTOR_TF.has(timeframe) && !SECTOR_RANGES.has(timeframe.toUpperCase())) {
      throw new HttpError(400, `Unsupported timeframe. Use: ${[...SECTOR_TF].sort().join(", ")}`);
    }
    if (!SECTOR_RANGES.has(rng)) throw new HttpError(400, `Unsupported range. Use: ${[...SECTOR_RANGES].sort().join(", ")}`);
    const data = await buildSector(segs[2], timeframe, rng);
    const status = (data.stocks as unknown[])?.length ? "LIVE" : "UNAVAILABLE";
    return json(envelope(data, "composite", status, Number(data.latency_ms || 0)));
  }

  if (method === "GET" && segs[0] === "watchlist" && !segs[1]) {
    const items = listWatchlist();
    const rows = await Promise.all(
      items.map(async (it) => {
        try {
          const q = await analysis.quote(it.symbol);
          return { symbol: it.symbol, name: q.name, price: q.price, change_percent: q.change_percent, timeframes: {} };
        } catch (e) {
          return { symbol: it.symbol, error: String(e) };
        }
      }),
    );
    return json(envelope(rows, "composite", "LIVE", 0));
  }

  if (method === "POST" && segs[0] === "watchlist" && segs[1]) {
    addWatch(segs[1]);
    return json(envelope({ ok: true, symbol: segs[1].toUpperCase() }, "local", "LIVE", 0));
  }

  if (method === "DELETE" && segs[0] === "watchlist" && segs[1]) {
    removeWatch(segs[1]);
    return json(envelope({ ok: true }, "local", "LIVE", 0));
  }

  if (method === "GET" && segs[0] === "alerts" && !segs[1]) {
    const rows = listAlerts().map((r) => ({ id: r.id, symbol: r.symbol, type: r.alert_type, config: r.config, enabled: r.enabled }));
    return json(envelope(rows, "local", "LIVE", 0));
  }

  if (method === "POST" && segs[0] === "alerts" && !segs[1]) {
    const a = createAlert((body as Record<string, unknown>) || {});
    return json(envelope({ id: a.id }, "local", "LIVE", 0));
  }

  if (method === "DELETE" && segs[0] === "alerts" && segs[1]) {
    deleteAlert(segs[1]);
    return json(envelope({ ok: true }, "local", "LIVE", 0));
  }

  if (method === "GET" && segs[0] === "options" && segs[2] === "chain") {
    const data = await fetchChain(segs[1], url.searchParams.get("expiration"));
    return json(envelope(data, String(data.source || "yfinance"), "DELAYED", 0));
  }

  if (method === "POST" && segs[0] === "options" && segs[1] === "payoff") {
    try {
      const data = await payoffFromPayload((body as Record<string, unknown>) || {});
      return json(envelope(data, "payoff-engine", "LIVE", 0));
    } catch (e) {
      if (e instanceof Error && e.message.includes("must")) throw new HttpError(400, e.message);
      throw e;
    }
  }

  if (method === "POST" && segs[0] === "backtests") {
    const payload = (body as Record<string, unknown>) || {};
    const symbol = String(payload.symbol || "MSFT").toUpperCase();
    const timeframe = tf(String(payload.timeframe || "1h"));
    const start = String(payload.start || "2025-01-01");
    const end = String(payload.end || new Date().toISOString().slice(0, 10));
    try {
      const result = await runBacktest(symbol, timeframe, start, end);
      return json(envelope(result, String(result.source || "yfinance"), "EOD", 0));
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : String(e));
    }
  }

  if (method === "GET" && segs[0] === "health" && segs[1] === "providers") {
    return json(envelope(analysis.providerHealth(), "local", "LIVE", 0));
  }

  if (method === "GET" && segs[0] === "health" && !segs[1]) {
    return json({ ok: true, service: "pro-trader-api", version: getSettings().algorithmVersion });
  }

  throw new HttpError(404, `Not found: /api/v1/${segs.join("/")}`);
}

export async function dispatchV1(req: Request) {
  try {
    const url = new URL(req.url);
    const after = url.pathname.replace(/^\/api\/v1\/?/, "");
    const path = after ? after.split("/") : [];
    let body: unknown = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const text = await req.text();
      body = text ? JSON.parse(text) : undefined;
    }
    return await handleV1(req.method, path, url, body);
  } catch (err) {
    return errorResponse(err);
  }
}
