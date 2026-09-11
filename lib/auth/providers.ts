import type { Provider } from "@supabase/supabase-js";
import { config } from "@/lib/config";

export type SocialProviderId = "google" | "facebook" | "instagram" | "x";

export type SocialProvider = {
  id: SocialProviderId;
  label: string;
  /** Value passed to supabase.auth.signInWithOAuth / linkIdentity */
  supabaseProvider: Provider;
  native: boolean;
};

function instagramProviderId(): Provider {
  const raw = config.instagramProvider.trim();
  if (raw.startsWith("custom:")) return raw as Provider;
  return "custom:instagram";
}

/**
 * Native Supabase providers plus Instagram via Custom OAuth (`custom:instagram`).
 * Instagram is not a built-in GoTrue provider. See docs/authentication.md.
 */
export function socialProviders(): SocialProvider[] {
  return [
    { id: "google", label: "Continue with Google", supabaseProvider: "google", native: true },
    { id: "facebook", label: "Continue with Facebook", supabaseProvider: "facebook", native: true },
    { id: "instagram", label: "Continue with Instagram", supabaseProvider: instagramProviderId(), native: false },
    { id: "x", label: "Continue with X", supabaseProvider: "x", native: true },
  ];
}

export function isSocialProviderId(value: string): value is SocialProviderId {
  return value === "google" || value === "facebook" || value === "instagram" || value === "x";
}
