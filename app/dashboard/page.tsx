"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listSessions,
  createSession,
  lockSession,
  completeSession,
  getDiscrepancies,
  bulkUpsertProducts,
  getSessionLogsForExport,
  type DiscrepancyRow,
} from "./actions";
import {
  downloadProductTemplate,
  parseProductImportFile,
  downloadAuditExport,
} from "@/lib/excel";
import { LogoutButton } from "@/components/logout-button";

type SessionRow = {
  id: string;
  title: string;
  status: string;
  locked_at: string | null;
};

function EcartBadge({ ecart }: { ecart: number }) {
  if (ecart > 0) {
    return (
      <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
        +{ecart}
      </span>
    );
  }
  if (ecart < 0) {
    return (
      <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
        {ecart}
      </span>
    );
  }
  return (
    <span className="px-2 py-1 rounded-full bg-gray-200 text-gray-700 text-xs font-bold">
      0
    </span>
  );
}

export default function DashboardPage() {
  const supabase = useRef(createClient()).current;

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [rows, setRows] = useState<DiscrepancyRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const refreshSessions = useCallback(async () => {
    const result = await listSessions();
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setSessions(result.data);
    setSelectedSessionId((current) => current ?? result.data[0]?.id ?? null);
  }, []);

  const refreshDiscrepancies = useCallback(async () => {
    if (!selectedSessionId) {
      setRows([]);
      return;
    }
    const result = await getDiscrepancies(selectedSessionId);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setRows(result.data);
  }, [selectedSessionId]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    refreshDiscrepancies();
  }, [refreshDiscrepancies]);

  // Realtime : RLS filtre déjà par tenant_id côté serveur sur le
  // canal postgres_changes, donc aucun filtre manuel nécessaire ici.
  // On se contente de refetch la vue d'écart à chaque mouvement —
  // simple et largement suffisant pour le volume d'un inventaire.
  useEffect(() => {
    const channel = supabase
      .channel("inventory_logs_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_logs" },
        () => {
          refreshDiscrepancies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refreshDiscrepancies]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  async function handleCreateSession() {
    const result = await createSession(newTitle);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setNewTitle("");
    refreshSessions();
  }

  async function handleLock() {
    if (!selectedSessionId) return;
    const result = await lockSession(selectedSessionId);
    setNotice(result.ok ? "تم قفل الجلسة وتسجيل لقطة المخزون ✓" : result.error);
    refreshSessions();
  }

  async function handleComplete() {
    if (!selectedSessionId) return;
    const result = await completeSession(selectedSessionId);
    setNotice(result.ok ? "تم إنهاء الجلسة ✓" : result.error);
    refreshSessions();
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setNotice(null);
    try {
      const parsedRows = await parseProductImportFile(file);
      const result = await bulkUpsertProducts(parsedRows);
      setNotice(
        result.ok
          ? `تم استيراد ${result.data.inserted} سطر ✓`
          : result.error
      );
    } catch {
      setNotice("تعذرت قراءة الملف. تحقق من التنسيق.");
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    if (!selectedSessionId || !selectedSession) return;
    const result = await getSessionLogsForExport(selectedSessionId);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    downloadAuditExport(
      result.data,
      `audit_${selectedSession.title.replace(/\s+/g, "_")}.xlsx`
    );
  }

  return (
    <main dir="rtl" className="min-h-dvh p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">لوحة التحكم</h1>
        <LogoutButton />
      </div>

      {notice && (
        <p className="text-sm bg-neutral-100 border rounded-lg p-2">{notice}</p>
      )}

      <section className="space-y-2">
        <h2 className="font-bold text-sm">الجلسات</h2>
        <div className="flex gap-2 flex-wrap">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSessionId(s.id)}
              className={`px-3 py-2 rounded-lg text-sm border ${
                s.id === selectedSessionId ? "bg-black text-white" : "bg-white"
              }`}
            >
              {s.title} · {s.status}
              {s.locked_at ? " 🔒" : ""}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="عنوان جلسة جديدة"
            className="flex-1 border rounded-lg p-2 text-sm"
          />
          <button
            onClick={handleCreateSession}
            className="px-3 py-2 rounded-lg bg-black text-white text-sm"
          >
            جلسة جديدة
          </button>
        </div>

        {selectedSession && (
          <div className="flex gap-2">
            <button
              onClick={handleLock}
              disabled={Boolean(selectedSession.locked_at)}
              className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40"
            >
              قفل ولقطة المخزون
            </button>
            <button
              onClick={handleComplete}
              disabled={selectedSession.status !== "active"}
              className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40"
            >
              إنهاء الجلسة
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-sm">ملف Excel</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={downloadProductTemplate}
            className="px-3 py-2 rounded-lg border text-sm"
          >
            تحميل نموذج فارغ
          </button>
          <label className="px-3 py-2 rounded-lg border text-sm cursor-pointer">
            {importing ? "جاري الاستيراد..." : "استيراد منتجات"}
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={handleExport}
            disabled={!selectedSessionId}
            className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40"
          >
            تصدير سجل الجرد
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-sm">الفوارق (Écart)</h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100">
              <tr>
                <th className="p-2 text-right">الباركود</th>
                <th className="p-2 text-right">المنتج</th>
                <th className="p-2 text-right">المعدود</th>
                <th className="p-2 text-right">النظام</th>
                <th className="p-2 text-right">الفارق</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.product_id ?? "unknown"}-${row.barcode}`} className="border-t">
                  <td className="p-2">{row.barcode}</td>
                  <td className="p-2">{row.product_name}</td>
                  <td className="p-2">{row.counted_quantity}</td>
                  <td className="p-2">{row.system_quantity}</td>
                  <td className="p-2">
                    <EcartBadge ecart={row.ecart} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    لا توجد بيانات بعد لهذه الجلسة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
