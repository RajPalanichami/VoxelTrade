/** Overview tile lane only. Remaining symbols keep their incoming relative order. */
export const TILE_LEAD = ["BTC", "VIX", "BRENT", "WTI", "SPY", "IWM", "US2Y", "US10Y", "CPI"] as const;

export function orderMarketTiles<T extends { symbol: string }>(cards: T[]): T[] {
  const lead = new Set<string>(TILE_LEAD);
  const bySymbol = new Map(cards.map((c) => [c.symbol, c]));
  const out: T[] = [];
  for (const symbol of TILE_LEAD) {
    const card = bySymbol.get(symbol);
    if (card) out.push(card);
  }
  for (const card of cards) {
    if (!lead.has(card.symbol)) out.push(card);
  }
  return out;
}
