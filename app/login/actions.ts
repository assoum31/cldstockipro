"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildSyntheticEmail, verifyPin } from "@/lib/auth-helpers";

type LookupResult =
  | { ok: true; status: "needs_activation" | "has_password"; email: string }
  | { ok: false; error: string };

// Étape 1 du login : code du magasin + username. On renvoie toujours
// la même erreur générique en cas d'échec, pour ne jamais laisser
// deviner si un compte/tenant existe (énumération).
export async function lookupAccount(formData: FormData): Promise<LookupResult> {
  const tenantCode = String(formData.get("tenant_code") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const genericError = { ok: false as const, error: "بيانات الدخول غير صحيحة." };

  if (!tenantCode || !username) return genericError;

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, is_active")
    .eq("code", tenantCode)
    .maybeSingle();

  if (!tenant || !tenant.is_active) return genericError;

  const { data: appUser } = await admin
    .from("app_users")
    .select("activated_at, is_active")
    .eq("tenant_id", tenant.id)
    .ilike("username", username)
    .maybeSingle();

  // Compte désactivé : même message générique que "n'existe pas" —
  // on ne révèle jamais qu'un username précis a été bloqué.
  if (!appUser || !appUser.is_active) return genericError;

  return {
    ok: true,
    status: appUser.activated_at ? "has_password" : "needs_activation",
    email: buildSyntheticEmail(tenantCode, username),
  };
}

type ActivateResult = { ok: true } | { ok: false; error: string };

// Étape 2 (Première Connexion) : échange le PIN contre un vrai mot
// de passe Supabase Auth. Après un ok, le formulaire client doit
// encore appeler signInWithPassword(email, newPassword) — cette
// action valide et fixe le mot de passe, elle n'ouvre pas la session.
export async function activateAccount(formData: FormData): Promise<ActivateResult> {
  const tenantCode = String(formData.get("tenant_code") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const newPassword = String(formData.get("new_password") ?? "");
  const genericError = {
    ok: false as const,
    error: "رمز غير صالح أو منتهي الصلاحية.",
  };

  if (newPassword.length < 8) {
    return { ok: false, error: "كلمة السر يجب أن تحتوي على 8 خانات على الأقل." };
  }

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .eq("code", tenantCode)
    .maybeSingle();

  if (!tenant) return genericError;

  const { data: appUser } = await admin
    .from("app_users")
    .select("id, activation_code_hash, activation_expires_at, activated_at")
    .eq("tenant_id", tenant.id)
    .ilike("username", username)
    .maybeSingle();

  if (
    !appUser ||
    appUser.activated_at ||
    !appUser.activation_code_hash ||
    !appUser.activation_expires_at ||
    new Date(appUser.activation_expires_at) < new Date()
  ) {
    return genericError;
  }

  const pinValid = await verifyPin(pin, appUser.activation_code_hash);
  if (!pinValid) return genericError;

  const { error: updateAuthError } = await admin.auth.admin.updateUserById(
    appUser.id,
    { password: newPassword }
  );
  if (updateAuthError) return { ok: false, error: "فشل تحديث كلمة السر." };

  const { error: updateProfileError } = await admin
    .from("app_users")
    .update({
      activated_at: new Date().toISOString(),
      activation_code_hash: null,
      activation_expires_at: null,
    })
    .eq("id", appUser.id);

  if (updateProfileError) return { ok: false, error: "فشل تفعيل الحساب." };

  return { ok: true };
}
