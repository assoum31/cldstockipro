import { createBrowserClient } from "@supabase/ssr";

// Client Supabase côté navigateur (Client Components uniquement).
// Utilise l'anon key : toute requête passe par RLS normalement.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
