/**
 * Explicit linking only. Never merge identities on an unverified email.
 * When a session already exists, OAuth buttons call linkIdentity().
 */
export function oauthIntent(hasSession: boolean): "link" | "sign-in" {
  return hasSession ? "link" : "sign-in";
}
