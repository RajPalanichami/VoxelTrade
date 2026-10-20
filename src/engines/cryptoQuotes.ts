import type { CryptoQuote } from "@/lib/crypto";
import { normalizeCryptoSymbol } from "./cryptoSymbols";
import { quarantineQuote, validPrice, validTimestamp, validVolume } from "./cryptoQuality";

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeBinanceTicker(raw: Record<string, unknown>, received = new Date()): CryptoQuote | null {
  const symbol = normalizeCryptoSymbol(String(raw.s || raw.symbol || ""));
  const price = validPrice(raw.c ?? raw.lastPrice ?? raw.price);
  const ts = validTimestamp(raw.E ?? raw.closeTime ?? received.toISOString(), received.getTime());
  const reason = quarantineQuote({
    symbol,
    price,
    volume: raw.v ?? raw.volume ?? raw.quoteVolume,
    timestamp: ts,
    now: received.getTime(),
  });
  if (reason || !price || !ts) return null;
  return {
    symbol,
    exchange: "Binance",
    price,
    bid: validPrice(raw.b ?? raw.bidPrice),
    ask: validPrice(raw.a ?? raw.askPrice),
    volume: validVolume(raw.q ?? raw.quoteVolume) ?? validVolume(raw.v ?? raw.volume),
    change24h: num(raw.P ?? raw.priceChangePercent),
    high24h: validPrice(raw.h ?? raw.highPrice),
    low24h: validPrice(raw.l ?? raw.lowPrice),
    timestamp: ts.toISOString(),
    receivedTimestamp: received.toISOString(),
    source: "Binance",
  };
}
