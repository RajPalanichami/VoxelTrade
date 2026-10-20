"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Bitcoin, Globe2, Hexagon, PieChart } from "lucide-react";
import { api, keys } from "@/lib/api";
import { compact, pct } from "@/lib/format";
import {
  CRYPTO_RANK_LIMITS,
  cryptoPrice,
  type CryptoAsset,
  type CryptoChartTimeframe,
  type CryptoMarketRange,
  type CryptoRankLimit,
} from "@/lib/crypto";
import { useCryptoLivePrices } from "@/hooks/useCryptoLivePrices";
import { CryptoAreaChart, CryptoCandleChart } from "./CryptoChart";
import { CryptoSearch } from "./CryptoSearch";
import { FreshnessBadge } from "./FreshnessBadge";

const SECTOR_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#22d3ee", "#fb7185", "#4ade80", "#f97316"];

function tone(n?: number | null) {
  if (n == null) return "text-slate-400";
  return n > 0 ? "text-bull" : n < 0 ? "text-bear" : "text-slate-400";
}

function mergeLive(asset: CryptoAsset | null, live?: { price: number; change24h: number | null }) {
  if (!asset) return null;
  if (!live) return asset;
  const price = live.price;
  const marketCap = asset.circulatingSupply && price > 0 ? price * asset.circulatingSupply : asset.marketCap;
  return { ...asset, price, change24h: live.change24h ?? asset.change24h, marketCap };
}

function CoinMark({ symbol, name, image, stacked = false }: { symbol: string; name?: string; image?: string | null; stacked?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {image ? (
        <img src={image} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-full shrink-0 bg-slate-800" />
      ) : (
        <span className="h-[18px] w-[18px] rounded-full bg-slate-700 grid place-items-center text-[9px] text-slate-200 shrink-0">
          {symbol.slice(0, 1)}
        </span>
      )}
      {stacked ? (
        <span className="min-w-0">
          <span className="block text-white leading-tight">{symbol}</span>
          {name ? <span className="block text-[10px] text-slate-500 truncate">{name}</span> : null}
        </span>
      ) : (
        <span className="text-white truncate">{name ? `${symbol}` : symbol}</span>
      )}
    </span>
  );
}

function Donut({
  value,
  label,
  sub,
  color = "#38bdf8",
}: {
  value: number | null;
  label: string;
  sub?: string;
  color?: string;
}) {
  const pctVal = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (pctVal / 100) * c;
  return (
    <div className="flex items-center gap-3">
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgb(30 41 59)" strokeWidth="10" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
        />
        <text x="44" y="48" textAnchor="middle" className="fill-white" fontSize="13" fontWeight="700">
          {value == null ? "—" : `${pctVal.toFixed(0)}%`}
        </text>
      </svg>
      <div>
        <div className="text-[13px] text-white font-semibold">{label}</div>
        {sub ? <div className="text-[11px] text-slate-500">{sub}</div> : null}
      </div>
    </div>
  );
}

function Bar({ label, value, max = 100, color = "#38bdf8" }: { label: string; value: number | null; max?: number; color?: string }) {
  const w = value == null || max <= 0 ? 0 : Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-200">{value == null ? "—" : `${value.toFixed(1)}%`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}

function LongShort({ ratio }: { ratio: number | null }) {
  if (ratio == null || !Number.isFinite(ratio) || ratio < 0) {
    return <div className="text-[11px] text-slate-500">Long/short ratio unavailable</div>;
  }
  const longPct = (ratio / (1 + ratio)) * 100;
  const shortPct = 100 - longPct;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-bull">{longPct.toFixed(1)}% Long</span>
        <span className="text-bear">{shortPct.toFixed(1)}% Short</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
        <div className="h-full bg-emerald-400" style={{ width: `${longPct}%` }} />
        <div className="h-full bg-rose-400" style={{ width: `${shortPct}%` }} />
      </div>
    </div>
  );
}

