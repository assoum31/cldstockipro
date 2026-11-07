"use client";

import { useEffect, useState } from "react";
import {
  createWorker,
  listWorkers,
  regeneratePin,
  setWorkerActive,
  type WorkerRow,
} from "./actions";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastPin, setLastPin] = useState<{ username: string; pin: string } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    const result = await listWorkers();
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setWorkers(result.workers);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(formData: FormData) {
    setSubmitting(true);
    setNotice(null);
    setLastPin(null);

    const result = await createWorker(formData);
    setSubmitting(false);

    if (!result.ok) {
      setNotice(result.error);
      return;
    }

    setLastPin({ username: result.username, pin: result.pin });
    refresh();
  }

  async function handleRegeneratePin(worker: WorkerRow) {
    setNotice(null);
    const result = await regeneratePin(worker.id);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setLastPin({ username: worker.username, pin: result.pin });
    refresh();
  }

  async function handleToggleActive(worker: WorkerRow) {
    setNotice(null);
    const result = await setWorkerActive(worker.id, !worker.is_active);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    refresh();
  }

  return (
    <main dir="rtl" className="min-h-dvh p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold">العمال (Workers)</h1>

      {notice && (
        <p className="text-sm bg-neutral-100 border rounded-lg p-2">{notice}</p>
      )}

      {/* Le PIN n'est affiché qu'ici, une seule fois, juste après la
          création — il n'est jamais récupérable ensuite (il n'est pas
          stocké en clair côté serveur). */}
      {lastPin && (
        <div className="bg-amber-100 border border-amber-400 rounded-lg p-3 text-sm space-y-1">
          <p className="font-bold">
            تم إنشاء الحساب: {lastPin.username}
          </p>
          <p>
            رمز التفعيل (PIN):{" "}
            <span className="font-mono text-lg tracking-widest">{lastPin.pin}</span>
          </p>
          <p className="text-amber-700">
            سلّم هذا الرمز للعامل الآن — لن يظهر مرة أخرى.
          </p>
        </div>
      )}

      <form action={handleCreate} className="space-y-3 border rounded-lg p-3">
        <h2 className="font-bold text-sm">إضافة عامل جديد</h2>
        <input
          name="username"
          placeholder="اسم المستخدم (حروف/أرقام لاتينية)"
          required
          className="w-full border rounded-lg p-2 text-sm"
        />
        <input
          name="full_name"
          placeholder="الاسم الكامل"
          required
          className="w-full border rounded-lg p-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg p-2 bg-black text-white text-sm disabled:opacity-50"
        >
          {submitting ? "..." : "إنشاء"}
        </button>
      </form>

      <ul className="space-y-2">
        {workers.map((worker) => (
          <li key={worker.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">{worker.full_name}</p>
                <p className="text-xs text-gray-500">@{worker.username}</p>
              </div>
              <div className="flex gap-1">
                {!worker.is_active && (
                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                    معطل
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    worker.activated_at
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {worker.activated_at ? "مفعّل" : "بانتظار التفعيل"}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleRegeneratePin(worker)}
                className="text-xs px-2 py-1 rounded-lg border"
              >
                توليد رمز جديد
              </button>
              <button
                onClick={() => handleToggleActive(worker)}
                className={`text-xs px-2 py-1 rounded-lg border ${
                  worker.is_active ? "text-red-600" : "text-green-600"
                }`}
              >
                {worker.is_active ? "تعطيل الحساب" : "إعادة التفعيل"}
              </button>
            </div>
          </li>
        ))}
        {workers.length === 0 && (
          <p className="text-sm text-gray-500 text-center">لا يوجد عمال بعد.</p>
        )}
      </ul>
    </main>
  );
}
