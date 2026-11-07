// The SDK appends /auth/v1 and /rest/v1 itself, so accept a copied
// REST endpoint while always supplying the project root to clients.
export function normalizeSupabaseUrl(value: string | undefined): string {
  const url = value?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  if (!url) throw new Error("Supabase project URL is not configured.");
  return url;
}

export function getSupabaseUrl(): string {
  return normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
