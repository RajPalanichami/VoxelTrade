import { createBrowserClient } from "@supabase/ssr";
import { config, isSupabaseConfigured as configured } from "./config";

export function isSupabaseConfigured() {
  return configured();
}

export function createSupabaseBrowser() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  return createBrowserClient(config.supabaseUrl, config.supabaseAnonKey);
}
