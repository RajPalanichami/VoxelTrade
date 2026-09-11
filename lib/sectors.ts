export const SECTOR_PAGES = [
  { slug: "technology", name: "Technology", etf: "XLK" },
  { slug: "semiconductors", name: "Semiconductors", etf: "SOXX" },
  { slug: "communication", name: "Communication", etf: "XLC" },
  { slug: "financials", name: "Financials", etf: "XLF" },
  { slug: "energy", name: "Energy", etf: "XLE" },
  { slug: "healthcare", name: "Health Care", etf: "XLV" },
  { slug: "discretionary", name: "Discretionary", etf: "XLY" },
  { slug: "industrials", name: "Industrials", etf: "XLI" },
  { slug: "staples", name: "Staples", etf: "XLP" },
  { slug: "materials", name: "Materials", etf: "XLB" },
  { slug: "utilities", name: "Utilities", etf: "XLU" },
  { slug: "real-estate", name: "Real Estate", etf: "XLRE" },
] as const;

export type SectorSlug = (typeof SECTOR_PAGES)[number]["slug"];

export type SectorPayload = import("./mag7").Mag7Payload & {
  slug: string;
  sector: string;
  etf: string;
};

export const SECTOR_PALETTE = [
  "#4ade80",
  "#60a5fa",
  "#38bdf8",
  "#a78bfa",
  "#fb923c",
  "#f472b6",
  "#fbbf24",
  "#94a3b8",
  "#22d3ee",
  "#f87171",
];

export function sectorColor(symbol: string, i = 0) {
  let h = 0;
  for (let n = 0; n < symbol.length; n++) h = (h + symbol.charCodeAt(n) * (n + 1)) % SECTOR_PALETTE.length;
  return SECTOR_PALETTE[(h + i) % SECTOR_PALETTE.length];
}
