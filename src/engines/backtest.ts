import { getSettings } from "@/src/config/env";
import { computeAll, slope, structureFlags } from "@/src/engines/indicators";
import { applyHardFilters, classify, scoreAll } from "@/src/engines/scoring";
import { calculateLevels } from "@/src/engines/supportResistance";
import { buildPlans } from "@/src/engines/tradingPlan";
import { searchSorted } from "@/src/lib/series";
import { toFrame } from "@/src/providers/base";
import { analysis } from "@/src/services/analysis";
import { emptyIndicators, type Indicators } from "@/src/types/domain";

function indFromFrame(framed: ReturnType<typeof computeAll>): Indicators {
  const lastRow = framed.rows[framed.rows.length - 1];
  const prev = framed.rows.length > 1 ? framed.rows[framed.rows.length - 2] : lastRow;
  const f = (col: string, row = lastRow) => {
    const v = row[col];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return emptyIndicators({
    ema9: f("ema9"),
    ema20: f("ema20"),
    ema21: f("ema21"),
    ema50: f("ema50"),
    ema200: f("ema200"),
    ema9_slope: slope(framed.get("ema9")),
    ema20_slope: slope(framed.get("ema20")),
    rsi: f("rsi"),
    rsi_prev: f("rsi", prev),
    macd: f("macd"),
    macd_signal: f("macd_signal"),
    macd_hist: f("macd_hist"),
    macd_hist_prev: f("macd_hist", prev),
    vwap: f("vwap"),
    atr: f("atr"),
    volume_sma20: f("volume_sma20"),
    volume_ratio: f("volume_ratio"),
    last_volume: Number(lastRow.volume),
    last_close: Number(lastRow.close),
    last_high: Number(lastRow.high),
    last_low: Number(lastRow.low),
    ...structureFlags(framed.get("high"), framed.get("low")),
  });
}

export async function runBacktest(symbol: string, timeframe: string, start: string, end: string) {
  const settings = getSettings();
  const [bars, source] = await analysis.bars(symbol, timeframe);
  const startTs = new Date(`${start}T00:00:00Z`);
  const endTs = new Date(new Date(`${end}T00:00:00Z`).getTime() + 86400000);
  const window = toFrame(bars).filterByTime(startTs, endTs);
  if (window.rows.length < 60) {
    throw new Error("Not enough point-in-time history in the selected window. Widen the date range.");
  }
  const [full] = await analysis.bars(symbol, timeframe);
  const fullDf = toFrame(full).filterTo(endTs);
  const trades: Record<string, unknown>[] = [];
  let equity = 10_000;
  let peak = equity;
  let maxDd = 0;
  let inPos: Record<string, unknown> | null = null;
  const step = timeframe === "5m" || timeframe === "30m" ? 3 : 1;
  const startLoc = searchSorted(fullDf.timestamps(), startTs);
  for (let i = Math.max(startLoc, 50); i < fullDf.rows.length; i += step) {
    const hist = fullDf.slice(0, i + 1);
    const framed = computeAll(hist);
    const ind = indFromFrame(framed);
    const lv = calculateLevels(hist, ind, ind.last_close || 0);
    const [, score] = scoreAll(symbol, timeframe, ind, lv, null);
    let label = classify(score);
    const [longPlan] = buildPlans(ind, lv, timeframe);
    const px = Number(hist.rows[hist.rows.length - 1].close);
    const ts = hist.rows[hist.rows.length - 1].timestamp;
    if (inPos) {
      const stop = inPos.stop as number;
      const tp = inPos.tp1 as number;
      const hi = Number(hist.rows[hist.rows.length - 1].high);
      const lo = Number(hist.rows[hist.rows.length - 1].low);
      let exitPx: number | null = null;
      let reason: string | null = null;
      if (lo <= stop) {
        exitPx = stop;
        reason = "stop";
      } else if (hi >= tp) {
        exitPx = tp;
        reason = "tp1";
      } else if (label === "SELL") {
        exitPx = px;
        reason = "signal_flip";
      }
      if (exitPx != null) {
        const entry = inPos.entry as number;
        const pnlR = entry !== stop ? (exitPx - entry) / (entry - stop) : 0;
        const riskFrac = 0.01 * 10_000;
        const pnl = ((exitPx - entry) / (entry - stop)) * riskFrac;
        equity += pnl;
        peak = Math.max(peak, equity);
        maxDd = Math.max(maxDd, peak ? (peak - equity) / peak : 0);
        trades.push({
          entry_time: String(inPos.ts),
          exit_time: String(ts),
          entry: Math.round(entry * 100) / 100,
          exit: Math.round(exitPx * 100) / 100,
          stop: Math.round(stop * 100) / 100,
          tp1: Math.round(tp * 100) / 100,
          r: Math.round(pnlR * 100) / 100,
          pnl: Math.round(pnl * 100) / 100,
          reason,
          score_at_entry: inPos.score,
        });
        inPos = null;
      }
      continue;
    }
    const filtered = applyHardFilters(label, score, ind, lv, longPlan, null, null, false, false);
    label = filtered[0];
    if ((label === "BUY" || label === "STRONG_BUY") && longPlan.trade_allowed && longPlan.ideal_entry && longPlan.stop && longPlan.target1) {
      inPos = { ts, entry: px, stop: longPlan.stop, tp1: longPlan.target1, score, risk_usd: 100 };
    }
  }
  const wins = trades.filter((t) => (t.pnl as number) > 0);
  const losses = trades.filter((t) => (t.pnl as number) <= 0);
  const grossWin = wins.reduce((s, t) => s + (t.pnl as number), 0) || 0;
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl as number), 0)) || 1e-9;
  const rs = trades.map((t) => t.r as number);
  const winRate = trades.length ? wins.length / trades.length : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + (t.pnl as number), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.pnl as number), 0) / losses.length : 0;
  const expectancy = trades.length ? trades.reduce((s, t) => s + (t.pnl as number), 0) / trades.length : 0;
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  let sharpe = 0;
  if (rs.length) {
    const mu = rs.reduce((a, b) => a + b, 0) / rs.length;
    const variance = rs.reduce((s, x) => s + (x - mu) ** 2, 0) / rs.length;
    sharpe = variance > 0 ? mu / Math.sqrt(variance) : 0;
  }
  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    start,
    end,
    strategy_version: settings.algorithmVersion,
    source,
    point_in_time: true,
    trades_count: trades.length,
    winners: wins.length,
    losers: losses.length,
    win_rate: Math.round(winRate * 10000) / 10000,
    average_gain: Math.round(avgWin * 100) / 100,
    average_loss: Math.round(avgLoss * 100) / 100,
    max_drawdown: Math.round(maxDd * 10000) / 10000,
    profit_factor: Math.round((grossWin / grossLoss) * 1000) / 1000,
    sharpe_ratio: Math.round(sharpe * 1000) / 1000,
    average_r: Math.round(avgR * 1000) / 1000,
    expectancy: Math.round(expectancy * 100) / 100,
    ending_equity: Math.round(equity * 100) / 100,
    trades: trades.slice(-200),
  };
}
