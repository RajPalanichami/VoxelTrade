"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import type { Indicators } from "@/lib/types";
import { useTerminal } from "@/components/layout/AppShell";
import { usd } from "@/lib/format";
import type { ChainContract } from "@/lib/optionsMath";
import {
  ANALYZER_STRATEGIES,
  AnalyzerStrategyId,
  buildAnalyzerStrategy,
  pickFarExpiration,
} from "@/lib/optionAnalyzerStrategies";
import {
  analyzePayoff,
  DEFAULT_CONTRACT_MULTIPLIER,
  formatZone,
  marketDataFreshness,
  type PremiumSource,
} from "@/src/engines/optionAnalyzerPayoff";
import { buildOptionDecision, historicalVolatility, trendFromIndicators } from "@/src/engines/optionStrategyDecision";
import { AnalyzerPayoffChart } from "./AnalyzerPayoffChart";
import { StrategyDecisionPanel } from "./StrategyDecisionPanel";
import { AnalyzerRiskSummary } from "./AnalyzerRiskSummary";
import { AnalyzerScenarioTable } from "./AnalyzerScenarioTable";
import { MaximumLossWarning } from "./MaximumLossWarning";
import { TickerSessionStrip } from "@/components/market/TickerSessionStrip";
import { SessionBadge } from "@/components/market/SessionBadge";
import { useTickerMarketContext } from "@/hooks/useTickerMarketContext";

function pnlClass(n: number) {
  return n > 0 ? "text-bull" : n < 0 ? "text-bear" : "text-slate-400";
}

function signed(n: number) {
  if (n > 0) return `+${usd(n)}`;
  if (n < 0) return `−${usd(Math.abs(n))}`;
  return usd(0);
}

function moneyOrNA(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "N/A";
  return usd(n);
}

const PRICE_SOURCES: { id: PremiumSource | "default"; label: string }[] = [
  { id: "default", label: "Bid/Ask (default)" },
  { id: "bid", label: "Bid" },
  { id: "ask", label: "Ask" },
  { id: "mid", label: "Mid" },
  { id: "last", label: "Last" },
  { id: "custom", label: "Custom" },
];

