const ALIASES: Record<string, string> = {
  XBT: "BTC",
  XBTUSD: "BTC",
  BTCUSD: "BTC",
  BTCUSDT: "BTC",
  "BTC-USD": "BTC",
  "BTC/USD": "BTC",
  "BTC/USDT": "BTC",
  ETHUSD: "ETH",
  ETHUSDT: "ETH",
  "ETH-USD": "ETH",
  "ETH/USD": "ETH",
};

export function normalizeCryptoSymbol(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return "";
  if (ALIASES[t]) return ALIASES[t];
  const stripped = t.replace(/[-_/]/g, "");
  if (ALIASES[stripped]) return ALIASES[stripped];
  if (stripped.endsWith("USDT") && stripped.length > 4) return stripped.slice(0, -4);
  if (stripped.endsWith("USD") && stripped.length > 3) return stripped.slice(0, -3);
  return t.replace(/[-_/]/g, "");
}

export function binanceSpotSymbol(symbol: string): string | null {
  const s = normalizeCryptoSymbol(symbol);
  if (!s || s === "USDT" || s === "USDC" || s === "DAI") return null;
  return `${s}USDT`;
}

export function yahooCryptoSymbol(symbol: string): string {
  const s = normalizeCryptoSymbol(symbol);
  return `${s}-USD`;
}

export function isLikelyStable(symbol: string) {
  return ["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "USDS", "PYUSD"].includes(normalizeCryptoSymbol(symbol));
}
