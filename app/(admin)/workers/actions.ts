"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildSyntheticEmail,
  generatePin,
  hashPin,
  generateServerSidePlaceholderPassword,
} from "@/lib/auth-helpers";

type CreateWorkerResult =
  | { ok: true; pin: string; username: string }
  | { ok: false; error: string };

export type WorkerRow = {
  id: string;
  username: string;
  full_name: string;
  activated_at: string | null;
  is_active: boolean;
};

type SimpleResult = { ok: true } | { ok: false; error: string };

// Vérifie le rôle (admin/master) ET que le worker ciblé appartient
// bien au tenant de l'appelant, via le client de SESSION (RLS
// tranche réellement, pas juste une vérification en mémoire).
async function requireAdminForWorker(workerId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "غير مصرح به." };

  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  if (role !== "admin" && role !== "master") {
    return { ok: false as const, error: "صلاحيات غير كافية." };
  }

  // RLS (app_users_tenant_rw) ne renverra cette ligne que si le
  // worker appartient au tenant de l'appelant (ou si l'appelant est
  // master) — un admin d'un autre tenant obtient simplement 0 ligne.
  const { data: worker, error } = await supabase
    .from("app_users")
    .select("id, tenant_id, role")
    .eq("id", workerId)
    .maybeSingle();

  if (error || !worker) return { ok: false as const, error: "العامل غير موجود." };
  if (worker.role !== "auditor") {
    return { ok: false as const, error: "لا يمكن تعديل هذا النوع من الحسابات هنا." };
  }

  return { ok: true as const, supabase };
}

type ListWorkersResult =
  | { ok: true; workers: WorkerRow[] }
  | { ok: false; error: string };

// Liste les workers du tenant de l'admin courant. RLS
// (app_users_tenant_rw) filtre déjà par tenant_id — aucun filtre
// manuel nécessaire ici, un admin ne peut de toute façon pas voir
// les workers d'un autre tenant.
export async function listWorkers(): Promise<ListWorkersResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, username, full_name, activated_at, is_active")
    .eq("role", "auditor")
    .order("full_name", { ascending: true });

  if (error) return { ok: false, error: "تعذر تحميل العمال." };
  return { ok: true, workers: data ?? [] };
}

// Crée un worker (role 'auditor') pour le tenant de l'admin courant.
// Étape 1 : on vérifie le rôle via le client lié à la SESSION (RLS
// tranche), pas directement via le service role — on ne fait
// confiance au service role qu'une fois l'autorisation confirmée.
export async function createWorker(formData: FormData): Promise<CreateWorkerResult> {
  const username = String(formData.get("username") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!username || !fullName) {
    return { ok: false, error: "اسم المستخدم والاسم الكامل مطلوبان." };
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return {
      ok: false,
      error: "اسم المستخدم يجب أن يحتوي على حروف/أرقام فقط (3 إلى 32 خانة).",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "غير مصرح به." };

  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  const tenantId = (user.app_metadata as { tenant_id?: string } | undefined)
    ?.tenant_id;

  if (role !== "admin" && role !== "master") {
    return { ok: false, error: "صلاحيات غير كافية." };
  }
  if (!tenantId) {
    return { ok: false, error: "لا يوجد متجر مرتبط بهذا الحساب." };
  }

  // Lecture du code du tenant via le client de SESSION : RLS laisse
  // l'admin lire la ligne de son propre tenant (tenants_self_select).
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("code")
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) {
    return { ok: false, error: "تعذر العثور على المتجر." };
  }

  const admin = createAdminClient();
  const email = buildSyntheticEmail(tenant.code, username);
  const pin = generatePin();
  const pinHash = await hashPin(pin);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: generateServerSidePlaceholderPassword(),
    app_metadata: { tenant_id: tenantId, role: "auditor" },
  });

  if (createError || !created.user) {
    return {
      ok: false,
      error:
        createError?.message === "User already registered"
          ? "اسم المستخدم مستعمل من قبل في هذا المتجر."
          : "فشل إنشاء الحساب.",
    };
  }

  const { error: profileError } = await admin.from("app_users").insert({
    id: created.user.id,
    tenant_id: tenantId,
    username,
    full_name: fullName,
    role: "auditor",
    activation_code_hash: pinHash,
    activation_expires_at: new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString(),
  });

  if (profileError) {
    // Compte Auth orphelin si l'insert échoue : on le supprime pour
    // ne pas laisser un username "pris" sans profil utilisable.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "فشل حفظ الملف الشخصي." };
  }

  // Le PIN n'est jamais stocké en clair ; il n'est renvoyé qu'ici,
  // une seule fois — à transmettre au worker de la main à la main.
  return { ok: true, pin, username };
}

type RegeneratePinResult =
  | { ok: true; pin: string }
  | { ok: false; error: string };

// PIN perdu avant la première activation, OU worker qui a oublié son
// mot de passe : dans les deux cas, on régénère un PIN et on force
// une nouvelle "Première Connexion" (activated_at remis à null).
export async function regeneratePin(workerId: string): Promise<RegeneratePinResult> {
  const auth = await requireAdminForWorker(workerId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const pin = generatePin();
  const pinHash = await hashPin(pin);

  const { error } = await admin
    .from("app_users")
    .update({
      activation_code_hash: pinHash,
      activation_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      activated_at: null,
    })
    .eq("id", workerId);

  if (error) return { ok: false, error: "فشل توليد رمز جديد." };
  return { ok: true, pin };
}

// Désactive/réactive un worker. Deux niveaux, volontairement :
// - is_active (app_users) : affichage + refus rapide dès lookupAccount
// - ban Supabase Auth : bloque VRAIMENT signInWithPassword, même si
//   quelqu'un contournait lookupAccount. Défense en profondeur, comme
//   pour les policies RLS plus haut dans le projet.
export async function setWorkerActive(
  workerId: string,
  isActive: boolean
): Promise<SimpleResult> {
  const auth = await requireAdminForWorker(workerId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { error: banError } = await admin.auth.admin.updateUserById(workerId, {
    ban_duration: isActive ? "none" : "876000h", // "none" lève le ban ; ~100 ans = permanent en pratique
  });
  if (banError) return { ok: false, error: "فشل تحديث حالة الحساب." };

  const { error: profileError } = await admin
    .from("app_users")
    .update({ is_active: isActive })
    .eq("id", workerId);
  if (profileError) return { ok: false, error: "فشل تحديث الملف الشخصي." };

  return { ok: true };
}
