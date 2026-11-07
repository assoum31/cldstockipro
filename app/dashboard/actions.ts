"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "غير مصرح به." };

  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  const tenantId = (user.app_metadata as { tenant_id?: string } | undefined)
    ?.tenant_id;

  if (role !== "admin" && role !== "master") {
    return { ok: false as const, error: "صلاحيات غير كافية." };
  }
  if (!tenantId) {
    return { ok: false as const, error: "لا يوجد متجر مرتبط بهذا الحساب." };
  }
  return { ok: true as const, supabase, tenantId };
}

// ---------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------

export async function listSessions(): Promise<
  ActionResult<{ id: string; title: string; status: string; locked_at: string | null }[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_sessions")
    .select("id, title, status, locked_at")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: "تعذر تحميل الجلسات." };
  return { ok: true, data: data ?? [] };
}

// Crée une nouvelle session active. L'index unique DB
// (inventory_sessions_one_active_per_tenant) refuse silencieusement
// une 2e session active : on traduit cette violation en message clair.
export async function createSession(title: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { error } = await auth.supabase.from("inventory_sessions").insert({
    tenant_id: auth.tenantId,
    title: title || "جرد بدون عنوان",
    status: "active",
  });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "توجد جلسة نشطة بالفعل. أنهِ أو أرشف الجلسة الحالية أولاً."
        : "فشل إنشاء الجلسة.",
    };
  }
  return { ok: true };
}

// Verrouille la session : fige la quantité système de chaque produit
// du tenant dans inventory_session_snapshots. Après ça, l'Écart ne
// bouge plus si le POS met à jour products.system_quantity pendant
// que l'inventaire est en cours.
//
// Écrit via le client service_role car la policy RLS sur
// inventory_session_snapshots ne donne AUCUN droit d'écriture à
// "authenticated" (voir migration v1.2) — c'est volontaire, le
// verrouillage est un geste sensible qu'on ne veut pas exposer via
// une policy RLS généraliste. Le rôle est vérifié juste avant via
// requireAdmin(), avec le client de SESSION.
export async function lockSession(sessionId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { data: session, error: sessionError } = await auth.supabase
    .from("inventory_sessions")
    .select("id, status, locked_at")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) return { ok: false, error: "الجلسة غير موجودة." };
  if (session.status !== "active") {
    return { ok: false, error: "لا يمكن قفل جلسة غير نشطة." };
  }
  if (session.locked_at) {
    return { ok: false, error: "الجلسة مقفلة بالفعل." };
  }

  const admin = createAdminClient();

  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id, system_quantity")
    .eq("tenant_id", auth.tenantId);

  if (productsError) return { ok: false, error: "فشل قراءة المنتجات." };

  const snapshotRows = (products ?? []).map((p) => ({
    session_id: sessionId,
    product_id: p.id,
    tenant_id: auth.tenantId,
    system_quantity_at_start: p.system_quantity,
  }));

  if (snapshotRows.length > 0) {
    // Upsert par lots de 500 : évite une seule requête géante sur un
    // grand catalogue, et rend l'opération ré-exécutable sans erreur.
    const CHUNK = 500;
    for (let i = 0; i < snapshotRows.length; i += CHUNK) {
      const { error: insertError } = await admin
        .from("inventory_session_snapshots")
        .upsert(snapshotRows.slice(i, i + CHUNK), {
          onConflict: "session_id,product_id",
        });
      if (insertError) return { ok: false, error: "فشل تسجيل لقطة المخزون." };
    }
  }

  const { error: lockError } = await admin
    .from("inventory_sessions")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (lockError) return { ok: false, error: "فشل قفل الجلسة." };
  return { ok: true };
}

export async function completeSession(sessionId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { error } = await auth.supabase
    .from("inventory_sessions")
    .update({ status: "completed" })
    .eq("id", sessionId);

  if (error) return { ok: false, error: "فشل إنهاء الجلسة." };
  return { ok: true };
}

// ---------------------------------------------------------------------
// Écart (via la vue inventory_discrepancies — RLS appliquée via
// security_invoker, donc ce select ne voit que le tenant courant).
// ---------------------------------------------------------------------

export type DiscrepancyRow = {
  product_id: string | null;
  barcode: string;
  product_name: string;
  counted_quantity: number;
  system_quantity: number;
  ecart: number;
};

export async function getDiscrepancies(
  sessionId: string
): Promise<ActionResult<DiscrepancyRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_discrepancies")
    .select("product_id, barcode, product_name, counted_quantity, system_quantity, ecart")
    .eq("session_id", sessionId)
    .order("ecart", { ascending: true });

  if (error) return { ok: false, error: "تعذر تحميل الفوارق." };
  return { ok: true, data: data ?? [] };
}

// ---------------------------------------------------------------------
// Import Excel — upsert en masse des produits (admin/master).
// ---------------------------------------------------------------------

export type ProductImportRow = {
  barcode: string;
  name: string;
  category: string | null;
  default_location: string | null;
  system_quantity: number;
  purchase_price: number;
  sale_price: number;
};

export async function bulkUpsertProducts(
  rows: ProductImportRow[]
): Promise<ActionResult<{ inserted: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const cleanRows = rows
    .filter((r) => r.barcode && r.barcode.trim().length > 0)
    .map((r) => ({
      tenant_id: auth.tenantId,
      barcode: r.barcode.trim(),
      name: r.name?.trim() || "منتج بدون اسم",
      category: r.category?.trim() || null,
      default_location: r.default_location?.trim() || "غير محدد",
      system_quantity: Number.isFinite(r.system_quantity) ? r.system_quantity : 0,
      purchase_price: Number.isFinite(r.purchase_price) ? r.purchase_price : 0,
      sale_price: Number.isFinite(r.sale_price) ? r.sale_price : 0,
    }));

  if (cleanRows.length === 0) {
    return { ok: false, error: "لا توجد أسطر صالحة للاستيراد." };
  }

  // RLS (products_tenant_isolation) vérifie tenant_id à chaque ligne
  // via WITH CHECK — on utilise le client de SESSION, pas l'admin,
  // pour que cette vérification reste active pendant l'upsert.
  const CHUNK = 500;
  for (let i = 0; i < cleanRows.length; i += CHUNK) {
    const { error } = await auth.supabase
      .from("products")
      .upsert(cleanRows.slice(i, i + CHUNK), { onConflict: "tenant_id,barcode" });
    if (error) return { ok: false, error: "فشل استيراد بعض الأسطر." };
  }

  return { ok: true, data: { inserted: cleanRows.length } };
}

// ---------------------------------------------------------------------
// Export audit — renvoie les logs filtrés, l'écriture du fichier
// xlsx se fait côté client (lib/excel.ts) pour ne pas transiter un
// gros binaire par le serveur.
// ---------------------------------------------------------------------

export async function getSessionLogsForExport(sessionId: string): Promise<
  ActionResult<
    {
      barcode: string;
      product_name: string;
      counted_quantity: number;
      location: string;
      counted_by_name: string;
      counted_at: string;
    }[]
  >
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_logs")
    .select("barcode, product_name, counted_quantity, location, counted_by_name, counted_at")
    .eq("session_id", sessionId)
    .order("counted_at", { ascending: true });

  if (error) return { ok: false, error: "تعذر تحميل السجلات للتصدير." };
  return { ok: true, data: data ?? [] };
}
