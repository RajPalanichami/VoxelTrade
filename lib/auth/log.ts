type AuthEvent =
  | "AUTH_LOGIN_STARTED"
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILED"
  | "AUTH_LOGOUT"
  | "AUTH_OAUTH_CALLBACK_FAILED"
  | "AUTH_ACCOUNT_LINKED"
  | "AUTH_PASSWORD_RESET";

const SECRET = /password|secret|token|authorization|code|bearer|service.role/i;

export function logAuth(event: AuthEvent, details: Record<string, unknown> = {}): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SECRET.test(key)) continue;
    if (typeof value === "string" && SECRET.test(value)) continue;
    safe[key] = value;
  }
  if (event.endsWith("_FAILED")) {
    console.warn(`[auth] ${event}`, safe);
    return;
  }
  console.info(`[auth] ${event}`, safe);
}
