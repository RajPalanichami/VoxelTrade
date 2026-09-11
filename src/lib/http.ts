import { getSettings } from "@/src/config/env";

export async function httpGetJson<T = unknown>(
  url: string,
  params?: Record<string, string | number | undefined>,
  headers?: Record<string, string>,
): Promise<T> {
  const settings = getSettings();
  const target = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") target.searchParams.set(k, String(v));
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.httpTimeout * 1000);
  try {
    const res = await fetch(target.toString(), {
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${target.pathname}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function httpGetText(
  url: string,
  params?: Record<string, string | number | undefined>,
  headers?: Record<string, string>,
): Promise<string> {
  const settings = getSettings();
  const target = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") target.searchParams.set(k, String(v));
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.httpTimeout * 1000);
  try {
    const res = await fetch(target.toString(), {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${target.pathname}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function httpPostJson<T = unknown>(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const settings = getSettings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.httpTimeout * 1000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
