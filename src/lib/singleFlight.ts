const inflight = new Map<string, Promise<unknown>>();

/** Share one in-flight promise for a key. Callers wait for the same result and do not start a second upstream request. */
export function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const job = run().finally(() => {
    if (inflight.get(key) === job) inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}
