export function mapAuthError(message: string | null | undefined, fallback = "Unable to complete sign-in. Please try again."): string {
  const raw = (message || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return fallback;
  if (lower.includes("popup") && lower.includes("closed")) return "Sign-in was cancelled.";
  if (lower.includes("access_denied") || lower.includes("user denied") || lower.includes("cancelled")) {
    return "Sign-in was cancelled.";
  }
  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return "Please confirm your email address before signing in. Check your inbox for the confirmation link.";
  }
  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("user already registered") || lower.includes("already registered")) {
    return "An account with this email already exists. Sign in instead, or use the same provider you used originally.";
  }
  if (lower.includes("already linked") || lower.includes("identity is already")) {
    return "That provider account is already linked to a user.";
  }
  if (lower.includes("manual linking") || lower.includes("multiple accounts")) {
    return "This identity belongs to another account. Sign in with that method, then link providers from a signed-in session.";
  }
  if (lower.includes("provider is not enabled") || lower.includes("unsupported provider") || lower.includes("validation failed")) {
    return "This sign-in method is not enabled. Check the Supabase provider configuration.";
  }
  if (lower.includes("instagram") && (lower.includes("not") || lower.includes("disabled") || lower.includes("unsupported"))) {
    return "Instagram sign-in is not enabled. Configure the custom Instagram OAuth provider in the Supabase dashboard.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }
  if (lower.includes("expired") || lower.includes("otp_expired")) {
    return "This link or session has expired. Please try again.";
  }
  if (raw.length > 180 || /service.role|secret|token|bearer /i.test(raw)) {
    return fallback;
  }
  return raw;
}

export function mapOAuthCallbackError(error: string | null, description: string | null): string {
  const code = (error || "").toLowerCase();
  if (code === "access_denied") return "Sign-in was cancelled.";
  if (code === "server_error" || code === "temporarily_unavailable") {
    return "The sign-in provider is temporarily unavailable. Please try again.";
  }
  return mapAuthError(description || error, "Unable to complete sign-in. Please try again.");
}
