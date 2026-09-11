import { analysis } from "@/src/services/analysis";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { ProviderError } from "@/src/lib/errors";
import { toFloat } from "@/src/lib/http";
import { buildPayoff, createLeg } from "@/src/engines/optionsPayoff";
import { fetchYahooOptionChain } from "@/src/providers/yfinance";

function premium(bid: unknown, ask: unknown, last: unknown): number | null {
  const b = toFloat(bid);
  const a = toFloat(ask);
  const lastP = toFloat(last);
  if (b != null && a != null && b > 0 && a > 0) return Math.round(((b + a) / 2) * 10000) / 10000;
  if (lastP != null && lastP > 0) return Math.round(lastP * 10000) / 10000;
  if (a != null && a > 0) return Math.round(a * 10000) / 10000;
  if (b != null && b > 0) return Math.round(b * 10000) / 10000;
  return null;
}

function row(item: Record<string, unknown>, right: "call" | "put") {
  const strike = toFloat(item.strike);
  const prem = premium(item.bid, item.ask, item.lastPrice ?? item.last);
  if (strike == null || strike <= 0 || prem == null) return null;
  return {
    contract: String(item.contractSymbol || ""),
    right,
    strike,
    bid: toFloat(item.bid),
    ask: toFloat(item.ask),
    last: toFloat(item.lastPrice ?? item.last),
    premium: prem,
    volume: toFloat(item.volume) || 0,
    open_interest: toFloat(item.openInterest) || 0,
    iv: toFloat(item.impliedVolatility),
    in_the_money: Boolean(item.inTheMoney),
  };
}

export async function fetchChain(symbol: string, expiration?: string | null) {
  const upper = symbol.toUpperCase().trim();
  const cacheKey = `optchain:v1:${upper}:${expiration || "first"}`;
  const hit = cacheGet<Record<string, unknown>>(cacheKey);
  if (hit) return hit;
  const { expirations, exp, quote, options } = await fetchYahooOptionChain(upper, expiration);
  const calls: Record<string, unknown>[] = [];
  const puts: Record<string, unknown>[] = [];
  for (const c of (options.calls as Array<Record<string, unknown>>) || []) {
    const item = row(c, "call");
    if (item) calls.push(item);
  }
  for (const p of (options.puts as Array<Record<string, unknown>>) || []) {
    const item = row(p, "put");
    if (item) puts.push(item);
  }
  if (!calls.length && !puts.length) throw new ProviderError("yfinance", `Option quotes missing for ${upper} ${exp}`);
  let spot: number | null = toFloat(quote?.regularMarketPrice);
  let name = upper;
  try {
    const q = await analysis.quote(upper);
    spot = q.price;
    name = q.name || upper;
  } catch {
    /* keep yahoo spot */
  }
  if (!spot || spot <= 0) throw new ProviderError("yfinance", `No live underlying price for ${upper}`);
  const payload = {
    symbol: upper,
    name,
    spot,
    expiration: exp,
    expirations: expirations.slice(0, 16),
    calls,
    puts,
    source: "yfinance",
    as_of: new Date().toISOString(),
  };
  cacheSet(cacheKey, payload, 90);
  return payload;
}

export async function payoffFromPayload(payload: Record<string, unknown>) {
  const rawLegs = (payload.legs as Array<Record<string, unknown>>) || [];
  const legs = rawLegs.map((x) =>
    createLeg({
      right: String(x.right),
      side: String(x.side),
      strike: Number(x.strike),
      premium: Number(x.premium),
      quantity: Number(x.quantity || 1),
    }),
  );
  let spot = Number(payload.spot || 0);
  if (spot <= 0 && payload.symbol) {
    const chain = await fetchChain(String(payload.symbol));
    spot = Number(chain.spot);
  }
  const shares = Number(payload.underlying_shares || 0);
  const entry = payload.underlying_entry != null ? Number(payload.underlying_entry) : undefined;
  const result = buildPayoff(legs, spot, shares, entry) as Record<string, unknown>;
  result.symbol = String(payload.symbol || "").toUpperCase();
  result.expiration = payload.expiration;
  return result;
}
