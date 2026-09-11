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

type StoreData = {
  watchlist: WatchlistItem[];
  alerts: AlertRow[];
  snapshots: SignalSnap[];
};

const DEFAULTS = ["NVDA", "MSFT", "TSLA", "AMD", "MU", "AAPL", "AMZN", "GOOGL", "META", "AVGO"];

function storePath(): string {
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("file:")) {
    return path.resolve(process.cwd(), url.replace(/^file:/, ""));
  }
  return path.resolve(process.cwd(), "data", "protrader.json");
}

function empty(): StoreData {
  return { watchlist: [], alerts: [], snapshots: [] };
}

function readStore(): StoreData {
  const file = storePath();
  try {
    if (!fs.existsSync(file)) return empty();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      watchlist: raw.watchlist || [],
      alerts: raw.alerts || [],
      snapshots: raw.snapshots || [],
    };
  } catch {
    return empty();
  }
}

function writeStore(data: StoreData): void {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
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
