export type PendingAuthAction =
  | { kind: "add-watch"; symbol?: string }
  | { kind: "create-alert"; type: string; symbol: string };

const KEY = "pro-trader-pending-auth";

export function setPendingAuthAction(action: PendingAuthAction) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(action));
}

export function peekPendingAuthAction(): PendingAuthAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingAuthAction) : null;
  } catch {
    return null;
  }
}

let consumed = false;

export function takePendingAuthAction(): PendingAuthAction | null {
  if (consumed) return null;
  const action = peekPendingAuthAction();
  if (!action) return null;
  consumed = true;
  if (typeof window !== "undefined") sessionStorage.removeItem(KEY);
  return action;
}
