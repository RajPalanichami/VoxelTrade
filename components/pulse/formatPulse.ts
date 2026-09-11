import { money } from "@/lib/format";
import { PulseCard } from "@/lib/pulse";

export function pulsePrice(card: PulseCard) {
  if (card.price === null || card.price === undefined) return "—";
  if (card.unit === "yield" || card.unit === "inflation") return `${card.price.toFixed(2)}%`;
  if (card.unit === "usd") return `$${money(card.price)}`;
  return money(card.price);
}

export function pulseChange(card: PulseCard) {
  const n = card.change;
  if (n === null || n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  if (card.unit === "yield") return `${sign}${n.toFixed(3)}`;
  return `${sign}${money(n)}`;
}
