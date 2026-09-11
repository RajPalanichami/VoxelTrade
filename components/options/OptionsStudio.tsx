"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { usd } from "@/lib/format";
import { ChainContract, interpolatePnl } from "@/lib/optionsMath";
import { STRATEGIES, StrategyId, buildStrategy, pickFarExpiration } from "@/lib/optionStrategies";
import { projectDays, premiumSummary, snapshotFromRows, ScenarioKind } from "@/lib/optionsProjection";
import { PayoffChart } from "./PayoffChart";
import { ScenarioTable } from "./ScenarioTable";
import { StrategyGuide } from "./StrategyGuide";

function pnlClass(n: number) {
  return n > 0 ? "text-bull" : n < 0 ? "text-bear" : "text-slate-400";
}

function moneySigned(n: number) {
  if (n > 0) return `+${usd(n)}`;
  if (n < 0) return `−${usd(Math.abs(n))}`;
  return usd(0);
}

export function OptionsStudio() {
  const { symbol } = useTerminal();
  const [strategyId, setStrategyId] = useState<StrategyId>("long_call");
  const [expiration, setExpiration] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<ChainContract | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [kind, setKind] = useState<ScenarioKind>("flat");

  const strategy = STRATEGIES.find((s) => s.id === strategyId) || STRATEGIES[0];

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
  }, [symbol]);

  useEffect(() => {
    if (chain?.expiration && !expiration) setExpiration(chain.expiration);
  }, [chain?.expiration, expiration]);

  const spot = chain?.spot || 0;
  const built = useMemo(() => {
    if (!chain) return null;
    return buildStrategy(strategyId, chain, quantity, selected, farQ.data?.data);
  }, [chain, strategyId, quantity, selected, farQ.data?.data]);

  useEffect(() => {
    if (!selected && built?.contracts[0]) setSelected(built.contracts[0]);
  }, [built, selected]);

  const legs = built?.legs || [];
  const payoffKey = JSON.stringify({ symbol, expiration, strategyId, legs, sh: built?.underlyingShares });
  const payoffQ = useQuery({
    queryKey: keys.optionPayoff(payoffKey),
    queryFn: () =>
      api.optionPayoff({
        symbol,
        expiration,
        spot,
        legs,
        underlying_shares: built?.underlyingShares || 0,
        underlying_entry: built?.underlyingEntry,
      }),
    enabled: legs.length > 0 && spot > 0 && !built?.missing,
    staleTime: 15_000,
  });
  const payoff = payoffQ.data?.data;
  const scenarioPrice = hoverPrice ?? payoff?.spot ?? spot;
  const scenarioPnl = payoff ? interpolatePnl(payoff.curve, scenarioPrice) : 0;

  const rows = useMemo(() => {
    if (!built?.legs.length || !spot) return [];
    return projectDays({
      legs: built.legs,
      contracts: built.contracts,
      spot,
      expiration,
      kind,
      shares: built.underlyingShares,
      entry: built.underlyingEntry,
      farExpiration: farExp,
    });
  }, [built, spot, expiration, kind, farExp]);

  const prem = premiumSummary(legs);
  const startAbs = Math.abs(payoff?.cash_today ?? prem.totalPremium);
  const snap = snapshotFromRows(rows, startAbs || 1);

  const tableRows = useMemo(() => {
    const primary = strategyId.includes("put") ? chain?.puts || [] : chain?.calls || [];
    if (!primary.length || !spot) return primary.slice(0, 14);
    const atm = primary.reduce((b, r) => (Math.abs(r.strike - spot) < Math.abs(b.strike - spot) ? r : b), primary[0]);
    const i = primary.indexOf(atm);
    return primary.slice(Math.max(0, i - 6), i + 10);
  }, [chain, strategyId, spot]);

  return (
    <div className="w-full p-3 sm:p-4 space-y-4 pb-10" data-testid="options-studio">
      <div>
        <h1 className="text-xl font-semibold">Options Visualizer</h1>
        <p className="text-sm text-slate-400">
          Pick a strategy at the top. A plain-English guide appears immediately. Later-day numbers are estimates, not promises.
        </p>
      </div>
      <div>
        <div className="text-[10px] tracking-widest text-slate-500 mb-1.5">STRATEGIES</div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              title={s.group}
              onClick={() => {
                setStrategyId(s.id);
                setSelected(null);
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
      <StrategyGuide strategy={strategy} payoff={payoff} />
      <div className="panel p-3 flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-[10px] text-slate-500">UNDERLYING</div>
            <div className="text-lg font-semibold">{symbol}</div>
            <div className="text-xs text-slate-500">{chain?.name}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500">LIVE PRICE</div>
            <div className="tick text-lg">{spot ? usd(spot) : "—"}</div>
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
              max={20}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className="block mt-1 bg-panel2 border border-line rounded px-2 py-1.5 text-sm text-white w-20"
            />
          </label>
          <div className="text-[10px] text-slate-500 max-w-xl">
            Live quotes: {chain?.source || "—"}
            {chain?.as_of ? ` · ${new Date(chain.as_of).toLocaleTimeString()}` : ""}
            {farExp ? ` · later expiration ${farExp}` : ""}
          </div>
      </div>

      {chainQ.isLoading && <div className="panel p-8 text-center text-slate-400">Loading live option chain…</div>}
      {chainQ.error && (
        <div className="panel p-4 text-bear text-sm">
          DATA UNAVAILABLE — {(chainQ.error as Error).message}. Option prices are never invented.
        </div>
      )}
      {built?.missing && <div className="panel p-3 text-sm text-warn">{built.missing}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] gap-3">
        <div className="space-y-3 min-w-0">
            <div className="panel overflow-hidden">
              <div className="px-4 pt-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] tracking-widest text-slate-500">PAYOFF AT EXPIRATION</div>
                  <div className="text-sm text-slate-300">{payoff?.plain.title || "Select a strike"}</div>
                </div>
                {payoff && (
                  <div className={`tick text-lg font-semibold ${pnlClass(scenarioPnl)}`}>
                    {scenarioPnl >= 0 ? "You gain " : "You lose "}
                    {usd(Math.abs(scenarioPnl))}
                  </div>
                )}
              </div>
              {payoff && (
                <PayoffChart
                  curve={payoff.curve}
                  spot={payoff.spot}
                  strike={selected?.strike}
                  breakevens={payoff.breakevens}
                  hoverPrice={scenarioPrice}
                  onHover={setHoverPrice}
                />
              )}
              {payoff && (
                <div className="px-4 pb-3">
                  <label className="block text-xs text-slate-500 mb-1">
                    If {symbol} is {usd(scenarioPrice)} at expiration
                  </label>
                  <input
                    type="range"
                    min={payoff.curve[0].price}
                    max={payoff.curve[payoff.curve.length - 1].price}
                    step={0.01}
                    value={scenarioPrice}
                    onChange={(e) => setHoverPrice(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {payoff && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat
                  label="You pay / receive today"
                  value={payoff.cash_today < 0 ? `Pay ${usd(Math.abs(payoff.cash_today))}` : `Receive ${usd(payoff.cash_today)}`}
                />
                <Stat label="Max loss" value={payoff.max_loss == null ? "Unlimited" : usd(Math.abs(payoff.max_loss))} danger={payoff.max_loss == null} />
                <Stat label="Max gain" value={payoff.max_gain == null ? "Unlimited" : usd(payoff.max_gain)} />
                <Stat label="Breakeven" value={payoff.breakevens[0] != null ? usd(payoff.breakevens[0]) : "—"} />
              </div>
            )}

            {rows.length > 0 && (
              <ScenarioTable
                rows={rows}
                kind={kind}
                onKind={setKind}
                startingInvestment={snap.startingInvestment}
                currentValue={snap.currentValue}
                todayChange={snap.todayChange}
                totalPnl={snap.totalPnl}
                returnPct={snap.returnPct}
                premiumPerShare={prem.premiumPerShare}
                totalPremium={prem.totalPremium}
              />
            )}
          </div>

          <div className="space-y-3 min-w-0">
            <div className="panel">
              <div className="px-3 py-2 text-[10px] tracking-widest text-slate-500">
                LIVE STRIKES · click to set the main strike
              </div>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-1">STRIKE</th>
                    <th className="text-right px-3 py-1">PREMIUM</th>
                    <th className="text-right px-3 py-1">COST</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => {
                    const active = selected?.strike === r.strike && selected?.right === r.right;
                    const cost = r.premium * 100 * quantity;
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
                        <td className="px-3 py-1.5 text-right tick">{usd(r.premium)}</td>
                        <td className="px-3 py-1.5 text-right tick">{usd(cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {payoff && (
              <div className="panel overflow-hidden shrink-0">
                <div className="px-3 py-2 text-[10px] tracking-widest text-slate-500">WHAT IF AT EXPIRATION</div>
                {payoff.scenarios.map((s) => (
                  <button
                    key={s.label}
                    className="w-full flex items-center justify-between px-3 py-1.5 border-t border-white/5 text-sm hover:bg-white/5"
                    onClick={() => setHoverPrice(s.price)}
                  >
                    <span className="text-slate-400">
                      {s.label} · {usd(s.price)}
                    </span>
                    <span className={`tick font-semibold ${pnlClass(s.pnl)}`}>{moneySigned(s.pnl)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="panel p-3">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`tick text-base ${danger ? "text-bear" : "text-white"}`}>{value}</div>
    </div>
  );
}
