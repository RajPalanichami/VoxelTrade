import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type WatchlistItem = { id: string; symbol: string; added_at: string };
export type AlertRow = {
  id: string;
  symbol: string;
  alert_type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  last_fired_at: string | null;
  created_at: string;
};
export type SignalSnap = {
  id: string;
  symbol: string;
  timeframe: string;
  score: number;
  signal: string;
  confidence: string;
  evidence: Record<string, unknown>;
  data_timestamp: string;
  algorithm_version: string;
  created_at: string;
};

export type OpportunityStore = {
  source: "default" | "custom";
  tickers: string[];
  settings: Record<string, unknown>;
  events: { symbol: string; at: string; from: string; to: string; note: string }[];
  alertsFired?: { key: string; at: string }[];
};

/**
 * Shared Market Events snapshot. On a long-running Node process this file is the
 * durable copy. On Vercel the same store is written under /tmp, which is local to
 * one instance and is cleared on cold start or deploy, so it cannot coordinate
 * refreshes across instances.
 */
export type MarketEventsStoreRecord = {
  schemaVersion: 1;
  payload: unknown;
  weekStart: string;
  lastSuccessfulRefreshAt: string | null;
  nextEligibleAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  backoffUntil: string | null;
  failureCount: number;
  lock: { owner: string; expiresAt: string } | null;
};

type StoreData = {
  watchlist: WatchlistItem[];
  alerts: AlertRow[];
  snapshots: SignalSnap[];
  opportunity?: OpportunityStore;
  marketEvents?: MarketEventsStoreRecord;
};

type StoreBackend = "file" | "memory";

const DEFAULTS = ["NVDA", "MSFT", "TSLA", "AMD", "MU", "AAPL", "AMZN", "GOOGL", "META", "AVGO"];
const READONLY_CODES = new Set(["EROFS", "EACCES", "EPERM"]);

let backend: StoreBackend = "file";
let memoryStore: StoreData | null = null;
let loggedBackend = false;

function clone(data: StoreData): StoreData {
  return JSON.parse(JSON.stringify(data)) as StoreData;
}

function empty(): StoreData {
  return { watchlist: [], alerts: [], snapshots: [] };
}

export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
  );
}

function configuredFilePath(): string {
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("file:")) {
    return path.resolve(process.cwd(), url.replace(/^file:/, ""));
  }
  return path.resolve(process.cwd(), "data", "protrader.json");
}

/**
 * Vercel/Lambda cwd is /var/task (read-only). A file: DATABASE_URL like
 * ./data/protrader.json resolves there and throws EROFS. /tmp is writable.
 */
export function storeFilePath(): string {
  if (isServerlessRuntime()) {
    return path.join("/tmp", "voxel-trading", "protrader.json");
  }
  return configuredFilePath();
}

export function storeBackend(): StoreBackend {
  return backend;
}

export function resetStoreForTests(): void {
  backend = "file";
  memoryStore = null;
  loggedBackend = false;
}

function logBackendOnce(file: string | null) {
  if (loggedBackend) return;
  loggedBackend = true;
  console.info("[store] persistence backend", {
    backend,
    path: file,
    serverless: isServerlessRuntime(),
  });
}

function readStore(): StoreData {
  if (backend === "memory") {
    return memoryStore ? clone(memoryStore) : empty();
  }
  const file = storeFilePath();
  try {
    if (!fs.existsSync(file)) return empty();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      watchlist: raw.watchlist || [],
      alerts: raw.alerts || [],
      snapshots: raw.snapshots || [],
      opportunity: raw.opportunity,
      marketEvents: raw.marketEvents,
    };
  } catch {
    return empty();
  }
}

function writeStore(data: StoreData): void {
  if (backend === "memory") {
    memoryStore = clone(data);
    logBackendOnce(null);
    return;
  }
  const file = storeFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    memoryStore = clone(data);
    logBackendOnce(file);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (READONLY_CODES.has(code)) {
      console.warn("[store] filesystem not writable; switching to in-memory store", {
        code,
        attemptedPath: file,
        serverless: isServerlessRuntime(),
      });
      backend = "memory";
      memoryStore = clone(data);
      logBackendOnce(null);
      return;
    }
    throw err;
  }
}

export function listWatchlist(): WatchlistItem[] {
  const data = readStore();
  if (!data.watchlist.length) {
    const now = new Date().toISOString();
    data.watchlist = DEFAULTS.map((symbol) => ({ id: randomUUID(), symbol, added_at: now }));
    writeStore(data);
  }
  return [...data.watchlist].sort((a, b) => b.added_at.localeCompare(a.added_at));
}

export function addWatch(symbol: string): WatchlistItem {
  const data = readStore();
  const upper = symbol.toUpperCase();
  const existing = data.watchlist.find((w) => w.symbol === upper);
  if (existing) return existing;
  const item = { id: randomUUID(), symbol: upper, added_at: new Date().toISOString() };
  data.watchlist.push(item);
  writeStore(data);
  return item;
}

export function removeWatch(symbol: string): void {
  const data = readStore();
  data.watchlist = data.watchlist.filter((w) => w.symbol !== symbol.toUpperCase());
  writeStore(data);
}

export function listAlerts(): AlertRow[] {
  return readStore().alerts;
}

