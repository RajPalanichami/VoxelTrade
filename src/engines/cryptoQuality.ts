import { normalizeCryptoSymbol } from "./cryptoSymbols";

const MAX_FUTURE_MS = 60_000;

export function validPrice(value: unknown): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function validVolume(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function validTimestamp(value: unknown, now = Date.now()): Date | null {
  if (value == null || value === "") return null;
  let ms: number;
  if (value instanceof Date) ms = value.getTime();
  else if (typeof value === "number") ms = value < 1e12 ? value * 1000 : value;
  else ms = new Date(String(value)).getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms > now + MAX_FUTURE_MS) return null;
  return new Date(ms);
}

export function expectedSymbol(raw: string, expected: string): boolean {
  return normalizeCryptoSymbol(raw) === normalizeCryptoSymbol(expected);
}

export function quarantineQuote(input: {
  symbol: string;
  expected?: string;
  price: unknown;
  volume?: unknown;
  timestamp?: unknown;
  now?: number;
}): string | null {
  if (input.expected && !expectedSymbol(input.symbol, input.expected)) return "unexpected_symbol";
  if (validPrice(input.price) == null) return "invalid_price";
  if (input.volume != null && validVolume(input.volume) == null) return "invalid_volume";
  if (input.timestamp != null && validTimestamp(input.timestamp, input.now) == null) return "invalid_timestamp";
  return null;
}
