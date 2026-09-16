export const LOCAL_ENVIRONMENTS = new Set(["development", "local", "test"]);
export const DEPLOYED_ENVIRONMENTS = new Set(["qa", "performance", "production", "staging", "perf"]);

export type { Timeframe } from "@/src/config/timeframes";
export {
  TIMEFRAMES,
  SWING_TIMEFRAMES,
  PATTERN_TIMEFRAMES,
  PATTERN_TIMEFRAME_LABELS,
  TIMEFRAME_LABELS,
  TIMEFRAME_SPECS,
  TWELVE_INTERVAL,
  AV_INTERVAL,
  YF_INTERVAL,
  YF_PERIOD,
  getTimeframeSpec,
  isSwingTimeframe,
  isPatternTimeframe,
  isPatternSwingTimeframe,
  swingHigherTimeframe,
} from "@/src/config/timeframes";
export type { SwingTimeframe, PatternTimeframe } from "@/src/config/timeframes";

export const CACHE_TTL: Record<string, number> = {
  quote: 10,
  "5m": 20,
  "15m": 30,
  "30m": 45,
  "1h": 90,
  "4h": 300,
  "1d": 600,
  "1w": 1800,
  "1M": 3600,
  fundamentals: 86_400,
  news: 300,
  macro: 600,
  movers: 60,
  events: 300,
  search: 3600,
};

export const SECTOR_ETF: Record<string, string> = {
  Technology: "XLK",
  "Information Technology": "XLK",
  "Communication Services": "XLC",
  "Consumer Cyclical": "XLY",
  "Consumer Discretionary": "XLY",
  "Consumer Defensive": "XLP",
  "Consumer Staples": "XLP",
  Energy: "XLE",
  "Financial Services": "XLF",
  Financials: "XLF",
  Healthcare: "XLV",
  "Health Care": "XLV",
  Industrials: "XLI",
  "Basic Materials": "XLB",
  Materials: "XLB",
  "Real Estate": "XLRE",
  Utilities: "XLU",
  Semiconductors: "SOXX",
};

export const INDEX_SYMBOLS = {
  spx: "^GSPC",
  ndx: "^NDX",
  dji: "^DJI",
  vix: "^VIX",
  qqq: "QQQ",
};

function trim(value: string | undefined): string {
  return (value || "").trim();
}

