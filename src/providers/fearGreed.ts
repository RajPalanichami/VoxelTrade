import { httpGetJson } from "@/src/lib/http";
import { parseCnnFearGreed } from "@/src/engines/fearGreed";
import type { MarketGaugeData } from "@/lib/fearGreed";

const CNN_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

/** CNN blocks bare fetches with 418; send the same browser headers their site uses. */
const CNN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.cnn.com",
  Referer: "https://www.cnn.com/markets/fear-and-greed",
};

export async function fetchFearGreedIndex(): Promise<MarketGaugeData> {
  const cnn = parseCnnFearGreed(await httpGetJson(CNN_URL, undefined, CNN_HEADERS));
  if (!cnn) throw new Error("CNN Fear & Greed index returned no usable reading");
  return cnn;
}