export function CryptoMarket() {
  const [rank, setRank] = useState<CryptoRankLimit>(10);
  const [tf, setTf] = useState<CryptoChartTimeframe>("1h");
  const [range, setRange] = useState<CryptoMarketRange>("1D");
  const [selected, setSelected] = useState("BTC");
  const [query, setQuery] = useState("");
  const [leaderKey, setLeaderKey] = useState("24h");

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.cryptoOverview,
    queryFn: ({ signal }) => api.cryptoOverview(signal),
    refetchInterval: 45_000,
    placeholderData: (prev) => prev,
  });
  const history = useQuery({
    queryKey: keys.cryptoHistory(selected, tf),
    queryFn: ({ signal }) => api.cryptoHistory(selected, tf, signal),
    placeholderData: (prev) => prev,
  });
  const marketChart = useQuery({
    queryKey: keys.cryptoMarketChart(range),
    queryFn: ({ signal }) => api.cryptoMarketChart(range, signal),
    placeholderData: (prev) => prev,
  });

  const overview = data?.data;
  const liveSymbols = useMemo(() => {
    const top = (overview?.assets || []).slice(0, 15).map((a) => a.symbol);
    return [...new Set(["BTC", "ETH", selected, ...top])];
  }, [overview, selected]);
  const live = useCryptoLivePrices(liveSymbols, Boolean(overview));

  const btc = mergeLive(overview?.btc || null, live.quotes.BTC);
  const eth = mergeLive(overview?.eth || null, live.quotes.ETH);
  const assets = (overview?.assets || []).map((a) => mergeLive(a, live.quotes[a.symbol])!);
  const visible = assets
    .filter((a) => !query || a.symbol.toLowerCase().includes(query.toLowerCase()) || a.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, rank);
  const overviewRows = assets.slice(0, 8);
  const usdtShare =
    overview?.stablecoins.totalMarketCap && overview.stablecoins.coins[0]?.marketCap
      ? (overview.stablecoins.coins[0].marketCap / overview.stablecoins.totalMarketCap) * 100
      : null;
  const btcShare = overview?.rotation.marketCap.find((r) => r.label === "BTC")?.share ?? overview?.global.btcDominance ?? null;
  const ethShare = overview?.rotation.marketCap.find((r) => r.label === "ETH")?.share ?? overview?.global.ethDominance ?? null;
  const altShare = overview?.rotation.marketCap.find((r) => r.label === "Altcoins")?.share ?? null;
  const othersStable =
    overview?.stablecoins.totalMarketCap != null
      ? overview.stablecoins.totalMarketCap - overview.stablecoins.coins.slice(0, 3).reduce((s, c) => s + (c.marketCap || 0), 0)
      : null;

  return (
    <div className="p-3 sm:p-4 space-y-3 pb-16" data-testid="crypto-market">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-orange-500/15 border border-orange-400/40 grid place-items-center text-orange-300">
            <Bitcoin size={18} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Crypto Market Intelligence</h1>
            <p className="text-sm text-slate-400 mt-0.5 max-w-3xl">
              Real-time insights, market trends, and opportunities across the entire cryptocurrency ecosystem.
            </p>
          </div>
        </div>
        <div className="text-[11px] text-slate-500 text-right">
          <div className="text-slate-300">Live Data</div>
          <div data-testid="crypto-clock">{overview?.clock.et || "—"}</div>
          <div>24/7 UTC · {live.connection}{isFetching ? " · refreshing" : ""}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <CryptoSearch
            value={selected}
            onSelect={(symbol) => {
              setSelected(symbol);
              setQuery("");
            }}
          />
        </div>
        <FreshnessBadge freshness={live.freshness.BTC || overview?.freshness.btc} label="BTC feed" />
      </div>

      {isLoading && <div className="panel p-10 text-center text-slate-400">Loading crypto market snapshot…</div>}
      {error && (
        <div className="panel p-6 text-bear text-sm">
          DATA UNAVAILABLE — {(error as Error).message}. Values are never invented.
        </div>
      )}

      {overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            <HeroKpi
              testid="crypto-kpi-btc"
              icon={<Bitcoin size={14} />}
              iconClass="text-orange-300 bg-orange-500/15"
              title="Bitcoin (BTC)"
              value={cryptoPrice(btc?.price)}
              change={btc?.change24h}
              lines={[`Market cap $${compact(btc?.marketCap)}`, `24h volume $${compact(btc?.volume24h)}`]}
            />
            <HeroKpi
              testid="crypto-kpi-total"
              icon={<Globe2 size={14} />}
              iconClass="text-sky-300 bg-sky-500/15"
              title="Total Crypto Market Cap"
              value={`$${compact(overview.global.totalMarketCap)}`}
              change={overview.global.marketCapChange24h}
              lines={[`24h volume $${compact(overview.global.totalVolume24h)}`, overview.globalChanges.d7 != null ? `7D ${pct(overview.globalChanges.d7)}` : "7D —"]}
            />
            <HeroKpi
              testid="crypto-kpi-btc-dom"
              icon={<PieChart size={14} />}
              iconClass="text-amber-300 bg-amber-500/15"
              title="Bitcoin Dominance"
              value={overview.global.btcDominance != null ? `${overview.global.btcDominance.toFixed(2)}%` : "—"}
              change={overview.global.btcDominanceChange24h}
              lines={[overview.global.btcDominanceChange24h != null ? `vs 24h ago ${pct(overview.global.btcDominanceChange24h)}` : "24h change from same-snapshot formula"]}
            />
            <HeroKpi
              testid="crypto-kpi-eth"
              icon={<Hexagon size={14} />}
              iconClass="text-indigo-300 bg-indigo-500/15"
              title="Ethereum (ETH)"
              value={cryptoPrice(eth?.price)}
              change={eth?.change24h}
              lines={[`Market cap $${compact(eth?.marketCap)}`]}
            />
            <HeroKpi
              testid="crypto-kpi-eth-dom"
              icon={<PieChart size={14} />}
              iconClass="text-violet-300 bg-violet-500/15"
              title="ETH Dominance"
              value={overview.global.ethDominance != null ? `${overview.global.ethDominance.toFixed(2)}%` : "—"}
              change={overview.global.ethDominanceChange24h}
              lines={[overview.global.ethDominanceChange24h != null ? `vs 24h ago ${pct(overview.global.ethDominanceChange24h)}` : "24h change from same-snapshot formula"]}
            />
            <HeroKpi
              testid="crypto-kpi-volume"
              icon={<BarChart3 size={14} />}
              iconClass="text-emerald-300 bg-emerald-500/15"
              title="Total Volume (24h)"
              value={`$${compact(overview.global.totalVolume24h)}`}
              change={overview.global.volumeChange24h}
              lines={[`${overview.global.activeAssets ?? "—"} assets`]}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.85fr_0.75fr] gap-3">
            <section className="panel p-3 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2 className="text-sm font-semibold">Bitcoin (BTC)</h2>
                <FreshnessBadge freshness={live.freshness.BTC || overview.freshness.btc} />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
                <div>
                  <div className="text-3xl font-semibold tracking-tight">{cryptoPrice(btc?.price)}</div>
                  <div className={`text-sm ${tone(btc?.change24h)}`}>{pct(btc?.change24h)} (24h)</div>
                </div>
                <div className="text-[11px] text-slate-500 grid grid-cols-2 gap-x-4 gap-y-1" data-testid="crypto-btc-stats">
                  <span>Market cap ${compact(btc?.marketCap)}</span>
                  <span>Circulating {compact(btc?.circulatingSupply)} BTC</span>
                  <span>All-time high {cryptoPrice(btc?.ath)}</span>
                  <span>From ATH {pct(btc?.athChange)}</span>
                </div>
              </div>
              <CryptoCandleChart bars={history.data?.data?.bars || []} timeframe={tf} onTimeframe={setTf} livePrice={btc?.price} />
              {overview.btcStructure && (
                <div className="mt-2 text-[11px] text-slate-400" data-testid="crypto-structure">
                  Structure: {overview.btcStructure.trend} · {overview.btcStructure.status.replaceAll("_", " ")} · RSI{" "}
                  {overview.btcStructure.rsi != null ? overview.btcStructure.rsi.toFixed(1) : "—"}
                </div>
              )}
            </section>

            <section className="panel p-3 min-w-0 overflow-hidden">
              <h2 className="text-sm font-semibold mb-2">Market Overview</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] min-w-[360px]">
                  <thead className="text-slate-500">
                    <tr>
                      {["", "Price", "24h", "Market cap"].map((h) => (
                        <th key={h} className="py-1 pr-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overviewRows.map((row) => (
                      <tr key={row.id} className="border-t border-white/5">
                        <td className="py-1.5 pr-2">
                          <button type="button" onClick={() => setSelected(row.symbol)}>
                            <CoinMark symbol={row.symbol} name={row.name} image={row.image} stacked />
                          </button>
                        </td>
                        <td className="py-1.5 pr-2">{cryptoPrice(row.price)}</td>
                        <td className={`py-1.5 pr-2 ${tone(row.change24h)}`}>{pct(row.change24h)}</td>
                        <td className="py-1.5">${compact(row.marketCap)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel p-3 min-w-0 space-y-3" data-testid="crypto-breadth">
              <h2 className="text-sm font-semibold">Crypto Market Breadth</h2>
              <Donut
                value={overview.breadth.top100.advancingPct}
                label={`${overview.breadth.top100.advancingPct?.toFixed(0) ?? "—"}% Positive`}
                sub={`Gainers ${overview.breadth.top100.advancing} · Losers ${overview.breadth.top100.declining}`}
                color="#4ade80"
              />
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div>
                  <div className="text-bull text-sm">{overview.breadth.top100.advancing}</div>
                  <div className="text-slate-500">Gainers</div>
                </div>
                <div>
                  <div className="text-bear text-sm">{overview.breadth.top100.declining}</div>
                  <div className="text-slate-500">Losers</div>
                </div>
                <div>
                  <div className="text-slate-200 text-sm">{overview.breadth.top100.unchanged}</div>
                  <div className="text-slate-500">Unchanged</div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[12px] text-slate-300 mb-1">
                  <span>Altcoin Strength</span>
                  <span>{overview.altseason.score != null ? `${overview.altseason.score.toFixed(0)} / 100` : "—"}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-400"
                    style={{ width: `${Math.max(0, Math.min(100, overview.altseason.score ?? 0))}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{overview.altseason.label}</div>
              </div>
              <div data-testid="crypto-rotation">
                <div className="text-[12px] text-slate-300 mb-2">Capital Rotation</div>
                <Bar label="BTC" value={btcShare} color="#f59e0b" />
                <Bar label="ETH" value={ethShare} color="#818cf8" />
                <Bar label="Altcoins" value={altShare} color="#38bdf8" />
                <p className="text-[10px] text-slate-500 mt-2">{overview.rotation.note}</p>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.1fr_0.8fr_0.75fr_0.85fr] gap-3">
            <section className="panel p-3 overflow-hidden" data-testid="crypto-top-table">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-sm font-semibold">Top Coins by Market Cap</h2>
                <div className="flex gap-1">
                  {CRYPTO_RANK_LIMITS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRank(n)}
                      className={`px-2 py-1 rounded-md border text-[11px] ${rank === n ? "border-accent bg-accent/15 text-white" : "border-line text-slate-400"}`}
                    >
                      Top {n}
                    </button>
                  ))}
                </div>
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter this table"
                aria-label="Filter top coins"
                className="mb-2 w-full bg-panel2 border border-line rounded-md px-3 py-1.5 text-sm"
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] min-w-[520px]">
                  <thead className="text-slate-500">
                    <tr>
                      {["#", "Coin", "Price", "24h", "Market cap"].map((h) => (
                        <th key={h} className="py-1 pr-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.id} className="border-t border-white/5">
                        <td className="py-1.5 pr-2 text-slate-500">{row.rank ?? "—"}</td>
                        <td className="py-1.5 pr-2">
                          <button type="button" onClick={() => setSelected(row.symbol)}>
                            <CoinMark symbol={row.symbol} name={row.name} image={row.image} stacked />
                          </button>
                        </td>
                        <td className="py-1.5 pr-2">{cryptoPrice(row.price)}</td>
                        <td className={`py-1.5 pr-2 ${tone(row.change24h)}`}>{pct(row.change24h)}</td>
                        <td className="py-1.5">${compact(row.marketCap)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel p-3 min-w-0" data-testid="crypto-sectors">
              <h2 className="text-sm font-semibold mb-2">Crypto Sectors</h2>
              {overview.sectors.length ? overview.sectors.slice(0, 9).map((s, i) => (
                <div key={s.id} className="flex justify-between text-[12px] py-1 border-b border-white/5 last:border-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="flex gap-3 shrink-0">
                    <span className={tone(s.change24h)}>{pct(s.change24h)}</span>
                    <span className="text-slate-400">${compact(s.marketCap)}</span>
                  </span>
                </div>
              )) : <div className="text-slate-500 text-sm">Sector list unavailable from the market-data provider right now.</div>}
            </section>

            <section className="panel p-3 min-w-0" data-testid="crypto-stables">
              <h2 className="text-sm font-semibold mb-2">Stablecoin Liquidity</h2>
              <div className="text-[12px] text-slate-400 mb-2">Total ${compact(overview.stablecoins.totalMarketCap)}</div>
              <Donut value={usdtShare} label={`${overview.stablecoins.coins[0]?.symbol || "USDT"} share`} sub={`7D ${pct(overview.stablecoins.change7d)}`} color="#22d3ee" />
              <FreshnessBadge freshness={overview.stablecoins.freshness} />
              <div className="mt-2 space-y-1">
                {overview.stablecoins.coins.slice(0, 3).map((c) => (
                  <div key={c.symbol} className="flex justify-between text-[12px]">
                    <span>{c.symbol}</span>
                    <span>${compact(c.marketCap)}</span>
                  </div>
                ))}
                {othersStable != null && othersStable > 0 ? (
                  <div className="flex justify-between text-[12px] text-slate-400">
                    <span>Others</span>
                    <span>${compact(othersStable)}</span>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="panel p-3 min-w-0" data-testid="crypto-derivatives">
              <h2 className="text-sm font-semibold mb-2">Derivatives & Liquidation</h2>
              {overview.derivatives.some((d) => d.openInterest != null || d.fundingRate != null) ? (
                <div className="space-y-3">
                  <div className="text-[11px] text-slate-500">Overview uses public Binance futures data. Historical liquidation totals are not published on that feed.</div>
                  {overview.derivatives.map((d) => (
                    <div key={d.symbol} className="py-1.5 border-b border-white/5 last:border-0 text-[12px] space-y-1">
                      <div className="font-semibold text-white">{d.symbol}</div>
                      <div>OI {compact(d.openInterest)} · Funding {d.fundingRate != null ? `${(d.fundingRate * 100).toFixed(4)}%` : "—"}</div>
                      <LongShort ratio={d.longShortRatio} />
                      {d.interpretation ? <div className="text-slate-500">{d.interpretation}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-500 text-sm">Public futures open interest and funding are temporarily unavailable from Binance in this region.</div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <section className="panel p-3 xl:col-span-1" data-testid="crypto-onchain">
              <h2 className="text-sm font-semibold mb-2">On-Chain Activity</h2>
              {overview.onchain.filter((m) => ["transactions", "active_addresses", "hash_rate"].includes(m.id)).map((m) => (
                <div key={m.id} className="flex justify-between text-[12px] py-1 border-b border-white/5 last:border-0">
                  <span>{m.label}</span>
                  <span className="text-right">
                    <span className="text-white">{m.available ? compact(m.value) : "—"}</span>
                    <span className={`block text-[10px] ${tone(m.change)}`}>{m.change == null ? "—" : pct(m.change)}</span>
                  </span>
                </div>
              ))}
            </section>
            <section className="panel p-3 xl:col-span-1">
              <h2 className="text-sm font-semibold mb-2">Exchange / ETF Flows</h2>
              <div className="text-[12px] text-slate-500">{overview.etf.note}</div>
              <div className="text-[12px] text-slate-500 mt-2">{overview.whales.note}</div>
            </section>
            <section className="panel p-3 xl:col-span-1">
              <h2 className="text-sm font-semibold mb-2">BTC Market Cap</h2>
              <CryptoAreaChart series={marketChart.data?.data?.series || []} range={range} onRange={setRange} label="Bitcoin market cap history" />
            </section>
            <section className="panel p-3 xl:col-span-1" data-testid="crypto-sentiment">
              <h2 className="text-sm font-semibold mb-2">Crypto Sentiment</h2>
              <div className="text-xl font-semibold">{overview.sentiment.value ?? "—"}</div>
              <div className="text-slate-400 text-sm">{overview.sentiment.label || "Unavailable"}</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${Math.max(0, Math.min(100, overview.sentiment.value ?? 0))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>Fear</span>
                <span>Greed</span>
              </div>
              <div className="text-[12px] mt-2" data-testid="crypto-altseason">{overview.altseason.label}</div>
              <FreshnessBadge freshness={overview.sentiment.freshness} />
            </section>
            <section className="panel p-3 xl:col-span-1" data-testid="crypto-leaders">
              <h2 className="text-sm font-semibold mb-2">Top Gainers</h2>
              <div className="flex gap-1 mb-2">
                {["24h", "7d", "30d"].map((k) => (
                  <button key={k} type="button" onClick={() => setLeaderKey(k)} className={`px-2 py-0.5 rounded border text-[10px] ${leaderKey === k ? "border-accent text-white" : "border-line text-slate-400"}`}>
                    {k}
                  </button>
                ))}
              </div>
              {(overview.leaders[leaderKey] || []).slice(0, 5).map((a) => (
                <div key={`l-${a.id}`} className="flex justify-between text-[12px] py-0.5">
                  <CoinMark symbol={a.symbol} image={a.image} />
                  <span className={tone(leaderKey === "7d" ? a.change7d : leaderKey === "30d" ? a.change30d : a.change24h)}>
                    {pct(leaderKey === "7d" ? a.change7d : leaderKey === "30d" ? a.change30d : a.change24h)}
                  </span>
                </div>
              ))}
            </section>
            <section className="panel p-3 xl:col-span-1" data-testid="crypto-news">
              <h2 className="text-sm font-semibold mb-2">Latest Crypto News</h2>
              {overview.news.length ? overview.news.slice(0, 4).map((n) => (
                <a key={n.id} href={n.url || undefined} target="_blank" rel="noreferrer" className="block py-1.5 border-b border-white/5 last:border-0">
                  <div className="text-[12px] text-white leading-snug">{n.headline}</div>
                  <div className="text-[10px] text-slate-500">{n.source} · {n.asset}</div>
                </a>
              )) : <div className="text-slate-500 text-sm">No headlines from the configured news providers.</div>}
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <section className="panel p-3" data-testid="crypto-gauge">
              <h2 className="text-sm font-semibold mb-1">Crypto Market Gauge</h2>
              <div className="text-xl font-semibold">{overview.gauge.label} · {overview.gauge.score}/100</div>
              <p className="text-[11px] text-slate-500 mt-1">{overview.gauge.explanation}</p>
            </section>
            <section className="panel p-3" data-testid="crypto-summary">
              <h2 className="text-sm font-semibold mb-2">Crypto Market Summary</h2>
              <ul className="space-y-1 text-[12px] text-slate-300">
                {overview.summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="text-[10px] text-slate-500 mt-2">{overview.attribution.join(" · ")}</div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function HeroKpi({
  title,
  value,
  change,
  lines,
  testid,
  icon,
  iconClass,
}: {
  title: string;
  value: string;
  change?: number | null;
  lines: string[];
  testid: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <div className="panel px-3 py-2.5 min-w-0" data-testid={testid}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-6 w-6 rounded-full grid place-items-center ${iconClass}`}>{icon}</span>
        <div className="text-[11px] text-slate-400 truncate">{title}</div>
      </div>
      <div className="text-[20px] font-semibold text-white leading-tight truncate">{value}</div>
      <div className={`text-[12px] ${tone(change)}`}>{pct(change)} <span className="text-slate-500">vs yesterday</span></div>
      {lines.map((line) => (
        <div key={line} className="text-[10px] text-slate-500 truncate">{line}</div>
      ))}
    </div>
  );
}