function envString(name: string, fallback = ""): string {
  return trim(process.env[name]) || fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = trim(process.env[name]);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number for environment variable ${name}: ${raw}`);
  }
  return n;
}

function envInt(name: string, fallback: number): number {
  return Math.trunc(envNumber(name, fallback));
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = trim(process.env[name]).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export type AppSettings = {
  environment: string;
  algorithmVersion: string;
  corsOrigins: string;
  databaseUrl: string;
  redisUrl: string;
  twelveDataApiKey: string;
  alphaVantageApiKey: string;
  finnhubApiKey: string;
  fredApiKey: string;
  openaiApiKey: string;
  secUserAgent: string;
  httpTimeout: number;
  twelveDataBaseUrl: string;
  twelveDataMoversUrl: string;
  alphaVantageBaseUrl: string;
  finnhubBaseUrl: string;
  fredApiBaseUrl: string;
  fredCsvUrl: string;
  yahooScreenerUrl: string;
  blsApiUrl: string;
  worldbankCpiUrl: string;
  economicCalendarUrl: string;
  secTickersUrl: string;
  secFactsUrl: string;
  secSubmissionsUrl: string;
  primaryProvider: string;
  fallbackProviders: string;
  minRiskReward: number;
  earningsDangerDays: number;
  staleQuoteSeconds: number;
  moversMinSignificantMove: number;
  moversMinGainerPercent: number;
  moversMinLoserPercent: number;
  moversMinPrice: number;
  moversMinVolume: number;
  moversExcludeEtf: boolean;
  moversExcludeOtc: boolean;
  moversExchanges: string;
};

function readSettings(): AppSettings {
  return {
    environment: envString("ENVIRONMENT", "development"),
    algorithmVersion: envString("ALGORITHM_VERSION", "1.0.0"),
    corsOrigins: envString("CORS_ORIGINS"),
    databaseUrl: envString("DATABASE_URL", "file:./data/protrader.json"),
    redisUrl: envString("REDIS_URL"),
    twelveDataApiKey: envString("TWELVE_DATA_API_KEY"),
    alphaVantageApiKey: envString("ALPHA_VANTAGE_API_KEY"),
    finnhubApiKey: envString("FINNHUB_API_KEY"),
    fredApiKey: envString("FRED_API_KEY"),
    openaiApiKey: envString("OPENAI_API_KEY"),
    secUserAgent: envString("SEC_USER_AGENT"),
    httpTimeout: envNumber("HTTP_TIMEOUT", 20),
    twelveDataBaseUrl: envString("TWELVE_DATA_BASE_URL", "https://api.twelvedata.com"),
    twelveDataMoversUrl: envString("TWELVE_DATA_MOVERS_URL", "https://api.twelvedata.com/market_movers/stocks"),
    alphaVantageBaseUrl: envString("ALPHA_VANTAGE_BASE_URL", "https://www.alphavantage.co/query"),
    finnhubBaseUrl: envString("FINNHUB_BASE_URL", "https://finnhub.io/api/v1"),
    fredApiBaseUrl: envString("FRED_API_BASE_URL", "https://api.stlouisfed.org/fred/series/observations"),
    fredCsvUrl: envString("FRED_CSV_URL", "https://fred.stlouisfed.org/graph/fredgraph.csv"),
    yahooScreenerUrl: envString(
      "YAHOO_SCREENER_URL",
      "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved",
    ),
    blsApiUrl: envString("BLS_API_URL", "https://api.bls.gov/publicAPI/v2/timeseries/data/"),
    worldbankCpiUrl: envString(
      "WORLDBANK_CPI_URL",
      "https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL.ZG",
    ),
    economicCalendarUrl: envString(
      "ECONOMIC_CALENDAR_URL",
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    ),
    secTickersUrl: envString("SEC_TICKERS_URL", "https://www.sec.gov/files/company_tickers.json"),
    secFactsUrl: envString("SEC_FACTS_URL", "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"),
    secSubmissionsUrl: envString("SEC_SUBMISSIONS_URL", "https://data.sec.gov/submissions/CIK{cik}.json"),
    primaryProvider: envString("PRIMARY_PROVIDER", "twelve_data"),
    fallbackProviders: envString("FALLBACK_PROVIDERS", "alpha_vantage,finnhub,yfinance"),
    minRiskReward: envNumber("MIN_RISK_REWARD", 1.5),
    earningsDangerDays: envInt("EARNINGS_DANGER_DAYS", 2),
    staleQuoteSeconds: envInt("STALE_QUOTE_SECONDS", 120),
    moversMinSignificantMove: envNumber("MOVERS_MIN_SIGNIFICANT_MOVE", 50),
    moversMinGainerPercent: envNumber("MOVERS_MIN_GAINER_PERCENT", 0),
    moversMinLoserPercent: envNumber("MOVERS_MIN_LOSER_PERCENT", 0),
    moversMinPrice: envNumber("MOVERS_MIN_PRICE", 1),
    moversMinVolume: envInt("MOVERS_MIN_VOLUME", 100_000),
    moversExcludeEtf: envBool("MOVERS_EXCLUDE_ETF", true),
    moversExcludeOtc: envBool("MOVERS_EXCLUDE_OTC", true),
    moversExchanges: envString("MOVERS_EXCHANGES", "NYSE,NASDAQ,AMEX,ARCA,BATS,NMS,NYQ"),
  };
}

export type Settings = AppSettings & {
  isLocalEnvironment: boolean;
  isDeployedEnvironment: boolean;
  corsOriginList: string[];
  providerChain: string[];
  resolvedSecUserAgent(): string;
  validateRuntime(): void;
};

function applySettings(raw: AppSettings): Settings {
  const environment = raw.environment.toLowerCase();
  const isLocalEnvironment = LOCAL_ENVIRONMENTS.has(environment);
  const isDeployedEnvironment = DEPLOYED_ENVIRONMENTS.has(environment);

  const settings: Settings = {
    ...raw,
    isLocalEnvironment,
    isDeployedEnvironment,
    get corsOriginList() {
      const origins = raw.corsOrigins
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      if (origins.length) return origins;
      if (isLocalEnvironment) return ["http://localhost:3000", "http://127.0.0.1:3000"];
      throw new Error("Missing required environment variable: CORS_ORIGINS");
    },
    get providerChain() {
      const chain = [raw.primaryProvider, ...raw.fallbackProviders.split(",").map((p) => p.trim()).filter(Boolean)];
      const seen: string[] = [];
      for (const p of chain) {
        if (p && !seen.includes(p)) seen.push(p);
      }
      if (!seen.includes("yfinance")) seen.push("yfinance");
      return seen;
    },
    resolvedSecUserAgent() {
      if (raw.secUserAgent.trim()) return raw.secUserAgent.trim();
      if (isLocalEnvironment) return "Voxel Trading research@localhost";
      throw new Error("Missing required environment variable: SEC_USER_AGENT");
    },
    validateRuntime() {
      if (!isDeployedEnvironment) return;
      const missing: string[] = [];
      if (!raw.corsOrigins.trim()) missing.push("CORS_ORIGINS");
      if (!raw.secUserAgent.trim()) missing.push("SEC_USER_AGENT");
      if (missing.length) {
        throw new Error("Missing required environment variable: " + missing.join(", "));
      }
    },
  };

  return settings;
}

let cached: Settings | null = null;

function buildSettings(): Settings {
  return applySettings(readSettings());
}

export function getSettings(): Settings {
  if (!cached) cached = buildSettings();
  return cached;
}

export function resetSettings(): void {
  cached = null;
}

export function createSettings(overrides: Partial<AppSettings> = {}): Settings {
  return applySettings({ ...readSettings(), ...overrides });
}
