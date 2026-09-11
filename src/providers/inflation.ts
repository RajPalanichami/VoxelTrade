import { getSettings } from "@/src/config/env";
import { httpGetJson, httpPostJson } from "@/src/lib/http";
import { fetchFredCsv } from "@/src/providers/macro";

export async function fetchCpi(): Promise<Record<string, unknown> | null> {
  for (const fn of [blsCpi, fredCpiCsv, worldbankCpi]) {
    try {
      const data = await fn();
      if (data && data.yoy != null) return data;
    } catch {
      continue;
    }
  }
  return null;
}

async function blsCpi(): Promise<Record<string, unknown> | null> {
  const year = new Date().getUTCFullYear();
  const body = await httpPostJson<{ Results?: { series?: Array<{ data?: Array<Record<string, string>> }> } }>(
    getSettings().blsApiUrl,
    { seriesid: ["CUSR0000SA0"], startyear: String(year - 2), endyear: String(year) },
  );
  const series = body.Results?.series || [];
  if (!series.length) return null;
  const rows: [number, number, number][] = [];
  for (const item of series[0].data || []) {
    const period = item.period || "";
    if (!period.startsWith("M") || period === "M13") continue;
    rows.push([Number(item.year), Number(period.slice(1)), Number(item.value)]);
  }
  rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (rows.length < 13) return null;
  const latest = rows[rows.length - 1];
  const yearAgo = [...rows].reverse().find((r) => r[0] === latest[0] - 1 && r[1] === latest[1]);
  if (!yearAgo) return null;
  const yoy = (latest[2] / yearAgo[2] - 1) * 100;
  const mom = rows[rows.length - 2][2] ? (latest[2] / rows[rows.length - 2][2] - 1) * 100 : null;
  const yoySpark: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const prior = rows.slice(0, i).find((p) => p[0] === r[0] - 1 && p[1] === r[1]);
    if (prior) yoySpark.push(Math.round((r[2] / prior[2] - 1) * 10000) / 100);
  }
  return {
    yoy: Math.round(yoy * 100) / 100,
    mom: mom != null ? Math.round(mom * 100) / 100 : null,
    index: latest[2],
    as_of: `${latest[0]}-${String(latest[1]).padStart(2, "0")}`,
    spark: yoySpark.slice(-18),
    source: "BLS CUSR0000SA0",
  };
}

async function fredCpiCsv(): Promise<Record<string, unknown> | null> {
  const vals = await fetchFredCsv("CPIAUCSL");
  if (!vals || vals.length < 13) return null;
  const [latestDate, latest] = vals[vals.length - 1];
  let yearAgo: number | null = null;
  const target = `${Number(latestDate.slice(0, 4)) - 1}-${latestDate.slice(5, 7)}`;
  for (let i = vals.length - 2; i >= 0; i--) {
    if (vals[i][0].slice(0, 7) === target) {
      yearAgo = vals[i][1];
      break;
    }
  }
  if (yearAgo == null) yearAgo = vals[vals.length - 13][1];
  const yoy = (latest / yearAgo - 1) * 100;
  const mom = vals[vals.length - 2][1] ? (latest / vals[vals.length - 2][1] - 1) * 100 : null;
  const yoySpark: number[] = [];
  for (let i = 12; i < vals.length; i++) yoySpark.push(Math.round((vals[i][1] / vals[i - 12][1] - 1) * 10000) / 100);
  return {
    yoy: Math.round(yoy * 100) / 100,
    mom: mom != null ? Math.round(mom * 100) / 100 : null,
    index: latest,
    as_of: latestDate.slice(0, 7),
    spark: yoySpark.slice(-18),
    source: "FRED CPIAUCSL",
  };
}

async function worldbankCpi(): Promise<Record<string, unknown> | null> {
  const body = await httpGetJson<unknown[]>(getSettings().worldbankCpiUrl, { format: "json", per_page: "8" });
  const rows = Array.isArray(body) && body.length > 1 ? (body[1] as Array<Record<string, unknown>>) : [];
  const pts = rows
    .filter((x) => x.value != null)
    .map((x) => [String(x.date), Number(x.value)] as [string, number])
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (!pts.length) return null;
  return {
    yoy: Math.round(pts[pts.length - 1][1] * 100) / 100,
    mom: null,
    index: null,
    as_of: pts[pts.length - 1][0],
    spark: pts.map((p) => p[1]),
    source: "World Bank FP.CPI.TOTL.ZG (annual)",
    frequency: "annual",
  };
}
