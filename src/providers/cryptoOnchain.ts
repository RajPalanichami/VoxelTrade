import { cacheGet, cacheSet } from "@/src/lib/cache";
import { httpGetJson, toFloat } from "@/src/lib/http";
import type { CryptoOnchainMetric } from "@/lib/crypto";

type Chart = { values?: Array<{ x?: number; y?: number }> };

async function chart(name: string): Promise<{ value: number | null; change: number | null }> {
  const key = `bc2:${name}`;
  const hit = cacheGet<{ value: number | null; change: number | null }>(key);
  if (hit) return hit;
  try {
    const body = await httpGetJson<Chart>(`https://api.blockchain.info/charts/${name}`, {
      timespan: "30days",
      format: "json",
    });
    const values = body.values || [];
    const last = values[values.length - 1];
    const prev = values[values.length - 2];
    const value = toFloat(last?.y);
    const prior = toFloat(prev?.y);
    const change = value != null && prior != null && prior !== 0 ? ((value / prior) - 1) * 100 : null;
    const row = { value, change };
    cacheSet(key, row, 600);
    return row;
  } catch {
    const row = { value: null, change: null };
    cacheSet(key, row, 120);
    return row;
  }
}

export async function fetchBtcOnchain(): Promise<CryptoOnchainMetric[]> {
  const [tx, addresses, hashrate, difficulty] = await Promise.all([
    chart("n-transactions"),
    chart("n-unique-addresses"),
    chart("hash-rate"),
    chart("difficulty"),
  ]);
  return [
    { id: "transactions", label: "Transactions", value: tx.value, unit: "tx/day", change: tx.change, available: tx.value != null },
    { id: "active_addresses", label: "Unique addresses", value: addresses.value, unit: "addr/day", change: addresses.change, available: addresses.value != null },
    { id: "hash_rate", label: "Hash rate", value: hashrate.value, unit: "GH/s", change: hashrate.change, available: hashrate.value != null },
    { id: "difficulty", label: "Mining difficulty", value: difficulty.value, unit: "", change: difficulty.change, available: difficulty.value != null },
    {
      id: "exchange_netflow",
      label: "Exchange net flow",
      value: null,
      unit: "BTC",
      change: null,
      available: false,
      note: "Wallet-identified exchange flows require a specialized on-chain vendor. Not shown.",
    },
    {
      id: "whale",
      label: "Whale transfers",
      value: null,
      unit: "BTC",
      change: null,
      available: false,
      note: "Large-transfer identity feeds are not in the free public sources used here.",
    },
    {
      id: "mvrv",
      label: "MVRV",
      value: null,
      unit: "",
      change: null,
      available: false,
      note: "MVRV / SOPR / NUPL / LTH-STH are not published by the free Blockchain.com charts API.",
    },
  ];
}
