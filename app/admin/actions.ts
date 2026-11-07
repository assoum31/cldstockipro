"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

// Toutes ces actions passent par le client de SESSION (jamais
// l'admin client) : c'est la policy RLS tenants_master_all
// (private.is_master()) qui autorise ou refuse, pas un bypass.
async function requireMaster() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "غير مصرح به." };

  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  if (role !== "master") return { ok: false as const, error: "صلاحيات غير كافية." };

  return { ok: true as const, supabase };
}

export type TenantRow = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
};

export async function listTenants(): Promise<ActionResult<TenantRow[]>> {
  const auth = await requireMaster();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase
    .from("tenants")
    .select("id, name, code, is_active, created_at")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: "تعذر تحميل المتاجر." };
  return { ok: true, data: data ?? [] };
}

function generateTenantCode(): string {
  // 6 caractères alphanumériques majuscules — assez court pour être
  // tapé à la main sur /login, assez grand pour éviter les collisions
  // fréquentes (36^6 ≈ 2 milliards de combinaisons).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I/O/0/1 ambigus
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function createTenant(
  name: string
): Promise<ActionResult<{ code: string }>> {
  const auth = await requireMaster();
  if (!auth.ok) return auth;

  if (!name.trim()) return { ok: false, error: "اسم المتجر مطلوب." };

  // Quelques essais en cas de collision improbable sur `code`
  // (contrainte UNIQUE en base) plutôt qu'une génération plus longue
  // systématique — la collision est rare, pas la norme.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateTenantCode();
    const { error } = await auth.supabase.from("tenants").insert({
      name: name.trim(),
      code,
      is_active: true,
    });

    if (!error) return { ok: true, data: { code } };
    if (error.code !== "23505") return { ok: false, error: "فشل إنشاء المتجر." };
  }

  return { ok: false, error: "فشل إنشاء رمز فريد للمتجر، أعد المحاولة." };
}

export async function setTenantActive(
  tenantId: string,
  isActive: boolean
): Promise<ActionResult> {
  const auth = await requireMaster();
  if (!auth.ok) return auth;

  const { error } = await auth.supabase
    .from("tenants")
    .update({ is_active: isActive })
    .eq("id", tenantId);

  if (error) return { ok: false, error: "فشل تحديث حالة المتجر." };
  return { ok: true };
}

// Inspection cross-tenant : nombre de produits / sessions / logs par
// tenant, pour un aperçu rapide sans ouvrir chaque magasin un par un.
// Chaque policy RLS concernée (products_tenant_isolation,
// sessions_tenant_isolation, logs_tenant_select) inclut déjà
// `private.is_master()` en plus du filtre tenant_id normal : un
// master voit donc tous les tenants via le client de session, sans
// bypass RLS.
export type TenantStats = {
  tenant_id: string;
  products_count: number;
  active_sessions_count: number;
  logs_count: number;
};

export async function getTenantStats(
  tenantId: string
): Promise<ActionResult<TenantStats>> {
  const auth = await requireMaster();
  if (!auth.ok) return auth;

  const [products, sessions, logs] = await Promise.all([
    auth.supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    auth.supabase
      .from("inventory_sessions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    auth.supabase
      .from("inventory_logs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  if (products.error || sessions.error || logs.error) {
    return { ok: false, error: "تعذر تحميل إحصائيات المتجر." };
  }

  return {
    ok: true,
    data: {
      tenant_id: tenantId,
      products_count: products.count ?? 0,
      active_sessions_count: sessions.count ?? 0,
      logs_count: logs.count ?? 0,
    },
  };
}
