import { describe, expect, it } from "vitest";
import { oauthIntent } from "@/lib/auth/account-linking";
import { mapAuthError, mapOAuthCallbackError } from "@/lib/auth/errors";
import { isSocialProviderId, socialProviders } from "@/lib/auth/providers";
import { safeInternalPath } from "@/lib/auth/redirects";

describe("auth redirects", () => {
  it("allows same-origin relative paths", () => {
    expect(safeInternalPath("/signals")).toBe("/signals");
    expect(safeInternalPath("/login?x=1")).toBe("/login?x=1");
  });

  it("rejects open redirects", () => {
    expect(safeInternalPath("https://evil.test")).toBe("/");
    expect(safeInternalPath("//evil.test")).toBe("/");
    expect(safeInternalPath("\\/evil.test")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
    expect(safeInternalPath(null)).toBe("/");
  });
});

describe("auth providers", () => {
  it("exposes Google, Facebook, Instagram, and X", () => {
    const ids = socialProviders().map((p) => p.id);
    expect(ids).toEqual(["google", "facebook", "instagram", "x"]);
    expect(socialProviders().find((p) => p.id === "google")?.supabaseProvider).toBe("google");
    expect(socialProviders().find((p) => p.id === "facebook")?.supabaseProvider).toBe("facebook");
    expect(socialProviders().find((p) => p.id === "x")?.supabaseProvider).toBe("x");
    expect(socialProviders().find((p) => p.id === "instagram")?.supabaseProvider).toBe("custom:instagram");
    expect(socialProviders().find((p) => p.id === "instagram")?.native).toBe(false);
  });

  it("validates social provider ids", () => {
    expect(isSocialProviderId("google")).toBe(true);
    expect(isSocialProviderId("twitter")).toBe(false);
  });
});

describe("auth errors", () => {
  it("maps common Supabase failures to user-facing copy", () => {
    expect(mapAuthError("Invalid login credentials")).toMatch(/Incorrect email or password/i);
    expect(mapAuthError("Email not confirmed")).toMatch(/confirm your email/i);
    expect(mapAuthError("User already registered")).toMatch(/already exists/i);
    expect(mapAuthError("access_denied")).toMatch(/cancelled/i);
    expect(mapAuthError("provider is not enabled")).toMatch(/not enabled/i);
  });

  it("does not echo secrets", () => {
    expect(mapAuthError("service_role key leaked")).toBe("Unable to complete sign-in. Please try again.");
  });

  it("links providers only from an authenticated session", () => {
    expect(oauthIntent(false)).toBe("sign-in");
    expect(oauthIntent(true)).toBe("link");
  });

  it("maps OAuth callback cancellations", () => {
    expect(mapOAuthCallbackError("access_denied", "The user denied your request")).toMatch(/cancelled/i);
  });
});
