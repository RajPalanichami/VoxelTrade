/**
 * Only same-origin relative paths are allowed after auth.
 * Reject protocol-relative URLs, schemes, and backslash tricks.
 */
export function safeInternalPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  const next = value.trim();
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("\\") || next.includes("://")) return fallback;
  if (/[\s<>]/.test(next)) return fallback;
  return next;
}
