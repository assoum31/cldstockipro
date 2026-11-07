import { createBrowserClient } from "@supabase/ssr";

// Client Supabase côté navigateur (Client Components uniquement).
// Utilise l'anon key : toute requête passe par RLS normalement.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
  return createBrowserClient(url, anonKey);
}
