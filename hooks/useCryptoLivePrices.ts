"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CryptoFreshness, CryptoQuote } from "@/lib/crypto";
import { api } from "@/lib/api";
import { freshnessFromTimestamps } from "@/src/engines/cryptoFreshness";
import { normalizeBinanceTicker } from "@/src/engines/cryptoQuotes";
import { binanceSpotSymbol, normalizeCryptoSymbol } from "@/src/engines/cryptoSymbols";

const WS_HOSTS = [
  "wss://stream.binance.com:9443/stream",
  "wss://data-stream.binance.vision/stream",
  "wss://stream.binance.com:443/stream",
];
const RECYCLE_MS = 20 * 60 * 60 * 1000;
const MAX_BACKOFF = 30_000;
const LIQUID = new Set(["BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "TRX", "DOT", "BCH", "LTC", "NEAR", "UNI", "ATOM", "XLM", "SUI", "APT", "TON", "HYPE", "ZEC", "XMR"]);

export function useCryptoLivePrices(symbols: string[], enabled = true) {
  const [quotes, setQuotes] = useState<Record<string, CryptoQuote>>({});
  const [connection, setConnection] = useState<"CONNECTING" | "LIVE" | "RECONNECTING" | "FALLBACK">("CONNECTING");
  const lastGood = useRef<Record<string, CryptoQuote>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const streams = useMemo(() => {
    const pairs = [...new Set(symbols.map((s) => normalizeCryptoSymbol(s)).filter((s) => LIQUID.has(s)).map((s) => binanceSpotSymbol(s)).filter((s): s is string => Boolean(s)))];
    return pairs.slice(0, 12).map((p) => `${p.toLowerCase()}@ticker`);
  }, [symbols]);

  useEffect(() => {
    if (!enabled || !streams.length || typeof WebSocket === "undefined") return;
    let closed = false;
    let hostIndex = 0;
    let attempt = 0;
    let recycleTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    let wsDisabled = false;

    const apply = (quote: CryptoQuote) => {
      lastGood.current[quote.symbol] = quote;
      setQuotes((prev) => ({ ...prev, [quote.symbol]: quote }));
    };

    const restFallback = async () => {
      try {
        const res = await api.cryptoQuotes(symbols.map(normalizeCryptoSymbol).filter((s) => LIQUID.has(s)).slice(0, 8));
        for (const q of res.data || []) apply(q);
        setConnection("FALLBACK");
      } catch {
        /* keep last known good */
      }
    };

    const connect = () => {
      if (closed || wsDisabled) return;
      setConnection(attempt === 0 && hostIndex === 0 ? "CONNECTING" : "RECONNECTING");
      const host = WS_HOSTS[hostIndex % WS_HOSTS.length];
      const ws = new WebSocket(`${host}?streams=${streams.join("/")}`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setConnection("LIVE");
      };
      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(String(ev.data)) as { data?: Record<string, unknown> } | Record<string, unknown>;
          const raw = (payload as { data?: Record<string, unknown> }).data || (payload as Record<string, unknown>);
          const quote = normalizeBinanceTicker(raw);
          if (quote) apply(quote);
        } catch {
          /* drop malformed */
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (closed) return;
        void restFallback();
        hostIndex += 1;
        if (hostIndex >= WS_HOSTS.length * 2) {
          wsDisabled = true;
          setConnection("FALLBACK");
          return;
        }
        const wait = Math.min(MAX_BACKOFF, 1000 * 2 ** Math.min(attempt, 5));
        attempt += 1;
        retryTimer = setTimeout(connect, wait);
      };
    };

    connect();
    recycleTimer = setTimeout(() => {
      wsRef.current?.close();
    }, RECYCLE_MS);
    fallbackTimer = setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) void restFallback();
    }, 12_000);

    return () => {
      closed = true;
      clearTimeout(recycleTimer);
      clearTimeout(retryTimer);
      clearInterval(fallbackTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, streams.join("|"), symbols.join(",")]);

  const freshness: Record<string, CryptoFreshness> = {};
  for (const [symbol, quote] of Object.entries(quotes)) {
    freshness[symbol] = freshnessFromTimestamps({
      source: quote.source,
      providerTimestamp: quote.timestamp,
      receivedTimestamp: quote.receivedTimestamp,
      available: true,
    });
  }

  return { quotes, connection, freshness, lastGood: lastGood.current };
}