export function OptionAnalyzer() {
  const { symbol } = useTerminal();
  const marketCtx = useTickerMarketContext(symbol).data?.data;
  const [strategyId, setStrategyId] = useState<AnalyzerStrategyId>("long_call");
  const [expiration, setExpiration] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<ChainContract | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [priceSource, setPriceSource] = useState<PremiumSource | "default">("default");
  const [customPremiums, setCustomPremiums] = useState<Record<string, number>>({});

  const strategy = ANALYZER_STRATEGIES.find((s) => s.id === strategyId) || ANALYZER_STRATEGIES[0];

  const ind5 = useQuery({
    queryKey: ["opt-ind", symbol, "5m"],
    queryFn: () => api.indicators(symbol, "5m"),
    staleTime: 60_000,
    enabled: Boolean(symbol),
  });
  const ind1h = useQuery({
    queryKey: ["opt-ind", symbol, "1h"],
    queryFn: () => api.indicators(symbol, "1h"),
    staleTime: 60_000,
    enabled: Boolean(symbol),
  });
  const ind1d = useQuery({
    queryKey: ["opt-ind", symbol, "1d"],
    queryFn: () => api.indicators(symbol, "1d"),
    staleTime: 60_000,
    enabled: Boolean(symbol),
  });
  const levelsQ = useQuery({
    queryKey: ["opt-levels", symbol, "1d"],
    queryFn: () => api.levels(symbol, "1d"),
    staleTime: 60_000,
    enabled: Boolean(symbol),
  });
  const barsQ = useQuery({
    queryKey: keys.bars(symbol, "1d"),
    queryFn: () => api.bars(symbol, "1d"),
    staleTime: 300_000,
    enabled: Boolean(symbol),
  });
  const fundQ = useQuery({
    queryKey: ["opt-fund", symbol],
    queryFn: () => api.fundamentals(symbol),
    staleTime: 300_000,
    enabled: Boolean(symbol),
  });

  const chainQ = useQuery({
    queryKey: keys.optionChain(symbol, expiration),
    queryFn: () => api.optionChain(symbol, expiration || undefined),
    staleTime: 60_000,
  });
  const chain = chainQ.data?.data;
  const farExp = strategy.needsFar && chain ? pickFarExpiration(chain.expirations, chain.expiration) : null;
  const farQ = useQuery({
    queryKey: keys.optionChain(symbol, farExp || "none"),
    queryFn: () => api.optionChain(symbol, farExp || undefined),
    enabled: Boolean(farExp),
    staleTime: 60_000,
  });

  useEffect(() => {
    setSelected(null);
    setExpiration("");
    setHoverPrice(null);
    setCustomPremiums({});
  }, [symbol]);

  useEffect(() => {
    if (chain?.expiration && !expiration) setExpiration(chain.expiration);
  }, [chain?.expiration, expiration]);

  const spot = chain?.spot || 0;
  const built = useMemo(() => {
    if (!chain) return null;
    return buildAnalyzerStrategy(strategyId, chain, quantity, selected, farQ.data?.data, {
      priceSource: priceSource === "default" ? undefined : priceSource,
      customPremiums,
      contractMultiplier: DEFAULT_CONTRACT_MULTIPLIER,
    });
  }, [chain, strategyId, quantity, selected, farQ.data?.data, priceSource, customPremiums]);

  useEffect(() => {
    if (!selected && built?.contracts[0]) setSelected(built.contracts[0]);
  }, [built, selected]);

  const analysisError = useMemo(() => {
    if (!built?.legs.length || !spot || built.missing || !chain) return null;
    try {
      analyzePayoff({
        symbol,
        name: chain.name,
        spot,
        strategyId,
        strategyLabel: strategy.label,
        expiration: chain.expiration,
        farExpiration: farExp,
        contracts: quantity,
        legs: built.legs,
        stock: built.stock,
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid strategy configuration.";
    }
  }, [built, spot, chain, symbol, strategyId, strategy.label, farExp, quantity]);

  const analysis = useMemo(() => {
    if (!built?.legs.length || !spot || built.missing || !chain || analysisError) return null;
    return analyzePayoff({
      symbol,
      name: chain.name,
      spot,
      strategyId,
      strategyLabel: strategy.label,
      expiration: chain.expiration,
      farExpiration: farExp,
      contracts: quantity,
      legs: built.legs,
      stock: built.stock,
      asOf: chain.as_of,
      source: chain.source,
    });
  }, [built, spot, chain, symbol, strategyId, strategy.label, farExp, quantity, analysisError]);

  const decision = useMemo(() => {
    if (!analysis || !built?.legs.length) return null;
    const daily = ind1d.data?.data as Indicators | undefined;
    const earnings = (fundQ.data?.data as { earnings?: { days_to_earnings?: number | null } } | undefined)?.earnings;
    const support = levelsQ.data?.data?.support?.s1 ?? null;
    const resistance = levelsQ.data?.data?.resistance?.r1 ?? null;
    return buildOptionDecision({
      symbol,
      strategyId,
      strategyLabel: strategy.label,
      spot: analysis.spot,
      expiration: analysis.expiration,
      legs: analysis.legs.map((leg) => {
        const listed = built.contracts.find((c) => c.right === leg.right && c.strike === leg.strike);
        return {
          right: leg.right,
          side: leg.side,
          strike: leg.strike,
          premium: leg.premium,
          quantity: leg.quantity,
          expiration: leg.expiration || analysis.expiration,
          iv: leg.iv,
          bid: leg.bid,
          ask: leg.ask,
          volume: listed?.volume,
          openInterest: listed?.open_interest,
        };
      }),
      stockShares: analysis.stock?.shares,
      maxProfit: analysis.max_profit,
      maxLoss: analysis.max_loss,
      breakevens: analysis.breakevens,
      riskReward: analysis.risk_reward,
      profitZones: analysis.profit_zones,
      context: {
        hv: historicalVolatility((barsQ.data?.data || []).map((bar) => bar.close), 20),
        shortTrend: trendFromIndicators(ind5.data?.data),
        mediumTrend: trendFromIndicators(ind1h.data?.data),
        longTrend: trendFromIndicators(daily),
        vwap: daily?.vwap ?? null,
        rsi: daily?.rsi ?? null,
        macdBullish: daily?.macd != null && daily?.macd_signal != null ? daily.macd > daily.macd_signal : null,
        support,
        resistance,
        ema20: daily?.ema20 ?? null,
        ema50: daily?.ema50 ?? null,
        ema200: daily?.ema200 ?? null,
        earningsDays: earnings?.days_to_earnings ?? null,
      },
    });
  }, [analysis, built, symbol, strategyId, strategy.label, ind5.data, ind1h.data, ind1d.data, levelsQ.data, barsQ.data, fundQ.data]);

  const feed = marketDataFreshness(chain?.source, chain?.as_of);
  const scenarioPrice = hoverPrice ?? analysis?.spot ?? spot;
  const livePnl = analysis
    ? analysis.curve.reduce((best, p) => (Math.abs(p.price - scenarioPrice) < Math.abs(best.price - scenarioPrice) ? p : best), analysis.curve[0]).pnl
    : 0;

  const tableRows = useMemo(() => {
    const primary = strategyId.includes("put") && !strategyId.includes("call") ? chain?.puts || [] : chain?.calls || [];
    if (!primary.length || !spot) return primary.slice(0, 14);
    const atm = primary.reduce((b, r) => (Math.abs(r.strike - spot) < Math.abs(b.strike - spot) ? r : b), primary[0]);
    const i = primary.indexOf(atm);
    return primary.slice(Math.max(0, i - 6), i + 10);
  }, [chain, strategyId, spot]);

  const defaultEntryNote =
    priceSource === "default" ? "Buys use live ask, sells use live bid." : `Entry source: ${priceSource}.`;

  return (
    <div className="w-full p-3 sm:p-4 space-y-4 pb-10" data-testid="option-analyzer">
      <div className="panel p-4">
        <h1 className="text-2xl font-semibold tracking-tight">Option Analyzer</h1>
        <p className="text-sm text-slate-400 mt-1">
          Expiration payoff for the selected ticker, contracts, and live bid/ask. Maximum loss is calculated from the full
          strategy payoff — not assumed to equal the premium.
        </p>
      </div>

      <div>
        <div className="text-[10px] tracking-widest text-slate-500 mb-1.5">STRATEGIES</div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {ANALYZER_STRATEGIES.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.group}
              onClick={() => {
                setStrategyId(s.id);
                setSelected(null);
                setHoverPrice(null);
              }}
              className={`px-2.5 py-1 rounded-md text-xs border whitespace-nowrap shrink-0 ${
                strategyId === s.id ? "border-accent/50 text-white bg-accent/15" : "border-line text-slate-400 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <TickerSessionStrip symbol={symbol} compactMode />
      <div className="panel p-3 flex flex-wrap gap-3 items-end">
        <div>
          <div className="text-[10px] text-slate-500">TICKER</div>
          <div className="text-lg font-semibold" data-testid="analyzer-ticker">
            {symbol}
          </div>
          <div className="text-xs text-slate-500">{chain?.name}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">UNDERLYING · {marketCtx ? `SOURCE ${marketCtx.session.replaceAll("_", " ")}` : "CHAIN"}</div>
          <div className="tick text-lg flex items-center gap-2">
            {usd(marketCtx?.quote.price ?? (spot || null))}
            <SessionBadge session={marketCtx?.session} />
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Call / Put
          <div className="flex gap-1 mt-1" data-testid="analyzer-right">
            {(["call", "put"] as const).map((right) => {
              const active =
                right === "put"
                  ? strategyId === "long_put" || strategyId === "short_put" || selected?.right === "put"
                  : strategyId === "long_call" || strategyId === "short_call" || selected?.right === "call";
              return (
              <button
                key={right}
                type="button"
                className={`px-2 py-1.5 rounded border text-sm ${active ? "border-accent/50 text-white bg-accent/15" : "border-line text-slate-300 hover:text-white"}`}
                onClick={() => {
                  const swap: Partial<Record<AnalyzerStrategyId, AnalyzerStrategyId>> = {
                    long_call: "long_put",
                    long_put: "long_call",
                    short_call: "short_put",
                    short_put: "short_call",
                  };
                  const wantsPut = right === "put";
                  const singleCall = strategyId === "long_call" || strategyId === "short_call";
                  const singlePut = strategyId === "long_put" || strategyId === "short_put";
                  if ((wantsPut && singleCall) || (!wantsPut && singlePut)) {
                    const next = swap[strategyId];
                    if (next) setStrategyId(next);
                    setSelected(null);
                    return;
                  }
                  const pool = right === "call" ? chain?.calls : chain?.puts;
                  if (!pool?.length || !spot) return;
                  const nearest = pool.reduce((best, row) => (Math.abs(row.strike - spot) < Math.abs(best.strike - spot) ? row : best), pool[0]);
                  setSelected(nearest);
                }}
              >
                {right === "call" ? "Call" : "Put"}
              </button>
              );
            })}
          </div>
        </div>
        <label className="text-xs text-slate-500">
          Expiration
          <select
            className="block mt-1 bg-panel2 border border-line rounded px-2 py-1.5 text-sm text-white min-w-[140px]"
            value={expiration || chain?.expiration || ""}
            onChange={(e) => {
              setExpiration(e.target.value);
              setSelected(null);
            }}
          >
            {(chain?.expirations || []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Contracts
          <input
            type="number"
            min={1}
            max={50}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="block mt-1 bg-panel2 border border-line rounded px-2 py-1.5 text-sm text-white w-20"
          />
        </label>
        <label className="text-xs text-slate-500">
          Entry price
          <select
            className="block mt-1 bg-panel2 border border-line rounded px-2 py-1.5 text-sm text-white min-w-[140px]"
            value={priceSource}
            onChange={(e) => setPriceSource(e.target.value as PremiumSource | "default")}
          >
            {PRICE_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs text-slate-400 max-w-xl" data-testid="analyzer-market-data">
          <div>
            Market Data: <span className={feed.status === "Live" ? "text-bull" : "text-warn"}>{feed.status}</span>
          </div>
          <div>Last Updated: {feed.as_of_et}</div>
          <div>
            Contract Multiplier: {DEFAULT_CONTRACT_MULTIPLIER} · Contracts: {quantity}
          </div>
          <div>{defaultEntryNote}</div>
        </div>
      </div>

      {feed.stale && (
        <div className="panel p-3 text-sm text-warn" data-testid="analyzer-stale">
          ⚠️ Market data may be delayed/stale.
        </div>
      )}

      {chainQ.isLoading && <div className="panel p-8 text-center text-slate-400">Loading live option chain…</div>}
      {marketCtx?.session === "CLOSED" && (
        <div className="panel p-3 text-sm text-slate-300" data-testid="analyzer-market-closed">
          Market closed — displaying latest available data.
        </div>
      )}
      {chainQ.error && (
        <div className="panel p-4 text-bear text-sm">
          Unable to retrieve option data. Please try again. {(chainQ.error as Error).message} Option prices are never invented.
        </div>
      )}
      {built?.missing && <div className="panel p-3 text-sm text-warn">{built.missing}</div>}
      {analysisError && <div className="panel p-3 text-sm text-bear">{analysisError}</div>}

      {analysis && (
        <>
          {decision && <StrategyDecisionPanel decision={decision} symbol={symbol} strategy={strategy.label} expiration={analysis.expiration} />}
          <MaximumLossWarning analysis={analysis} />
          <AnalyzerRiskSummary analysis={analysis} />

          <p className="panel p-4 text-sm text-slate-300 leading-relaxed" data-testid="analyzer-explanation">
            {analysis.risk_explanation}
          </p>
          <p className="text-sm text-slate-400 leading-relaxed px-1">{analysis.explanation}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            <Stat label="Premium paid" value={usd(analysis.premium_paid)} />
            <Stat label="Premium received" value={usd(analysis.premium_received)} />
            <Stat label="Net debit" value={analysis.net_debit > 0 ? usd(analysis.net_debit) : "N/A"} testId="analyzer-entry" />
            <Stat label="Net credit" value={analysis.net_credit > 0 ? usd(analysis.net_credit) : "N/A"} />
            <Stat label="Max profit" value={analysis.max_profit == null ? "Unlimited" : usd(analysis.max_profit)} />
            <Stat label="Max loss" value={analysis.max_loss == null ? "UNLIMITED" : usd(analysis.max_loss)} danger={analysis.max_loss == null || (analysis.risk_beyond_credit || 0) > 0} />
            <Stat
              label="Breakeven"
              value={analysis.breakevens.length ? analysis.breakevens.map((b) => usd(b)).join(" · ") : "N/A"}
              testId="analyzer-breakeven"
            />
            <Stat label="Risk / reward" value={analysis.risk_reward == null ? "N/A" : `${analysis.risk_reward.toFixed(2)}x`} />
            <Stat label="Profit zone" value={analysis.profit_zones.map(formatZone).join("; ") || "N/A"} />
            <Stat label="Loss zone" value={analysis.loss_zones.map(formatZone).join("; ") || "N/A"} />
            <Stat label="Effective cost basis" value={moneyOrNA(analysis.effective_cost_basis)} />
            <Stat label="Required capital" value={moneyOrNA(analysis.required_capital)} />
            <Stat label="Expiration P/L at spot" value={signed(analysis.expiration_pnl_at_spot)} />
            <Stat
              label="Current estimated P/L"
              value={analysis.current_estimated_pnl == null ? "N/A" : signed(analysis.current_estimated_pnl)}
            />
            <Stat label="Upside cap" value={moneyOrNA(analysis.upside_cap)} />
            <Stat label="Downside protection" value={moneyOrNA(analysis.downside_protection)} />
          </div>

          <div className="panel overflow-hidden" data-testid="analyzer-legs">
            <div className="px-4 py-2 text-[10px] tracking-widest text-slate-500">OPTION LEGS</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs">
                  <tr>
                    <th className="text-left px-4 py-2">Leg</th>
                    <th className="text-right px-4 py-2">Strike</th>
                    <th className="text-right px-4 py-2">Bid</th>
                    <th className="text-right px-4 py-2">Ask</th>
                    <th className="text-right px-4 py-2">Entry</th>
                    <th className="text-right px-4 py-2">Source</th>
                    <th className="text-right px-4 py-2">Cash</th>
                    <th className="text-right px-4 py-2">Moneyness</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.legs.map((leg) => {
                    const key = leg.contract || `${leg.right}-${leg.strike}-${leg.expiration}`;
                    return (
                      <tr key={`${leg.side}-${leg.right}-${leg.strike}-${leg.expiration}`} className="border-t border-line">
                        <td className="px-4 py-2">
                          {leg.side === "buy" ? "Buy" : "Sell"} {leg.quantity} {leg.right.toUpperCase()}
                          {leg.expiration ? <div className="text-[10px] text-slate-500">{leg.expiration}</div> : null}
                        </td>
                        <td className="px-4 py-2 text-right tick">{usd(leg.strike)}</td>
                        <td className="px-4 py-2 text-right tick">{leg.bid != null ? usd(leg.bid) : "—"}</td>
                        <td className="px-4 py-2 text-right tick">{leg.ask != null ? usd(leg.ask) : "—"}</td>
                        <td className="px-4 py-2 text-right tick">
                          {priceSource === "custom" ? (
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={customPremiums[key] ?? leg.premium}
                              onChange={(e) =>
                                setCustomPremiums((prev) => ({ ...prev, [key]: Math.max(0, Number(e.target.value) || 0) }))
                              }
                              className="w-20 bg-panel2 border border-line rounded px-1 py-0.5 text-right"
                            />
                          ) : (
                            usd(leg.premium)
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-slate-400">{leg.entry_source}</td>
                        <td className={`px-4 py-2 text-right tick ${pnlClass(leg.cash)}`}>{signed(leg.cash)}</td>
                        <td className="px-4 py-2 text-right">{leg.moneyness}</td>
                      </tr>
                    );
                  })}
                  {analysis.stock && (
                    <tr className="border-t border-line">
                      <td className="px-4 py-2">Long {analysis.stock.shares} shares</td>
                      <td className="px-4 py-2 text-right tick">{usd(analysis.stock.entry)}</td>
                      <td className="px-4 py-2 text-right">—</td>
                      <td className="px-4 py-2 text-right">—</td>
                      <td className="px-4 py-2 text-right tick">{usd(analysis.stock.entry)}</td>
                      <td className="px-4 py-2 text-right text-xs text-slate-400">Stock cost basis</td>
                      <td className="px-4 py-2 text-right tick">{signed(-analysis.stock.shares * analysis.stock.entry)}</td>
                      <td className="px-4 py-2 text-right">STOCK</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] gap-3">
            <div className="panel overflow-hidden">
              <div className="px-4 pt-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] tracking-widest text-slate-500">EXPIRATION PAYOFF</div>
                  <div className="text-sm text-slate-300">
                    {analysis.strategy_label} · {analysis.symbol} · {analysis.expiration}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    This is expiration P/L, not today&apos;s mark-to-market. Before expiration, option value also depends on
                    time, implied volatility, delta, gamma, theta, vega, the bid/ask, and the underlying price.
                  </div>
                </div>
                <div className={`tick text-lg font-semibold ${pnlClass(livePnl)}`}>
                  {livePnl >= 0 ? "You gain " : "You lose "}
                  {usd(Math.abs(livePnl))}
                </div>
              </div>
              <AnalyzerPayoffChart
                curve={analysis.curve}
                spot={analysis.spot}
                strikes={[...new Set(analysis.legs.map((l) => l.strike))]}
                breakevens={analysis.breakevens}
                hoverPrice={scenarioPrice}
                onHover={setHoverPrice}
                maxLossZones={analysis.max_loss_zones}
                maxProfitZones={analysis.max_profit_zones}
                lossContinues={analysis.chart_domain.lossContinues}
              />
              <div className="px-4 pb-3">
                <label className="block text-xs text-slate-500 mb-1">
                  If {symbol} is {usd(scenarioPrice)} at expiration
                </label>
                <input
                  type="range"
                  min={analysis.curve[0].price}
                  max={analysis.curve[analysis.curve.length - 1].price}
                  step={0.01}
                  value={scenarioPrice}
                  onChange={(e) => setHoverPrice(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="panel overflow-hidden">
                <div className="px-3 py-2 text-[10px] tracking-widest text-slate-500">LIVE STRIKES · click to set the focus strike</div>
                <table className="w-full text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-1">STRIKE</th>
                      <th className="text-right px-3 py-1">BID / ASK</th>
                      <th className="text-right px-3 py-1">ENTRY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r) => {
                      const active = selected?.strike === r.strike && selected?.right === r.right;
                      return (
                        <tr
                          key={r.contract || `${r.right}-${r.strike}`}
                          className={`border-t border-white/5 cursor-pointer ${active ? "bg-accent/15" : "hover:bg-white/5"}`}
                          onClick={() => setSelected(r)}
                        >
                          <td className="px-3 py-1.5">
                            <div className="font-semibold">{usd(r.strike)}</div>
                            <div className="text-[10px] text-slate-500">{r.in_the_money ? "ITM" : "OTM"}</div>
                          </td>
                          <td className="px-3 py-1.5 text-right tick">
                            {r.bid != null ? usd(r.bid) : "—"} / {r.ask != null ? usd(r.ask) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right tick">{usd(r.premium)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="panel overflow-hidden" data-testid="analyzer-scenarios">
                <div className="px-3 py-2 text-[10px] tracking-widest text-slate-500">SCENARIO ANALYSIS</div>
                {analysis.scenarios.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-1.5 border-t border-white/5 text-sm hover:bg-white/5"
                    onClick={() => setHoverPrice(s.price)}
                  >
                    <span className="text-slate-400">
                      {s.label} · {usd(s.price)}
                    </span>
                    <span className={`tick font-semibold ${pnlClass(s.pnl)}`}>{signed(s.pnl)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <AnalyzerScenarioTable analysis={analysis} legs={analysis.legs} />

          {analysis.validation.filter((v) => v.level === "warning").map((v) => (
            <div key={v.message} className="text-xs text-warn px-1">
              {v.message}
            </div>
          ))}

          <p className="text-xs text-slate-500 leading-relaxed px-1" data-testid="analyzer-disclaimer">
            Options involve substantial risk. The displayed Greeks, probabilities, scenarios and strategy scores are
            estimates based on available market data and assumptions and are not guarantees of future performance.
            These figures also include expiration payoff for the selected ticker, expiration, strikes, quantities, and
            listed bid/ask premiums. Actual results can differ because of bid/ask spreads, commissions and fees, early
            assignment, exercise, liquidity, and changes in option value before expiration.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, danger, testId }: { label: string; value: string; danger?: boolean; testId?: string }) {
  return (
    <div className="panel p-3 min-w-0">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`tick text-sm break-words ${danger ? "text-bear" : "text-white"}`} data-testid={testId}>
        {value}
      </div>
    </div>
  );
}
