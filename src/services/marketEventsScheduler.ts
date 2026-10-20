import { prepareNextWeekMarketEvents, shouldPrepareNextWeek } from "@/src/services/marketEvents";

let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

function inTest() {
  return Boolean(process.env.VITEST);
}

export function ensureMarketEventsScheduler() {
  if (inTest() || started) return;
  started = true;
  const tick = () => {
    const now = new Date();
    if (!shouldPrepareNextWeek(now)) return;
    void prepareNextWeekMarketEvents(now).catch((err) => {
      console.warn("[market-events] scheduled prepare failed; previous snapshot kept", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };
  tick();
  timer = setInterval(tick, 15 * 60 * 1000);
  timer.unref?.();
  console.info("[market-events] Friday/Saturday next-week scheduler armed (15m, America/New_York)");
}

export function stopMarketEventsScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
