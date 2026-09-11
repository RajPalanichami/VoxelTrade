type MemItem = { exp: number; raw: string };

const mem = new Map<string, MemItem>();

export function cacheGet<T = unknown>(key: string): T | null {
  const item = mem.get(key);
  if (!item) return null;
  if (item.exp < Date.now()) {
    mem.delete(key);
    return null;
  }
  try {
    return JSON.parse(item.raw) as T;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown, ttlSeconds: number): void {
  mem.set(key, {
    exp: Date.now() + ttlSeconds * 1000,
    raw: JSON.stringify(value),
  });
}

export function cacheDeletePrefix(prefix: string): void {
  for (const key of mem.keys()) {
    if (key.startsWith(prefix)) mem.delete(key);
  }
}

export function cacheClear(): void {
  mem.clear();
}
