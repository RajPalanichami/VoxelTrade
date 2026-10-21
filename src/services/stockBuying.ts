import { CACHE_TTL } from "@/src/config/env";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { HttpError } from "@/src/lib/errors";
import { analysis } from "@/src/services/analysis";
import { buildMarketEvents } from "@/src/services/marketEvents";
import {
  assembleBuyingDecision,
  movingAveragesFromCloses,
  relativeStrengthNote,
  sectorForSymbol,
} from "@/src/engines/stockBuyingEngine";
import {
  BUYING_HORIZON_TIMEFRAME,
  isBuyingHorizon,
  type BuyingHorizon,
  type StockBuyingPayload,
} from "@/lib/stockBuying";
import type { AnalysisBundle, Timeframe } from "@/lib/types";

async function settled<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export function normalizeBuyingHorizon(value: string | null | undefined): BuyingHorizon {
  const raw = String(value || "SWING").trim().toUpperCase().replace(/\s+/g, "_");
  const aliases: Record<string, BuyingHorizon> = {
    LONG: "LONG_TERM",
    LONGTERM: "LONG_TERM",
    LONG_TERM: "LONG_TERM",
    SWING: "SWING",
    DAY: "DAY_TRADE",
    DAYTRADE: "DAY_TRADE",
    DAY_TRADE: "DAY_TRADE",
    SCALP: "SCALP",
  };
  const horizon = aliases[raw];
  if (!horizon || !isBuyingHorizon(horizon)) {
    throw new HttpError(400, `Unsupported horizon '${value}'. Use: LONG_TERM, SWING, DAY_TRADE, SCALP`);
  }
  return horizon;
}

export async function buildStockBuyingEngine(
  symbol: string,
  horizon: BuyingHorizon,
  timeframe?: Timeframe,
): Promise<StockBuyingPayload> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !/^[A-Z][A-Z0-9.\-]{0,11}$/.test(ticker)) {
    throw new HttpError(400, "Invalid ticker. Use a symbol such as NVDA or AAPL.");
  }
  const tf = timeframe || BUYING_HORIZON_TIMEFRAME[horizon];
  const key = `sbe:${ticker}:${horizon}:${tf}`;
  const hit = cacheGet<StockBuyingPayload>(key);
  if (hit) return hit;

  const bundle = (await analysis.analyze(ticker, tf, true)) as unknown as AnalysisBundle;
  const events = await settled(buildMarketEvents);
  const closes = (bundle.bars || []).map((b) => b.close);
  const overlays = movingAveragesFromCloses(closes);
  const sector = sectorForSymbol(ticker, bundle.quote?.sector);
  const sectorChange =
    sector && bundle.market?.sectors
      ? bundle.market.sectors[sector.name]?.change_percent ??
        Object.values(bundle.market.sectors).find((s) => s.etf === sector.etf)?.change_percent ??
        null
      : null;
  const spy = bundle.market?.spx_change_pct ?? null;
  const stock = bundle.quote?.change_percent ?? null;
  const payload: StockBuyingPayload = {
    horizon,
    timeframe: tf,
    decision: assembleBuyingDecision(bundle, horizon),
    bundle,
    events: (events?.events || []).slice(0, 8).map((e) => ({
      name: e.name,
      dateLabel: e.dateLabel,
      timeLabel: e.timeLabel,
      status: e.status,
      impact: e.impact,
    })),
    overlays,
    relative: {
      stock,
      spy,
      sector: sectorChange ?? null,
      sectorName: sector?.name ?? bundle.quote?.sector ?? null,
      sectorEtf: sector?.etf ?? null,
      note: relativeStrengthNote(stock, sectorChange ?? null, spy),
    },
    methodology:
      "Decision states are mapped from the existing Signal Analyzer label, trading-plan hard filters, and a completed-candle breakout check (last fully formed bar only). Horizon changes default timeframe and which sections are emphasized. No probability of rise is computed.",
  };
  cacheSet(key, payload, CACHE_TTL.stockBuying || 45);
  return payload;
}
