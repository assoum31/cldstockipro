"use server";

import { createClient } from "@/lib/supabase/server";

type ActiveSession = { id: string; title: string };

// Il ne peut y avoir qu'UNE session 'active' par tenant (contrainte
// DB inventory_sessions_one_active_per_tenant) : pas d'ambiguïté ici.
export async function getActiveSession(): Promise<
  { ok: true; session: ActiveSession | null } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_sessions")
    .select("id, title")
    .eq("status", "active")
    .maybeSingle();

  if (error) return { ok: false, error: "تعذر تحميل جلسة الجرد." };
  return { ok: true, session: data };
}

type ExistingLog = {
  id: string;
  counted_quantity: number;
  location: string;
  counted_by_name: string;
  counted_at: string;
  counted_by: string | null;
};

type LookupResult =
  | {
      ok: true;
      found: boolean;
      productId: string | null;
      productName: string | null;
      defaultLocation: string | null;
      existingLog: ExistingLog | null;
    }
  | { ok: false; error: string };

// Appelée à chaque scan. RLS filtre déjà par tenant_id — aucun filtre
// manuel nécessaire ici, products/inventory_logs ne renvoient que les
// lignes du tenant de l'utilisateur connecté.
export async function lookupBarcode(
  barcode: string,
  sessionId: string
): Promise<LookupResult> {
  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, default_location")
    .eq("barcode", barcode)
    .maybeSingle();

  if (productError) return { ok: false, error: "خطأ أثناء البحث عن المنتج." };

  // "Déjà loggé pendant le cycle en cours" = scoped à la session
  // active, pas à tout l'historique du produit (sinon un inventaire
  // de janvier "pollue" celui de février sur le même article).
  const { data: existingLog, error: logError } = await supabase
    .from("inventory_logs")
    .select("id, counted_quantity, location, counted_by_name, counted_at, counted_by")
    .eq("barcode", barcode)
    .eq("session_id", sessionId)
    .order("counted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (logError) return { ok: false, error: "خطأ أثناء التحقق من التكرار." };

  return {
    ok: true,
    found: Boolean(product),
    productId: product?.id ?? null,
    productName: product?.name ?? null,
    defaultLocation: product?.default_location ?? null,
    existingLog: existingLog ?? null,
  };
}

type SubmitResult = { ok: true } | { ok: false; error: string };

// mode "create"      -> nouvelle ligne (premier scan, ou "إضافة كسطر
//                        جديد" choisi explicitement sur un doublon).
// mode "update"      -> corrige la ligne existante (logId requis) ;
//                        couvert par la policy RLS logs_owner_update
//                        (uniquement si counted_by = l'utilisateur
//                        courant — sinon RLS refuse silencieusement
//                        et 0 ligne n'est modifiée).
export async function submitCount(input: {
  mode: "create" | "update";
  logId?: string;
  sessionId: string;
  productId: string | null;
  barcode: string;
  productName: string;
  countedQuantity: number;
  location: string;
}): Promise<SubmitResult> {
  if (!Number.isFinite(input.countedQuantity) || input.countedQuantity < 0) {
    return { ok: false, error: "الكمية غير صالحة." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "غير مصرح به." };

  // tenant_id et le nom de l'auditeur viennent du serveur (JWT +
  // profil), jamais du client : empêche un client modifié de se
  // faire passer pour un autre tenant ou un autre nom.
  const tenantId = (user.app_metadata as { tenant_id?: string } | undefined)
    ?.tenant_id;
  if (!tenantId) return { ok: false, error: "لا يوجد متجر مرتبط بهذا الحساب." };

  const { data: profile } = await supabase
    .from("app_users")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const countedByName = profile?.full_name ?? "مستخدم";

  if (input.mode === "update") {
    if (!input.logId) return { ok: false, error: "معرّف السطر مفقود." };

    const { error, count } = await supabase
      .from("inventory_logs")
      .update(
        {
          counted_quantity: input.countedQuantity,
          location: input.location,
        },
        { count: "exact" }
      )
      .eq("id", input.logId);

    if (error) return { ok: false, error: "فشل تحديث السطر." };
    if (count === 0) {
      return { ok: false, error: "لا يمكنك تعديل سطر مسجّل من طرف شخص آخر." };
    }
    return { ok: true };
  }

  const { error } = await supabase.from("inventory_logs").insert({
    tenant_id: tenantId,
    session_id: input.sessionId,
    product_id: input.productId,
    barcode: input.barcode,
    product_name: input.productName,
    counted_quantity: input.countedQuantity,
    location: input.location || "غير محدد",
    counted_by_name: countedByName,
    counted_by: user.id,
  });

  if (error) return { ok: false, error: "فشل تسجيل السطر." };
  return { ok: true };
}
