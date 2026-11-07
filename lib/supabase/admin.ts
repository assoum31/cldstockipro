import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client service_role : bypass RLS. À N'IMPORTER QUE depuis du code
// serveur de confiance (server actions admin), jamais depuis un
// fichier "use client", jamais exposé au navigateur.
//
// SUPABASE_SERVICE_ROLE_KEY ne doit JAMAIS porter le préfixe
// NEXT_PUBLIC_ (sinon Next.js l'embarque dans le bundle client).
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante côté serveur.");
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
