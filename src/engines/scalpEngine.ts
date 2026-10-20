import {
  DEFAULT_SCALP_CONFIG,
  boolVerdict,
  condition,
  insufficient,
  scalpTfMinutes,
  type ScalpAnalysis,
  type ScalpBreakout,
  type ScalpCondition,
  type ScalpConfig,
  type ScalpDirection,
  type ScalpLevel,
  type ScalpOverall,
  type ScalpRetest,
  type ScalpTimeframe,
  type ScalpTimeframeBlock,
  type ScalpTradeState,
} from "@/lib/scalp";
import { atr, ema, macd, rsi, structureFlags, swingPoints, last } from "@/src/engines/indicators";
import { classifyMarketSession } from "@/src/engines/marketSessions";
import { isoDateEastern } from "@/src/lib/easternTime";
import { formatEstDateTime } from "@/src/lib/easternTime";
import type { TickerMarketContext } from "@/lib/extendedHours";
import type { OHLCVBar, Quote } from "@/src/types/domain";

export type ScalpBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const TF_LIST: ScalpTimeframe[] = ["5m", "15m", "30m"];

function num(v: number | null | undefined) {
  return v != null && Number.isFinite(v) ? v : null;
}

export function toScalpBars(bars: OHLCVBar[]): ScalpBar[] {
  const unique = new Map<number, ScalpBar>();
  for (const b of bars) {
    const time = Math.floor(new Date(b.timestamp).getTime() / 1000);
    unique.set(time, { time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}

export function isFormingBar(bar: ScalpBar | undefined, tf: string, now = new Date()) {
  if (!bar) return false;
  const closeAt = (bar.time + scalpTfMinutes(tf) * 60) * 1000;
  return closeAt > now.getTime();
}

export function closedBars(bars: ScalpBar[], tf: string, now = new Date()) {
  if (!bars.length) return [];
  return isFormingBar(bars[bars.length - 1], tf, now) ? bars.slice(0, -1) : bars;
}

function series(bars: ScalpBar[], key: keyof ScalpBar) {
  return bars.map((b) => b[key] as number);
}

export function lastAtr(bars: ScalpBar[], period = 14) {
  return last(atr(series(bars, "high"), series(bars, "low"), series(bars, "close"), period));
}

export function easternParts(ts: number) {
  const bits = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(ts * 1000));
  const get = (type: string) => bits.find((p) => p.type === type)?.value || "";
  return {
    date: `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

export function sessionOf(now = new Date()): ScalpAnalysis["session"] {
  const session = classifyMarketSession(now);
  if (session === "PRE_MARKET") return "PREMARKET";
  return session;
}

function regularBars(bars: ScalpBar[]) {
  return bars.filter((b) => {
    const p = easternParts(b.time);
    const mins = p.hour * 60 + p.minute;
    return mins >= 9 * 60 + 30 && mins < 16 * 60;
  });
}

export function sessionVwap(bars: ScalpBar[], now = new Date()) {
  const day = isoDateEastern(now);
  const session = regularBars(bars).filter((b) => easternParts(b.time).date === day);
  let pv = 0;
  let vol = 0;
  const values: number[] = [];
  for (const b of session) {
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * b.volume;
    vol += b.volume;
    values.push(vol === 0 ? NaN : pv / vol);
  }
  const value = vol === 0 ? null : pv / vol;
  return { value, sessionBars: session, series: values };
}

export function timeAwareRvol(bars: ScalpBar[], now = new Date()) {
  if (!bars.length) return { rvol: null, current: null, expected: null };
  const lastBar = bars[bars.length - 1];
  const slot = easternParts(lastBar.time);
  const peers = bars.filter((b) => {
    const p = easternParts(b.time);
    return p.hour === slot.hour && p.minute === slot.minute && p.date !== slot.date;
  });
  const expected = peers.length ? peers.reduce((s, b) => s + b.volume, 0) / peers.length : null;
  const current = lastBar.volume;
  return { rvol: expected && expected > 0 ? current / expected : null, current, expected };
}

export function analyzeStructure(bars: ScalpBar[], config: ScalpConfig = DEFAULT_SCALP_CONFIG): ScalpCondition {
  if (bars.length < 20) return insufficient("structure", "Structure", "Fewer than 20 closed candles are available for swing detection.");
  const atrVal = lastAtr(bars) || 0;
  const [sh, sl] = swingPoints(series(bars, "high"), series(bars, "low"), config.structure.swingLeft, config.structure.swingRight);
  const highs: number[] = [];
  const lows: number[] = [];
  sh.forEach((v) => {
    if (v != null) highs.push(v);
  });
  sl.forEach((v) => {
    if (v != null) lows.push(v);
  });
  const h = highs.slice(-3);
  const l = lows.slice(-3);
  if (h.length < 2 || l.length < 2) {
    const flags = structureFlags(series(bars, "high"), series(bars, "low"));
    if (flags.higher_highs && flags.higher_lows) {
      return condition("structure", "Structure", "YES", "BULLISH", "Price is printing higher highs and higher lows on the recent closed window.");
    }
    if (flags.lower_highs && flags.lower_lows) {
      return condition("structure", "Structure", "YES", "BEARISH", "Price is printing lower highs and lower lows on the recent closed window.");
    }
    return condition("structure", "Structure", "NEUTRAL", "NEUTRAL", "Swing points are sparse; the recent window is not a confirmed HH+HL or LH+LL structure.");
  }
  const hh = h[h.length - 1] > h[h.length - 2];
  const hl = l[l.length - 1] > l[l.length - 2];
  const lh = h[h.length - 1] < h[h.length - 2];
  const ll = l[l.length - 1] < l[l.length - 2];
  if (hh && hl) return condition("structure", "Structure", "YES", "BULLISH", `Higher high ${h[h.length - 1].toFixed(2)} and higher low ${l[l.length - 1].toFixed(2)} versus prior swings.`);
  if (lh && ll) return condition("structure", "Structure", "YES", "BEARISH", `Lower high ${h[h.length - 1].toFixed(2)} and lower low ${l[l.length - 1].toFixed(2)} versus prior swings.`);
  if (Math.abs(h[h.length - 1] - h[h.length - 2]) < atrVal * 0.25 && Math.abs(l[l.length - 1] - l[l.length - 2]) < atrVal * 0.25) {
    return condition("structure", "Structure", "NO", "NEUTRAL", "Recent swings are overlapping — range / consolidation, not a confirmed trend structure.");
  }
  return condition("structure", "Structure", "NEUTRAL", "NEUTRAL", "Swing sequence is mixed (not clean HH+HL or LH+LL).");
}

export function analyzeTrend(bars: ScalpBar[]): ScalpCondition {
  if (bars.length < 21) return insufficient("trend", "Uptrend", "Need at least 21 closed candles for EMA baseline.");
  const close = series(bars, "close");
  const e20 = last(ema(close, 20));
  const px = close[close.length - 1];
  const structure = analyzeStructure(bars);
  if (e20 == null) return insufficient("trend", "Uptrend", "EMA 20 is not available yet.");
  const above = px > e20;
  if (structure.direction === "BULLISH" && above) {
    return condition("trend", "Uptrend", "YES", "BULLISH", `Price ${px.toFixed(2)} is forming higher highs / higher lows and remains above the EMA 20 baseline ${e20.toFixed(2)}.`);
  }
  if (structure.direction === "BEARISH" && !above) {
    return condition("trend", "Uptrend", "NO", "BEARISH", `Price ${px.toFixed(2)} is below EMA 20 ${e20.toFixed(2)} with lower highs / lower lows.`);
  }
  if (structure.verdict === "INSUFFICIENT_DATA") return insufficient("trend", "Uptrend", structure.why);
  return condition("trend", "Uptrend", "NEUTRAL", structure.direction, `Price ${px.toFixed(2)} vs EMA 20 ${e20.toFixed(2)}; structure is ${structure.direction.toLowerCase()} but not a clean confirmed uptrend.`);
}

export function analyzeVwapBlock(bars: ScalpBar[], now = new Date()): ScalpAnalysis["vwap"] {
  const { value, sessionBars } = sessionVwap(bars, now);
  const px = sessionBars.length ? sessionBars[sessionBars.length - 1].close : bars.length ? bars[bars.length - 1].close : null;
  if (value == null || px == null) {
    const miss = insufficient("vwap", "VWAP", "Regular-session VWAP cannot be calculated from the available candles.");
    return { price: px, value: null, distance: null, distancePct: null, above: miss, reclaim: miss, hold: miss, direction: "NEUTRAL" };
  }
  const above = px >= value;
  const dist = px - value;
  const distPct = (dist / value) * 100;
  let reclaim = false;
  if (sessionBars.length >= 3) {
    const prior = sessionBars[sessionBars.length - 3];
    const mid = sessionBars[sessionBars.length - 2];
    reclaim = prior.close < value && mid.close >= value && px >= value;
  }
  const hold = above && sessionBars.slice(-3).every((b) => b.low <= value * 1.002 && b.close >= value);
  return {
    price: px,
    value,
    distance: dist,
    distancePct: distPct,
    above: condition("vwap-above", "Price above VWAP", boolVerdict(above), above ? "BULLISH" : "BEARISH", `Price ${px.toFixed(2)} is ${above ? "above" : "below"} session VWAP ${value.toFixed(2)} (${distPct.toFixed(2)}%).`),
    reclaim: condition("vwap-reclaim", "VWAP reclaim", boolVerdict(reclaim), reclaim ? "BULLISH" : "NEUTRAL", reclaim ? "Price closed back above VWAP after trading below it." : "No completed VWAP reclaim sequence on the last closed candles."),
    hold: condition("vwap-hold", "VWAP holding", boolVerdict(hold), hold ? "BULLISH" : "NEUTRAL", hold ? "Recent lows tagged VWAP and closes remained above it." : "VWAP is not currently acting as held support."),
    direction: above ? "BULLISH" : "BEARISH",
  };
}

export function analyzeVolume(bars: ScalpBar[], config: ScalpConfig = DEFAULT_SCALP_CONFIG, now = new Date()) {
  const r = timeAwareRvol(bars, now);
  const lastBar = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : null;
  const range = lastBar ? lastBar.high - lastBar.low : 0;
  const atrVal = lastAtr(bars) || 0;
  const expansion = atrVal > 0 ? range >= atrVal * 0.6 : null;
  const rvolOk = r.rvol != null ? r.rvol >= config.volume.minimumRvol : null;
  const confirm = rvolOk === true && expansion === true;
  const highVolNoMove = rvolOk === true && expansion === false;
  return {
    current: r.current,
    expected: r.expected,
    rvol: r.rvol,
    confirmation: condition(
      "vol-confirm",
      "Volume confirmation",
      highVolNoMove ? "NEUTRAL" : boolVerdict(confirm),
      confirm ? "BULLISH" : "NEUTRAL",
      r.rvol == null
        ? "Time-of-day volume baseline is unavailable."
        : highVolNoMove
          ? `RVOL ${r.rvol.toFixed(2)} is elevated but the candle range is not expanding versus ATR — high volume without meaningful price movement.`
          : `RVOL ${r.rvol.toFixed(2)} vs time-of-day expected ${r.expected?.toFixed(0) || "—"}; range ${range.toFixed(2)} vs ATR ${atrVal.toFixed(2)}.`,
    ),
    breakoutVolume: condition("vol-breakout", "Breakout volume", boolVerdict(rvolOk), rvolOk ? "BULLISH" : "NEUTRAL", r.rvol == null ? "RVOL unavailable." : `RVOL ${r.rvol.toFixed(2)} ${rvolOk ? "meets" : "is below"} the ${config.volume.minimumRvol}x time-of-day threshold.`),
    aboveNormal: condition("vol-above", "Above normal volume", boolVerdict(r.rvol != null ? r.rvol > 1 : null), "NEUTRAL", r.rvol == null ? "Expected slot volume unavailable." : `Current ${r.current} vs expected ${r.expected?.toFixed(0)} (RVOL ${r.rvol.toFixed(2)}).`),
    lastRange: range,
    prevClose: prev?.close ?? null,
  };
}

function levelStatus(price: number | null, bars: ScalpBar[]): ScalpLevel["status"] {
  if (price == null || !bars.length) return "INSUFFICIENT_DATA";
  const lastBar = bars[bars.length - 1];
  const prior = bars.slice(0, -1);
  const crossed = lastBar.close > price;
  const wasBelow = prior.length ? prior[prior.length - 1].close <= price : true;
  const lost = lastBar.close < price && prior.some((b) => b.close > price);
  const hold = Math.abs(lastBar.low - price) / price < 0.002 && lastBar.close >= price;
  if (lost) return "LOST";
  if (crossed && wasBelow) return "BROKEN";
  if (hold) return "HOLDING";
  if (lastBar.high >= price && lastBar.close < price) return "REJECTED";
  if (prior.some((b) => b.close > price) && lastBar.close > price) return "RECLAIMED";
  return crossed ? "BROKEN" : "INTACT";
}

export function buildKeyLevels(intraday: ScalpBar[], daily: ScalpBar[], now = new Date()): ScalpLevel[] {
  const day = isoDateEastern(now);
  const today = regularBars(intraday).filter((b) => easternParts(b.time).date === day);
  const pre = intraday.filter((b) => {
    const p = easternParts(b.time);
    const mins = p.hour * 60 + p.minute;
    return p.date === day && mins >= 4 * 60 && mins < 9 * 60 + 30;
  });
  const or = today.filter((b) => {
    const p = easternParts(b.time);
    const mins = p.hour * 60 + p.minute;
    return mins >= 9 * 60 + 30 && mins < 10 * 60;
  });
  const priorDaily = daily.filter((b) => isoDateEastern(new Date(b.time * 1000)) < day);
  const pd = priorDaily[priorDaily.length - 1];
  const vwap = sessionVwap(intraday, now).value;
  const closed = closedBars(intraday, "5m", now);
  const rows: Array<[string, string, number | null]> = [
    ["pdh", "Previous Day High", pd?.high ?? null],
    ["pdl", "Previous Day Low", pd?.low ?? null],
    ["pdc", "Previous Close", pd?.close ?? null],
    ["pmh", "Premarket High", pre.length ? Math.max(...pre.map((b) => b.high)) : null],
    ["pml", "Premarket Low", pre.length ? Math.min(...pre.map((b) => b.low)) : null],
    ["orh", "Opening Range High", or.length ? Math.max(...or.map((b) => b.high)) : null],
    ["orl", "Opening Range Low", or.length ? Math.min(...or.map((b) => b.low)) : null],
    ["open", "Opening Price", today[0]?.open ?? null],
    ["vwap", "VWAP", vwap],
    ["sh", "Session High", today.length ? Math.max(...today.map((b) => b.high)) : null],
    ["sl", "Session Low", today.length ? Math.min(...today.map((b) => b.low)) : null],
  ];
  return rows.map(([id, name, price]) => {
    const status = levelStatus(price, closed);
    return {
      id,
      name,
      price,
      status,
      why: price == null ? `${name} is unavailable for this session.` : `${name} at ${price.toFixed(2)} is ${status.replaceAll("_", " ").toLowerCase()} on the last closed candle.`,
    };
  });
}

function mapSharedStatus(status: string): ScalpLevel["status"] {
  if (status === "LOST") return "LOST";
  if (status === "RECLAIMED" || status === "RETEST_CONFIRMED") return "RECLAIMED";
  if (status === "BROKEN") return "BROKEN";
  if (status === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
  return status === "ABOVE" ? "INTACT" : "INTACT";
}

function fromShared(id: string, name: string, ctx: TickerMarketContext | null | undefined, fallback: ScalpLevel): ScalpLevel {
  const row = ctx ? Object.values(ctx.levels).find((l) => l.id === id) : null;
  if (!row || row.level == null) {
    if (fallback.price != null) return fallback;
    const availability = id === "pmh" || id === "pml" ? ctx?.sessions.preMarket.availability : id === "onh" || id === "onl" ? ctx?.sessions.overnight.availability : null;
    if (availability === "NO_TRADES" || availability === "NOT_STARTED") {
      return { id, name, price: null, status: "INTACT", why: `${name}: ${availability.replaceAll("_", " ")} — this is not missing provider data.` };
    }
    return fallback;
  }
  return { id, name, price: row.level, status: mapSharedStatus(row.status), why: row.why };
}

export function mergeSharedLevels(levels: ScalpLevel[], ctx?: TickerMarketContext | null): ScalpLevel[] {
  if (!ctx) return levels;
  const extras: ScalpLevel[] = [
    fromShared("onh", "Overnight High", ctx, { id: "onh", name: "Overnight High", price: ctx.sessions.overnight.high ?? null, status: ctx.sessions.overnight.availability === "AVAILABLE" ? "INTACT" : "INSUFFICIENT_DATA", why: ctx.sessions.overnight.availability }),
    fromShared("onl", "Overnight Low", ctx, { id: "onl", name: "Overnight Low", price: ctx.sessions.overnight.low ?? null, status: ctx.sessions.overnight.availability === "AVAILABLE" ? "INTACT" : "INSUFFICIENT_DATA", why: ctx.sessions.overnight.availability }),
  ];
  const merged = levels.map((lv) => {
    if (lv.id === "pmh") return fromShared("pmh", "Premarket High", ctx, lv);
    if (lv.id === "pml") return fromShared("pml", "Premarket Low", ctx, lv);
    if (lv.id === "pdh") return fromShared("pdh", "Previous Day High", ctx, lv);
    if (lv.id === "pdl") return fromShared("pdl", "Previous Day Low", ctx, lv);
    if (lv.id === "pdc") return fromShared("pdc", "Previous Close", ctx, lv);
    return lv;
  });
  const pdhAt = merged.findIndex((l) => l.id === "pdc");
  merged.splice(Math.max(pdhAt, 0) + 1, 0, ...extras);
  return merged;
}

export function analyzeBreakout(bars: ScalpBar[], tf: ScalpTimeframe, level: number | null, config: ScalpConfig = DEFAULT_SCALP_CONFIG, now = new Date()): ScalpBreakout {
  const closed = closedBars(bars, tf, now);
  const forming = isFormingBar(bars[bars.length - 1], tf, now);
  const miss = insufficient("bo", "Breakout", "Need a reference level and closed candles.");
  if (level == null || closed.length < 4) {
    return { timeframe: tf, level, priceCrossed: miss, closedBeyond: miss, volume: miss, followThrough: miss, retest: miss, status: "INSUFFICIENT_DATA", why: miss.why };
  }
  const atrVal = lastAtr(closed) || 0;
  const lastC = closed[closed.length - 1];
  const prev = closed[closed.length - 2];
  const older = closed[closed.length - 3];
  const minDist = atrVal * config.breakout.minimumBreakoutAtrMultiple;
  const crossed = lastC.high > level;
  const closedAbove = lastC.close >= level + minDist;
  const rvol = timeAwareRvol(closed, now).rvol;
  const volOk = rvol == null ? null : rvol >= config.volume.minimumRvol;
  const follow = closed.length >= 2 && prev.close > level && lastC.close > level;
  const lost = older.close > level && lastC.close < level;
  const wickOnly = lastC.high > level && lastC.close <= level;
  let status: ScalpBreakout["status"] = "NO_BREAKOUT";
  if (forming && crossed && !closedAbove) status = "BREAKOUT_FORMING";
  else if (lost && older.close > level) status = "FAKEOUT";
  else if (closedAbove && (config.breakout.requireFollowThrough ? follow : true) && (config.breakout.requireVolumeConfirmation ? volOk !== false : true)) status = "BREAKOUT_CONFIRMED";
  else if (wickOnly || (crossed && !closedAbove)) status = "BREAKOUT_FORMING";
  else if (lost) status = "FAILED";
  const why =
    status === "FAKEOUT"
      ? `Price closed back below ${level.toFixed(2)} after a prior close above the level — fakeout, not a confirmed breakout.`
      : status === "BREAKOUT_CONFIRMED"
        ? `${tf} closed ${lastC.close.toFixed(2)} beyond ${level.toFixed(2)} (min distance ${minDist.toFixed(2)}). Volume RVOL ${rvol?.toFixed(2) || "n/a"}.`
        : wickOnly
          ? `A wick crossed ${level.toFixed(2)} but the candle closed at ${lastC.close.toFixed(2)} — close confirmation is required.`
          : `No confirmed ${tf} close beyond ${level.toFixed(2)}.`;
  return {
    timeframe: tf,
    level,
    priceCrossed: condition("px-cross", "Price crossed", boolVerdict(crossed), crossed ? "BULLISH" : "NEUTRAL", crossed ? `High ${lastC.high.toFixed(2)} crossed ${level.toFixed(2)}.` : `High ${lastC.high.toFixed(2)} has not crossed ${level.toFixed(2)}.`),
    closedBeyond: condition("close-beyond", "Candle closed above", boolVerdict(closedAbove), closedAbove ? "BULLISH" : "NEUTRAL", `Close ${lastC.close.toFixed(2)} vs level ${level.toFixed(2)} + ${minDist.toFixed(2)} ATR buffer.`),
    volume: condition("bo-vol", "Volume confirmation", boolVerdict(volOk), volOk ? "BULLISH" : "NEUTRAL", rvol == null ? "RVOL unavailable." : `RVOL ${rvol.toFixed(2)}.`),
    followThrough: condition("ft", "Follow-through", boolVerdict(follow), follow ? "BULLISH" : "NEUTRAL", follow ? "The next closed candle held above the level." : "Follow-through close has not confirmed."),
    retest: condition("bo-retest", "Retest", "NEUTRAL", "NEUTRAL", "Retest is evaluated in the dedicated retest block."),
    status,
    why,
  };
}

export function analyzeRetest(bars: ScalpBar[], tf: ScalpTimeframe, level: number | null, breakout: ScalpBreakout, config: ScalpConfig = DEFAULT_SCALP_CONFIG, now = new Date()): ScalpRetest {
  const closed = closedBars(bars, tf, now);
  if (level == null || closed.length < 3 || breakout.status === "INSUFFICIENT_DATA") {
    const miss = insufficient("retest", "Retest", "Retest requires a breakout level and closed candles.");
    return { timeframe: tf, level, occurring: miss, held: miss, confirmed: miss, status: "INSUFFICIENT_DATA", why: miss.why };
  }
  if (breakout.status !== "BREAKOUT_CONFIRMED" && breakout.status !== "FAKEOUT") {
    const none = condition("retest-none", "Retest occurring", "NO", "NEUTRAL", "No confirmed breakout exists to retest.");
    return { timeframe: tf, level, occurring: none, held: none, confirmed: none, status: "NONE", why: none.why };
  }
  const atrVal = lastAtr(closed) || 0;
  const lastC = closed[closed.length - 1];
  const near = Math.abs(lastC.low - level) <= atrVal * config.retest.maxDistanceAtr || lastC.low <= level;
  const held = lastC.close >= level && lastC.low <= level + atrVal * config.retest.maxDistanceAtr;
  const failed = lastC.close < level && breakout.status === "BREAKOUT_CONFIRMED";
  const confirmed = held && lastC.close > level;
  let status: ScalpRetest["status"] = "NONE";
  if (failed) status = "FAILED";
  else if (confirmed) status = "CONFIRMED";
  else if (near) status = "PENDING";
  return {
    timeframe: tf,
    level,
    occurring: condition("rt-occ", "Retest occurring", boolVerdict(near), "NEUTRAL", near ? `Price returned to within ${config.retest.maxDistanceAtr} ATR of ${level.toFixed(2)}.` : `Price has not returned to ${level.toFixed(2)}.`),
    held: condition("rt-hold", "Level held", failed ? "NO" : boolVerdict(held), held ? "BULLISH" : failed ? "BEARISH" : "NEUTRAL", failed ? `Close ${lastC.close.toFixed(2)} lost ${level.toFixed(2)}.` : `Close ${lastC.close.toFixed(2)} vs level ${level.toFixed(2)}.`),
    confirmed: condition("rt-conf", "Retest confirmed", boolVerdict(confirmed), confirmed ? "BULLISH" : "NEUTRAL", confirmed ? "Retest held and the candle closed back above the breakout level." : "Retest has not produced a confirming close."),
    status,
    why: status === "CONFIRMED" ? `Retest of ${level.toFixed(2)} held; close ${lastC.close.toFixed(2)}.` : status === "PENDING" ? `Price is back at ${level.toFixed(2)} but the confirming close is still pending.` : status === "FAILED" ? `Retest failed; close ${lastC.close.toFixed(2)} is back below ${level.toFixed(2)}.` : "No retest sequence.",
  };
}

export function analyzeMomentum(bars: ScalpBar[]): ScalpAnalysis["momentum"] {
  if (bars.length < 35) {
    const miss = insufficient("mom", "Momentum", "Need more closed candles for RSI/MACD/EMA.");
    return { rsi: null, rsiDirection: "NEUTRAL", macd: miss, emaStack: miss, confirmation: miss };
  }
  const close = series(bars, "close");
  const r = rsi(close, 14);
  const rsiNow = last(r);
  const rsiPrev = r.length > 2 ? r[r.length - 2] : null;
  const [macdLine, , hist] = macd(close);
  const histNow = last(hist);
  const histPrev = hist.length > 2 ? hist[hist.length - 2] : null;
  const e9 = last(ema(close, 9));
  const e20 = last(ema(close, 20));
  const e50 = last(ema(close, 50));
  const rsiDir: ScalpDirection = rsiNow != null && rsiPrev != null ? (rsiNow > rsiPrev ? "BULLISH" : rsiNow < rsiPrev ? "BEARISH" : "NEUTRAL") : "NEUTRAL";
  const macdBull = histNow != null && histNow > 0 && (histPrev == null || histNow >= histPrev);
  const stack = e9 != null && e20 != null ? e9 > e20 : null;
  const confirm = macdBull && stack === true && rsiDir === "BULLISH";
  return {
    rsi: rsiNow,
    rsiDirection: rsiDir,
    macd: condition("macd", "MACD", boolVerdict(macdBull), macdBull ? "BULLISH" : "BEARISH", `MACD line ${last(macdLine)?.toFixed(3) || "—"}, histogram ${histNow?.toFixed(3) || "—"}.`),
    emaStack: condition("ema", "EMA 9 > EMA 20", boolVerdict(stack), stack ? "BULLISH" : "BEARISH", `EMA9 ${e9?.toFixed(2) || "—"} vs EMA20 ${e20?.toFixed(2) || "—"}${e50 != null ? `; EMA50 ${e50.toFixed(2)}` : ""}.`),
    confirmation: condition("mom-conf", "Momentum confirmation", boolVerdict(confirm), confirm ? "BULLISH" : "NEUTRAL", confirm ? "RSI rising, MACD histogram expanding, and EMA 9 > EMA 20." : "Momentum components are mixed; they do not override price structure."),
  };
}

export function analyzeRiskReward(bars: ScalpBar[], level: number | null, nearbyResistance: number | null, config: ScalpConfig = DEFAULT_SCALP_CONFIG): ScalpAnalysis["riskReward"] {
  const px = bars.length ? bars[bars.length - 1].close : null;
  const atrVal = lastAtr(bars);
  if (px == null || atrVal == null) {
    const miss = insufficient("rr", "Risk validation", "Price or ATR is unavailable — stop/targets are not invented.");
    return { entry: px, stop: null, stopBasis: "Insufficient ATR", t1: null, t2: null, t3: null, risk: null, reward: null, rr: null, validation: miss };
  }
  const swingLow = Math.min(...bars.slice(-20).map((b) => b.low));
  const stop = Math.min(swingLow, px) - atrVal * config.risk.atrStopBuffer;
  const risk = px - stop;
  const t1 = px + risk * config.risk.minimumRr;
  const t2 = px + risk * (config.risk.minimumRr + 1);
  const t3 = px + risk * (config.risk.minimumRr + 2);
  const blocked = nearbyResistance != null && nearbyResistance < t1 && nearbyResistance > px;
  const rr = risk > 0 ? (t1 - px) / risk : null;
  return {
    entry: px,
    stop,
    stopBasis: `Below recent ${bars.length ? "swing low" : "price"} ${swingLow.toFixed(2)} + ${config.risk.atrStopBuffer} ATR buffer (${atrVal.toFixed(2)}).`,
    t1,
    t2,
    t3,
    risk,
    reward: t1 - px,
    rr,
    validation: condition(
      "rr-valid",
      "Risk validation",
      blocked ? "NO" : boolVerdict(rr != null && rr >= config.risk.minimumRr),
      "NEUTRAL",
      blocked
        ? `T1 ${t1.toFixed(2)} sits through nearby resistance ${nearbyResistance!.toFixed(2)} — R:R is not validated.`
        : `R:R ${(rr || 0).toFixed(2)}:1 using structural stop ${stop.toFixed(2)} and T1 ${t1.toFixed(2)}. This is not a trade recommendation.`,
    ),
  };
}

export function deriveTradeState(primary: ScalpTimeframeBlock, liquidity: ScalpCondition, dataOk: boolean): ScalpTradeState {
  if (!dataOk) return "INSUFFICIENT_DATA";
  if (liquidity.verdict === "NO") return "NO_TRADE";
  if (primary.breakout.status === "FAKEOUT" || primary.retest.status === "FAILED") return "FAILED";
  if (primary.retest.status === "CONFIRMED" && primary.breakout.status === "BREAKOUT_CONFIRMED") return "RETEST_CONFIRMED";
  if (primary.breakout.status === "BREAKOUT_CONFIRMED" && primary.retest.status === "PENDING") return "RETEST_PENDING";
  if (primary.breakout.status === "BREAKOUT_CONFIRMED") return "BREAKOUT_CONFIRMED";
  if (primary.breakout.status === "BREAKOUT_FORMING") return "BREAKOUT_PENDING";
  if (primary.structure.verdict === "YES" && primary.vwap.verdict === "YES") return "SETUP_FORMING";
  if (primary.structure.verdict === "YES") return "TRIGGER_PENDING";
  return "WATCH";
}

export function deriveOverall(checklist: ScalpCondition[], trade: ScalpTradeState): ScalpOverall {
  if (trade === "INSUFFICIENT_DATA" || checklist.every((c) => c.verdict === "INSUFFICIENT_DATA")) return "INSUFFICIENT_DATA";
  if (trade === "NO_TRADE" || trade === "FAILED") return "NO_TRADE";
  const yes = checklist.filter((c) => c.verdict === "YES").length;
  const no = checklist.filter((c) => c.verdict === "NO").length;
  if (trade === "RETEST_CONFIRMED" && no === 0) return "CONFIRMED";
  if (trade === "BREAKOUT_CONFIRMED" || trade === "RETEST_PENDING" || trade === "SETUP_FORMING") return "SETUP_FORMING";
  if (yes >= 4 && no <= 2) return "WAIT";
  return "WAIT";
}

function ctxCondition(label: string, change?: number | null): ScalpCondition {
  if (change == null) return insufficient(label, label, `${label} quote is unavailable.`);
  const up = change > 0;
  return condition(label.toLowerCase(), label, boolVerdict(up), up ? "BULLISH" : change < 0 ? "BEARISH" : "NEUTRAL", `${label} ${change >= 0 ? "+" : ""}${change.toFixed(2)}% — direction is ${up ? "up" : change < 0 ? "down" : "flat"}, not a trade signal.`);
}

export function buildScalpAnalysis(input: {
  ticker: string;
  name?: string;
  primary: ScalpTimeframe;
  quote: Quote;
  bars: Record<ScalpTimeframe | "1d" | "1h", OHLCVBar[]>;
  context: { spy?: Quote | null; qqq?: Quote | null; vix?: Quote | null; sector?: Quote | null; sectorName?: string };
  news?: { headline: string; source?: string; publishedAt?: string | null }[];
  now?: Date;
  source?: string;
  config?: ScalpConfig;
  marketContext?: TickerMarketContext | null;
}): ScalpAnalysis {
  const now = input.now || new Date();
  const config = input.config || DEFAULT_SCALP_CONFIG;
  const session = sessionOf(now);
  const mapped: Record<ScalpTimeframe, ScalpBar[]> = {
    "5m": toScalpBars(input.bars["5m"] || []),
    "15m": toScalpBars(input.bars["15m"] || []),
    "30m": toScalpBars(input.bars["30m"] || []),
  };
  const daily = toScalpBars(input.bars["1d"] || []);
  const levels = mergeSharedLevels(buildKeyLevels(mapped["5m"], daily, now), input.marketContext);
  const breakoutLevel = levels.find((l) => l.id === "pdh")?.price ?? levels.find((l) => l.id === "orh")?.price ?? null;
  const resistance = levels.find((l) => l.id === "pmh" || l.id === "sh")?.price ?? null;

  const blocks = {} as Record<ScalpTimeframe, ScalpTimeframeBlock>;
  for (const tf of TF_LIST) {
    const raw = mapped[tf];
    const closed = closedBars(raw, tf, now);
    const forming = isFormingBar(raw[raw.length - 1], tf, now);
    const structure = analyzeStructure(closed, config);
    const trend = analyzeTrend(closed);
    const vwap = analyzeVwapBlock(closed.length ? closed : raw, now);
    const volume = analyzeVolume(closed.length ? closed : raw, config, now);
    const breakout = analyzeBreakout(raw, tf, breakoutLevel, config, now);
    const retest = analyzeRetest(raw, tf, breakoutLevel, breakout, config, now);
    const momentum = analyzeMomentum(closed);
    blocks[tf] = {
      timeframe: tf,
      forming,
      lastCandleAt: closed.length ? new Date(closed[closed.length - 1].time * 1000).toISOString() : null,
      structure,
      trend,
      vwap: vwap.above,
      volume: volume.confirmation,
      breakout,
      retest,
      momentum: momentum.confirmation,
    };
  }

  const primary = blocks[input.primary];
  const vwap = analyzeVwapBlock(closedBars(mapped[input.primary], input.primary, now), now);
  const volume = analyzeVolume(closedBars(mapped[input.primary], input.primary, now), config, now);
  const momentum = analyzeMomentum(closedBars(mapped[input.primary], input.primary, now));
  const rr = analyzeRiskReward(closedBars(mapped[input.primary], input.primary, now), breakoutLevel, resistance, config);
  const previousClose = input.marketContext?.previousRegularClose ?? num(input.quote.previous_close);
  const px = num(input.quote.price) ?? (mapped[input.primary].at(-1)?.close ?? null);
  const sessionChange = px != null && previousClose != null ? px - previousClose : num(input.quote.change);
  const sessionChangePct = sessionChange != null && previousClose ? (sessionChange / previousClose) * 100 : num(input.quote.change_percent);
  const dollarVol = px != null && input.quote.volume != null ? px * input.quote.volume : null;
  const liqOk = input.quote.average_volume != null && input.quote.volume != null ? input.quote.volume >= input.quote.average_volume * 0.4 && (dollarVol == null || dollarVol >= 1_000_000) : input.quote.volume != null ? input.quote.volume > 0 : null;
  const liquidity = condition("liq", "Liquidity adequate", boolVerdict(liqOk), "NEUTRAL", liqOk == null ? "Volume baseline is incomplete." : `Current volume ${input.quote.volume || 0}; dollar volume ${dollarVol ? dollarVol.toFixed(0) : "n/a"}.`);
  const spread = insufficient("spread", "Spread acceptable", "Bid/ask is not provided by the quote feed — spread is not invented.");

  const spy = ctxCondition("SPY", input.context.spy?.change_percent);
  const qqq = ctxCondition("QQQ", input.context.qqq?.change_percent);
  const vix = input.context.vix?.change_percent == null
    ? insufficient("vix", "VIX", "VIX quote unavailable.")
    : condition("vix", "VIX", boolVerdict(input.context.vix.change_percent < 0), input.context.vix.change_percent < 0 ? "BULLISH" : "BEARISH", `VIX ${input.context.vix.change_percent.toFixed(2)}% — declining volatility is supportive, rising volatility is a headwind.`);
  const sector = ctxCondition(input.context.sectorName || "Sector", input.context.sector?.change_percent);
  const alignYes = [spy, qqq, sector].filter((c) => c.verdict === "YES").length >= 2;
  const alignment = condition("align", "Market alignment", [spy, qqq, sector].some((c) => c.verdict === "INSUFFICIENT_DATA") && !alignYes ? "INSUFFICIENT_DATA" : boolVerdict(alignYes), alignYes ? "BULLISH" : "NEUTRAL", "Alignment requires the stock's direction to agree with SPY/QQQ/sector — it is context, not an entry.");

  const vs = (label: string, bench?: number | null) => {
    const stock = input.quote.change_percent;
    if (stock == null || bench == null) return insufficient(label, label, "Relative strength needs both the stock and benchmark change.");
    const stronger = stock > bench;
    return condition(label, label, boolVerdict(stronger), stronger ? "BULLISH" : "BEARISH", `Stock ${stock.toFixed(2)}% vs benchmark ${bench.toFixed(2)}%.`);
  };

  const news = input.news || [];
  const catalystPresent = news.length > 0;
  const headline = news[0]?.headline || "";
  const type = /earn/i.test(headline) ? "Earnings" : /guid/i.test(headline) ? "Guidance" : /upgrade|downgrade|analyst/i.test(headline) ? "Analyst" : catalystPresent ? "Headline" : "None";

  const checklist: ScalpCondition[] = [
    primary.trend,
    primary.structure,
    vwap.above,
    vwap.hold,
    volume.aboveNormal,
    volume.confirmation,
    condition("bo", "Breakout confirmed", primary.breakout.status === "BREAKOUT_CONFIRMED" ? "YES" : primary.breakout.status === "FAKEOUT" ? "NO" : primary.breakout.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO", primary.breakout.status === "BREAKOUT_CONFIRMED" ? "BULLISH" : "NEUTRAL", primary.breakout.why),
    condition("fakeout", "Fakeout", primary.breakout.status === "FAKEOUT" ? "YES" : primary.breakout.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO", "BEARISH", primary.breakout.status === "FAKEOUT" ? primary.breakout.why : "No fakeout: the last closed sequence did not lose a confirmed breakout."),
    condition("rt", "Retest confirmed", primary.retest.status === "CONFIRMED" ? "YES" : primary.retest.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO", primary.retest.status === "CONFIRMED" ? "BULLISH" : "NEUTRAL", primary.retest.why),
    momentum.confirmation,
    vs("vs SPY", input.context.spy?.change_percent),
    liquidity,
    rr.validation,
    alignment,
  ];

  const tradeState = deriveTradeState(primary, liquidity, mapped[input.primary].length >= 20);
  const overallState = deriveOverall(checklist, tradeState);
  const yes = checklist.filter((c) => c.verdict === "YES").length;
  const scored = checklist.filter((c) => c.verdict !== "INSUFFICIENT_DATA").length;

  const mtfRows = [
    { metric: "Trend", key: "trend" as const },
    { metric: "Structure", key: "structure" as const },
    { metric: "VWAP", key: "vwap" as const },
    { metric: "Volume", key: "volume" as const },
    { metric: "Breakout", key: "breakout" as const },
    { metric: "Retest", key: "retest" as const },
    { metric: "Momentum", key: "momentum" as const },
  ].map((row) => ({
    metric: row.metric,
    "5m": row.key === "breakout" ? (blocks["5m"].breakout.status === "BREAKOUT_CONFIRMED" ? "YES" : blocks["5m"].breakout.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO") : row.key === "retest" ? (blocks["5m"].retest.status === "CONFIRMED" ? "YES" : blocks["5m"].retest.status === "PENDING" ? "NEUTRAL" : blocks["5m"].retest.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO") : blocks["5m"][row.key].verdict,
    "15m": row.key === "breakout" ? (blocks["15m"].breakout.status === "BREAKOUT_CONFIRMED" ? "YES" : blocks["15m"].breakout.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO") : row.key === "retest" ? (blocks["15m"].retest.status === "CONFIRMED" ? "YES" : blocks["15m"].retest.status === "PENDING" ? "NEUTRAL" : blocks["15m"].retest.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO") : blocks["15m"][row.key].verdict,
    "30m": row.key === "breakout" ? (blocks["30m"].breakout.status === "BREAKOUT_CONFIRMED" ? "YES" : blocks["30m"].breakout.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO") : row.key === "retest" ? (blocks["30m"].retest.status === "CONFIRMED" ? "YES" : blocks["30m"].retest.status === "PENDING" ? "NEUTRAL" : blocks["30m"].retest.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO") : blocks["30m"][row.key].verdict,
  })) as ScalpAnalysis["mtf"]["rows"];

  const htfWeight = ["15m", "30m"].filter((tf) => blocks[tf as ScalpTimeframe].trend.verdict === "YES" && blocks[tf as ScalpTimeframe].structure.verdict === "YES").length;
  const mtfAlign = condition("mtf", "MTF alignment", htfWeight >= 1 && primary.trend.verdict === "YES" ? "YES" : primary.trend.verdict === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NO", "NEUTRAL", "Alignment requires the selected timeframe plus at least one higher scalp timeframe — boxes are not simply counted.");

  const chartBars = (mapped[input.primary].length ? mapped[input.primary] : mapped["5m"]).slice(-180);
  const close = chartBars.map((b) => b.close);
  const markers: ScalpAnalysis["markers"] = [];
  if (primary.breakout.status === "BREAKOUT_CONFIRMED" && primary.breakout.level != null && chartBars.length) {
    markers.push({ time: chartBars[chartBars.length - 1].time, label: "BREAKOUT", price: primary.breakout.level, why: primary.breakout.why });
  }
  if (primary.breakout.status === "FAKEOUT" && primary.breakout.level != null && chartBars.length) {
    markers.push({ time: chartBars[chartBars.length - 1].time, label: "FAKEOUT", price: primary.breakout.level, why: primary.breakout.why });
  }
  if (primary.retest.status === "CONFIRMED" && primary.retest.level != null && chartBars.length) {
    markers.push({ time: chartBars[chartBars.length - 1].time, label: "RETEST CONFIRMED", price: primary.retest.level, why: primary.retest.why });
  }

  const atrVal = lastAtr(closedBars(mapped[input.primary], input.primary, now));
  const lastMove = chartBars.length > 1 ? Math.abs(chartBars[chartBars.length - 1].close - chartBars[chartBars.length - 2].close) : null;

  return {
    ticker: input.ticker.toUpperCase(),
    name: input.name || input.quote.name || input.ticker.toUpperCase(),
    primaryTimeframe: input.primary,
    timestamp: now.toISOString(),
    last_updated_est: formatEstDateTime(now),
    data_status: input.quote.freshness?.data_status === "STALE" ? "STALE" : session === "CLOSED" ? "DELAYED" : "LIVE",
    session,
    market: session === "REGULAR" ? "OPEN" : "CLOSED",
    quote: {
      price: px,
      change: sessionChange,
      change_percent: sessionChangePct,
      volume: num(input.quote.volume),
      average_volume: num(input.quote.average_volume),
    },
    snapshot: {
      rvol: volume.rvol,
      vwap: vwap.value,
      atr: atrVal,
      session,
      market: session === "REGULAR" ? "OPEN" : session,
    },
    marketContext: { spy, qqq, vix, sector, alignment },
    timeframes: blocks,
    vwap,
    volume,
    keyLevels: levels,
    momentum,
    relativeStrength: {
      vsSpy: vs("vs SPY", input.context.spy?.change_percent),
      vsQqq: vs("vs QQQ", input.context.qqq?.change_percent),
      vsSector: vs("vs Sector", input.context.sector?.change_percent),
    },
    liquidity: {
      currentVolume: num(input.quote.volume),
      averageVolume: num(input.quote.average_volume),
      dollarVolume: dollarVol,
      adequate: liquidity,
      spread,
    },
    atr: { value: atrVal, pct: atrVal != null && px ? (atrVal / px) * 100 : null, moveOverAtr: atrVal && lastMove != null ? lastMove / atrVal : null },
    riskReward: rr,
    catalyst: {
      present: condition("cat", "Catalyst present", boolVerdict(catalystPresent), "NEUTRAL", catalystPresent ? `Latest headline: ${headline}` : "No live headline was returned. Presence is not inferred."),
      type,
      direction: /beat|upgrade|surge|record|raises/i.test(headline) ? "Positive" : /miss|downgrade|cut|fall|probe/i.test(headline) ? "Negative" : catalystPresent ? "Unknown" : "Unknown",
      items: news.slice(0, 5).map((n) => ({ headline: n.headline, source: n.source || "news", age: n.publishedAt || "" })),
    },
    mtf: { rows: mtfRows, alignment: mtfAlign },
    checklist,
    overallState,
    tradeState,
    evidenceScore: scored ? Math.round((yes / scored) * 100) : null,
    bars: chartBars,
    barSets: {
      "5m": mapped["5m"].slice(-180),
      "15m": mapped["15m"].slice(-180),
      "30m": mapped["30m"].slice(-180),
      "1h": toScalpBars(input.bars["1h"] || []).slice(-180),
      "1d": daily.slice(-180),
    },
    overlays: {
      ema9: last(ema(close, 9)),
      ema20: last(ema(close, 20)),
      ema50: last(ema(close, 50)),
      vwap: vwap.value,
    },
    markers,
    disclaimer: "Scalping is riskful. This page reports whether configured conditions are currently confirmed. It is a decision-support tool, not a recommendation to buy or sell.",
    source: input.source || "composite",
    extendedHours: input.marketContext || null,
  };
}
