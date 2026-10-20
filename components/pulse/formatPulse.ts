import { money } from "@/lib/format";
import { PulseCard } from "@/lib/pulse";

export function formatPulseLevel(unit: PulseCard["unit"], value: number) {
  if (unit === "yield" || unit === "inflation") return `${value.toFixed(2)}%`;
  if (unit === "usd") return `$${money(value)}`;
  return money(value);
}

export function pulsePrice(card: PulseCard) {
  if (card.price === null || card.price === undefined) return "—";
  return formatPulseLevel(card.unit, card.price);
}

export function pulseChange(card: PulseCard) {
  const n = card.change;
  if (n === null || n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  if (card.unit === "yield") return `${sign}${n.toFixed(3)}`;
  return `${sign}${money(n)}`;
}
