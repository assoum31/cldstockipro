"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lookupAccount, activateAccount } from "./actions";

type Step =
  | { name: "credentials" }
  | { name: "password"; email: string }
  | { name: "activate"; email: string };

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>({ name: "credentials" });
  const [error, setError] = useState<string | null>(null);
  const [tenantCode, setTenantCode] = useState("");
  const [username, setUsername] = useState("");

  function handleLookup(formData: FormData) {
    setError(null);
    const tc = String(formData.get("tenant_code") ?? "");
    const un = String(formData.get("username") ?? "");
    setTenantCode(tc);
    setUsername(un);

    startTransition(async () => {
      const result = await lookupAccount(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStep(
        result.status === "needs_activation"
          ? { name: "activate", email: result.email }
          : { name: "password", email: result.email }
      );
    });
  }

  function handlePasswordLogin(formData: FormData) {
    setError(null);
    const email = step.name === "password" ? step.email : "";
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("بيانات الدخول غير صحيحة.");
        return;
      }
      router.refresh();
    });
  }

  function handleActivate(formData: FormData) {
    setError(null);
    formData.set("tenant_code", tenantCode);
    formData.set("username", username);
    const newPassword = String(formData.get("new_password") ?? "");

    startTransition(async () => {
      const result = await activateAccount(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const email = step.name === "activate" ? step.email : "";
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: newPassword,
      });
      if (signInError) {
        setError("تم التفعيل، لكن فشل تسجيل الدخول تلقائياً. أعد المحاولة.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <main dir="rtl" className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-center">تسجيل الدخول</h1>

        {error && (
          <p className="text-red-600 text-sm text-center" role="alert">
            {error}
          </p>
        )}

        {step.name === "credentials" && (
          <form action={handleLookup} className="space-y-3">
            <input
              name="tenant_code"
              placeholder="رمز المتجر"
              required
              className="w-full border rounded-lg p-3"
            />
            <input
              name="username"
              placeholder="اسم المستخدم"
              required
              className="w-full border rounded-lg p-3"
            />
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg p-3 bg-black text-white disabled:opacity-50"
            >
              متابعة
            </button>
          </form>
        )}

        {step.name === "password" && (
          <form action={handlePasswordLogin} className="space-y-3">
            <input
              name="password"
              type="password"
              placeholder="كلمة السر"
              required
              autoFocus
              className="w-full border rounded-lg p-3"
            />
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg p-3 bg-black text-white disabled:opacity-50"
            >
              دخول
            </button>
          </form>
        )}

        {step.name === "activate" && (
          <form action={handleActivate} className="space-y-3">
            <p className="text-sm text-gray-600">
              هذا أول تسجيل دخول. أدخل الرمز الذي أعطاك إياه المدير، ثم اختر
              كلمة سر جديدة.
            </p>
            <input
              name="pin"
              inputMode="numeric"
              placeholder="الرمز المكوّن من 6 أرقام"
              required
              className="w-full border rounded-lg p-3"
            />
            <input
              name="new_password"
              type="password"
              placeholder="كلمة سر جديدة (8 خانات على الأقل)"
              required
              minLength={8}
              className="w-full border rounded-lg p-3"
            />
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg p-3 bg-black text-white disabled:opacity-50"
            >
              تفعيل الحساب والدخول
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
