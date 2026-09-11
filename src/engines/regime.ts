const VIX_HEALTHY_MAX = 20;
const VIX_STRESS_MIN = 30;
const UST_CAUTION_YIELD = 4.75;
const UST_TIGHT_YIELD = 5.25;
const UST_RISE_FAST_5D = 0.2;
const DXY_STRONG = 106;
const DXY_EXTREME = 110;
const WTI_CAUTION = 80;
const WTI_ELEVATED = 90;
const BRENT_CAUTION = 85;
const BRENT_ELEVATED = 95;
const CPI_TARGET_LOW = 1.5;
const CPI_TARGET_HIGH = 2.5;
const CPI_CAUTION_HIGH = 3.5;
const CPI_STRESS = 5;

export type MacroStatus = { tone: string; label: string; reason: string };

function status(tone: string, label: string, reason: string): MacroStatus {
  return { tone, label, reason };
}

export function vixStatus(level: number | null | undefined): MacroStatus | null {
  if (level == null) return null;
  if (level < VIX_HEALTHY_MAX) {
    return status("HEALTHY", "Calm", `VIX ${level.toFixed(1)} is below ${VIX_HEALTHY_MAX.toFixed(0)} — low fear, constructive for risk.`);
  }
  if (level < VIX_STRESS_MIN) {
    return status("CAUTION", "Elevated", `VIX ${level.toFixed(1)} is in the ${VIX_HEALTHY_MAX.toFixed(0)}–${VIX_STRESS_MIN.toFixed(0)} caution band.`);
  }
  return status("STRESS", "Stress", `VIX ${level.toFixed(1)} is at/above ${VIX_STRESS_MIN.toFixed(0)} — high fear / hedging demand.`);
}

export function treasuryStatus(
  level: number | null | undefined,
  trend: string | null = null,
  change5d: number | null = null,
  tenor = "10Y",
): MacroStatus | null {
  if (level == null) return null;
  const t = (trend || "stable").toLowerCase();
  if (change5d != null && change5d >= UST_RISE_FAST_5D) {
    return status("STRESS", "Tightening fast", `${tenor} rose ${change5d >= 0 ? "+" : ""}${change5d.toFixed(2)}pp over 5 sessions — financial conditions tightening quickly.`);
  }
  if (level >= UST_TIGHT_YIELD) {
    return status("STRESS", "Restrictive", `${tenor} at ${level.toFixed(2)}% is above ${UST_TIGHT_YIELD.toFixed(2)}% — restrictive for duration/growth.`);
  }
  if (level >= UST_CAUTION_YIELD || t === "rising") {
    return status("CAUTION", "Watch yields", `${tenor} ${level.toFixed(2)}% (${t}). Rising or >${UST_CAUTION_YIELD.toFixed(2)}% is a headwind.`);
  }
  if (t === "falling") {
    return status("HEALTHY", "Easing", `${tenor} ${level.toFixed(2)}% and falling — supportive for risk assets.`);
  }
  return status("HEALTHY", "Stable", `${tenor} ${level.toFixed(2)}% is stable and below ${UST_CAUTION_YIELD.toFixed(2)}%.`);
}

export function dxyStatus(level: number | null | undefined, changePercent: number | null = null): MacroStatus | null {
  if (level == null) return null;
  if (level >= DXY_EXTREME) {
    return status("STRESS", "Very strong $", `DXY ${level.toFixed(1)} is above ${DXY_EXTREME.toFixed(0)} — tight global dollar conditions.`);
  }
  if (level >= DXY_STRONG || (changePercent != null && changePercent >= 0.8)) {
    return status("CAUTION", "Strong dollar", `DXY ${level.toFixed(1)} — a strong/rising dollar can pressure commodities and EM.`);
  }
  return status("HEALTHY", "Orderly", `DXY ${level.toFixed(1)} is in an orderly range for risk assets.`);
}

export function oilStatus(level: number | null | undefined, name = "WTI"): MacroStatus | null {
  if (level == null) return null;
  const [caution, elevated] = name === "WTI" ? [WTI_CAUTION, WTI_ELEVATED] : [BRENT_CAUTION, BRENT_ELEVATED];
  if (level >= elevated) {
    return status("STRESS", "Hot oil", `${name} $${level.toFixed(2)} is above $${elevated.toFixed(0)} — stronger inflation / consumer pressure.`);
  }
  if (level >= caution) {
    return status("CAUTION", "Elevated", `${name} $${level.toFixed(2)} is above the $${caution.toFixed(0)} threshold.`);
  }
  return status("HEALTHY", "Contained", `${name} $${level.toFixed(2)} is below $${caution.toFixed(0)} — energy not stressing inflation.`);
}

export function cpiStatus(yoy: number | null | undefined): MacroStatus | null {
  if (yoy == null) return null;
  if (yoy >= CPI_STRESS) {
    return status("STRESS", "High inflation", `CPI ${yoy.toFixed(1)}% YoY is ≥${CPI_STRESS.toFixed(0)}% — well above the Fed 2% target.`);
  }
  if (yoy >= CPI_CAUTION_HIGH || yoy < 1.0) {
    const extra = yoy < 1.0 ? "too low (deflation risk)" : "above comfort";
    return status("CAUTION", "Off target", `CPI ${yoy.toFixed(1)}% YoY is ${extra} vs the ~2% target.`);
  }
  if (CPI_TARGET_LOW <= yoy && yoy <= CPI_TARGET_HIGH) {
    return status("HEALTHY", "Near target", `CPI ${yoy.toFixed(1)}% YoY is inside the ${CPI_TARGET_LOW.toFixed(1)}–${CPI_TARGET_HIGH.toFixed(1)}% band around 2%.`);
  }
  return status("CAUTION", "Watch CPI", `CPI ${yoy.toFixed(1)}% YoY is outside the preferred ${CPI_TARGET_LOW.toFixed(1)}–${CPI_TARGET_HIGH.toFixed(1)}% band.`);
}

export function attachMacroStatus(card: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const sym = card.symbol;
  const px = typeof card.price === "number" ? card.price : null;
  let result: MacroStatus | null = null;
  if (sym === "VIX") result = vixStatus(px);
  else if (sym === "US2Y") result = treasuryStatus(px, extra.trend_20d as string | null, extra.change_5d as number | null, "2Y");
  else if (sym === "US10Y") result = treasuryStatus(px, extra.trend_20d as string | null, extra.change_5d as number | null, "10Y");
  else if (sym === "US20Y") result = treasuryStatus(px, extra.trend_20d as string | null, extra.change_5d as number | null, "20Y");
  else if (sym === "US30Y") result = treasuryStatus(px, extra.trend_20d as string | null, extra.change_5d as number | null, "30Y");
  else if (sym === "DXY") result = dxyStatus(px, typeof card.change_percent === "number" ? card.change_percent : null);
  else if (sym === "WTI") result = oilStatus(px, "WTI");
  else if (sym === "BRENT") result = oilStatus(px, "BRENT");
  else if (sym === "CPI") result = cpiStatus(px);
  if (result) {
    card.status = result;
    card.has_signal = true;
  }
  return card;
}
