import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Client Supabase pour Server Components / Server Actions.
// Utilise les cookies de la requête : respecte RLS avec le rôle réel
// de l'utilisateur connecté. NE REMPLACE PAS le client admin —
// n'importe jamais la service_role ici.
export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appelé depuis un Server Component (lecture seule) :
            // sans effet ici, le middleware rafraîchit déjà la
            // session à chaque requête. Sans danger d'ignorer.
          }
        },
      },
    }
  );
}