export function createAlert(payload: Record<string, unknown>): AlertRow {
  const data = readStore();
  const row: AlertRow = {
    id: randomUUID(),
    symbol: String(payload.symbol || "").toUpperCase(),
    alert_type: String(payload.type || payload.alert_type || "BUY"),
    config: (payload.config as Record<string, unknown>) || payload,
    enabled: true,
    last_fired_at: null,
    created_at: new Date().toISOString(),
  };
  data.alerts.push(row);
  writeStore(data);
  return row;
}

export function deleteAlert(id: string): void {
  const data = readStore();
  data.alerts = data.alerts.filter((a) => a.id !== id);
  writeStore(data);
}

export function addSnapshot(snap: Omit<SignalSnap, "id" | "created_at">): SignalSnap {
  const data = readStore();
  const row: SignalSnap = { ...snap, id: randomUUID(), created_at: new Date().toISOString() };
  data.snapshots.push(row);
  if (data.snapshots.length > 500) data.snapshots = data.snapshots.slice(-500);
  writeStore(data);
  return row;
}

/** Snapshot history is optional. Never fail Signal Analyzer because persistence failed. */
export function persistSnapshot(snap: Omit<SignalSnap, "id" | "created_at">): SignalSnap | null {
  try {
    return addSnapshot(snap);
  } catch (err) {
    console.error("[store] snapshot persist failed", {
      symbol: snap.symbol,
      timeframe: snap.timeframe,
      score: snap.score,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function getOpportunityStore(): OpportunityStore | null {
  return readStore().opportunity || null;
}

export function saveOpportunityStore(next: OpportunityStore): OpportunityStore {
  const data = readStore();
  data.opportunity = {
    source: next.source,
    tickers: next.tickers.map((t) => t.toUpperCase()),
    settings: next.settings || {},
    events: (next.events || []).slice(-200),
    alertsFired: (next.alertsFired || []).slice(-300),
  };
  writeStore(data);
  return data.opportunity;
}

export function appendOpportunityEvents(events: OpportunityStore["events"]): void {
  if (!events.length) return;
  const data = readStore();
  const current = data.opportunity || { source: "default" as const, tickers: [], settings: {}, events: [], alertsFired: [] };
  current.events = [...(current.events || []), ...events].slice(-200);
  data.opportunity = current;
  writeStore(data);
}

export function readMarketEventsRecord(): MarketEventsStoreRecord | null {
  const record = readStore().marketEvents;
  if (!record || record.schemaVersion !== 1) return null;
  return record;
}

export function saveMarketEventsRecord(record: MarketEventsStoreRecord): void {
  const data = readStore();
  data.marketEvents = record;
  writeStore(data);
}

export function clearMarketEventsRecord(): void {
  const data = readStore();
  delete data.marketEvents;
  writeStore(data);
}

/**
 * Synchronous read-modify-write. One Node process cannot interleave this with
 * another call. Separate serverless instances do not share the file.
 */
export function claimMarketEventsLock(
  now: Date,
  owner: string,
  leaseMs: number,
  eligible: (record: MarketEventsStoreRecord | null) => boolean,
): { claimed: boolean; record: MarketEventsStoreRecord | null } {
  const current = readMarketEventsRecord();
  const lockUntil = current?.lock ? Date.parse(current.lock.expiresAt) : 0;
  if (current?.lock && Number.isFinite(lockUntil) && lockUntil > now.getTime()) {
    return { claimed: false, record: current };
  }
  if (!eligible(current)) return { claimed: false, record: current };
  const next: MarketEventsStoreRecord = {
    schemaVersion: 1,
    payload: current?.payload ?? null,
    weekStart: current?.weekStart || "",
    lastSuccessfulRefreshAt: current?.lastSuccessfulRefreshAt ?? null,
    nextEligibleAt: current?.nextEligibleAt ?? null,
    lastFailureAt: current?.lastFailureAt ?? null,
    lastError: current?.lastError ?? null,
    backoffUntil: current?.backoffUntil ?? null,
    failureCount: current?.failureCount ?? 0,
    lock: { owner, expiresAt: new Date(now.getTime() + leaseMs).toISOString() },
  };
  saveMarketEventsRecord(next);
  return { claimed: true, record: next };
}

export function filterFreshOpportunityAlerts<T extends { key: string; type: string; symbol: string; message: string }>(
  alerts: T[],
  cooldownMs = 6 * 60 * 60 * 1000,
): T[] {
  if (!alerts.length) return [];
  const data = readStore();
  const current = data.opportunity || { source: "default" as const, tickers: [], settings: {}, events: [], alertsFired: [] };
  const now = Date.now();
  const fired = new Map((current.alertsFired || []).map((a) => [a.key, a.at]));
  const fresh: T[] = [];
  const nextFired = [...(current.alertsFired || [])];
  for (const alert of alerts) {
    const last = fired.get(alert.key);
    if (last && now - new Date(last).getTime() < cooldownMs) continue;
    fresh.push(alert);
    nextFired.push({ key: alert.key, at: new Date().toISOString() });
  }
  current.alertsFired = nextFired.slice(-300);
  data.opportunity = current;
  try {
    writeStore(data);
  } catch {
    /* optional */
  }
  return fresh;
}
