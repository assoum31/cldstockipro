"use client";

import { useEffect, useState } from "react";
import {
  listTenants,
  createTenant,
  setTenantActive,
  getTenantStats,
  type TenantRow,
  type TenantStats,
} from "./actions";
import { LogoutButton } from "@/components/logout-button";

export default function AdminPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [stats, setStats] = useState<Record<string, TenantStats>>({});

  async function refresh() {
    const result = await listTenants();
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setTenants(result.data);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    const result = await createTenant(newName);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setNotice(`تم إنشاء المتجر — الرمز: ${result.data.code} (سلّمه للمدير)`);
    setNewName("");
    refresh();
  }

  async function handleToggleActive(tenant: TenantRow) {
    const result = await setTenantActive(tenant.id, !tenant.is_active);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    refresh();
  }

  async function handleLoadStats(tenantId: string) {
    const result = await getTenantStats(tenantId);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setStats((prev) => ({ ...prev, [tenantId]: result.data }));
  }

  return (
    <main dir="rtl" className="min-h-dvh p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">إدارة المتاجر (Master Admin)</h1>
        <LogoutButton />
      </div>

      {notice && (
        <p className="text-sm bg-neutral-100 border rounded-lg p-2">{notice}</p>
      )}

      <section className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="اسم المتجر الجديد"
          className="flex-1 border rounded-lg p-2 text-sm"
        />
        <button
          onClick={handleCreate}
          className="px-3 py-2 rounded-lg bg-black text-white text-sm"
        >
          إنشاء متجر
        </button>
      </section>

      <ul className="space-y-2">
        {tenants.map((tenant) => (
          <li key={tenant.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">{tenant.name}</p>
                <p className="text-xs text-gray-500">رمز: {tenant.code}</p>
              </div>
              <button
                onClick={() => handleToggleActive(tenant)}
                className={`px-3 py-1 rounded-lg text-xs border ${
                  tenant.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {tenant.is_active ? "نشط" : "موقوف"}
              </button>
            </div>

            {stats[tenant.id] ? (
              <p className="text-xs text-gray-600">
                منتجات: {stats[tenant.id].products_count} · جلسات نشطة:{" "}
                {stats[tenant.id].active_sessions_count} · سجلات: {stats[tenant.id].logs_count}
              </p>
            ) : (
              <button
                onClick={() => handleLoadStats(tenant.id)}
                className="text-xs underline text-gray-500"
              >
                عرض الإحصائيات
              </button>
            )}
          </li>
        ))}
        {tenants.length === 0 && (
          <p className="text-sm text-gray-500 text-center">لا توجد متاجر بعد.</p>
        )}
      </ul>
    </main>
  );
}
