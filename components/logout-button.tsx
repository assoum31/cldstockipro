"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    // Le middleware se charge de rediriger vers /login au prochain
    // rendu puisqu'il n'y aura plus de session — refresh() suffit.
    router.refresh();
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={className ?? "text-sm underline disabled:opacity-50"}
    >
      {loading ? "..." : "تسجيل الخروج"}
    </button>
  );
}
