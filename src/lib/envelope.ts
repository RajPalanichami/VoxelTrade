import { getSettings } from "@/src/config/env";
import type { DataStatus, Envelope } from "@/src/types/domain";

export function envelope<T>(data: T, source: string, status: DataStatus, latencyMs: number): Envelope<T> {
  return {
    data,
    source,
    timestamp: new Date().toISOString(),
    dataStatus: status,
    latencyMs,
    algorithmVersion: getSettings().algorithmVersion,
  };
}
