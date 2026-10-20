/** Overview tile lane only. Remaining symbols keep their incoming relative order. IWM is always last. */
export const TILE_LEAD = ["BTC", "VIX", "BRENT", "WTI", "SPY", "GAUGE", "US2Y", "US10Y", "CPI"] as const;
export const TILE_TRAIL = ["IWM"] as const;

export function orderMarketTiles<T extends { symbol: string }>(cards: T[]): T[] {
  const reserved = new Set<string>([...TILE_LEAD, ...TILE_TRAIL]);
  const bySymbol = new Map(cards.map((c) => [c.symbol, c]));
  const out: T[] = [];
  for (const symbol of TILE_LEAD) {
    const card = bySymbol.get(symbol);
    if (card) out.push(card);
  }
  for (const card of cards) {
    if (!reserved.has(card.symbol)) out.push(card);
  }
  for (const symbol of TILE_TRAIL) {
    const card = bySymbol.get(symbol);
    if (card) out.push(card);
  }
  return out;
}
