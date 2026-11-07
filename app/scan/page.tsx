"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { getActiveSession, lookupBarcode, submitCount } from "./actions";
import {
  enqueuePendingCount,
  getAllPendingCounts,
  removePendingCount,
  isNetworkError,
} from "@/lib/offline-queue";
import { LogoutButton } from "@/components/logout-button";

const SCANNER_ELEMENT_ID = "stockipro-scanner";

type ExistingLog = {
  id: string;
  counted_quantity: number;
  location: string;
  counted_by_name: string;
  counted_at: string;
  counted_by: string | null;
};

type ScanResult = {
  barcode: string;
  found: boolean;
  productId: string | null;
  productName: string;
  location: string;
  existingLog: ExistingLog | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("ar-TN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ScanPage() {
  const [session, setSession] = useState<{ id: string; title: string } | null>(
    null
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"create" | "update">("create");
  const [pendingCount, setPendingCount] = useState(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const pausedRef = useRef(false);

  // Rejoue la queue hors-ligne (IndexedDB) : appelée au montage, à
  // chaque retour réseau ('online'), et juste après chaque envoi
  // réussi (au cas où une entrée plus ancienne attendait déjà).
  const syncPendingCounts = useCallback(async () => {
    const pending = await getAllPendingCounts();
    setPendingCount(pending.length);
    for (const entry of pending) {
      const result = await submitCount(entry.payload).catch((err) => {
        if (isNetworkError(err)) return null; // toujours hors-ligne, on réessaiera plus tard
        return { ok: false as const, error: "فشل مزامنة سطر محفوظ محلياً." };
      });
      if (result === null) break; // pas la peine d'essayer les suivants maintenant
      if (result.ok) {
        await removePendingCount(entry.localId);
      }
      // Si result.ok === false pour une raison métier (pas réseau),
      // on laisse l'entrée en queue : elle sera visible via
      // pendingCount, à l'utilisateur de vérifier manuellement.
    }
    const remaining = await getAllPendingCounts();
    setPendingCount(remaining.length);
  }, []);

  useEffect(() => {
    syncPendingCounts();
    window.addEventListener("online", syncPendingCounts);
    return () => window.removeEventListener("online", syncPendingCounts);
  }, [syncPendingCounts]);

  // Charge la session active une fois au montage. Pas de session
  // active = pas de scan possible (évite de logger hors cycle).
  useEffect(() => {
    getActiveSession().then((result) => {
      if (!result.ok) {
        setSessionError(result.error);
        return;
      }
      if (!result.session) {
        setSessionError("لا توجد جلسة جرد نشطة حالياً. تواصل مع المدير.");
        return;
      }
      setSession(result.session);
    });
  }, []);

  const handleDecoded = useCallback(
    async (barcode: string) => {
      if (pausedRef.current || !session) return;
      pausedRef.current = true;

      if (navigator.vibrate) navigator.vibrate(100);
      await scannerRef.current?.pause(true);

      const result = await lookupBarcode(barcode, session.id);
      if (!result.ok) {
        setNotice(result.error);
        resumeScanning();
        return;
      }

      setScanResult({
        barcode,
        found: result.found,
        productId: result.productId,
        productName: result.productName ?? "",
        location: result.defaultLocation ?? "غير محدد",
        existingLog: result.existingLog,
      });
      setQuantity(
        result.existingLog ? String(result.existingLog.counted_quantity) : ""
      );
      setLocation(
        result.existingLog?.location ?? result.defaultLocation ?? "غير محدد"
      );
      setMode(result.existingLog ? "update" : "create");
    },
    [session]
  );

  // Démarre la caméra une fois la session connue. Viewfinder fixe
  // 220x220, formats courants de codes-barres commerce + QR.
  useEffect(() => {
    if (!session) return;

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          handleDecoded(decodedText);
        },
        undefined
      )
      .catch(() => {
        setSessionError("تعذر الوصول إلى الكاميرا. تحقق من الأذونات.");
      });

    return () => {
      scanner.stop().catch(() => {});
    };
    // handleDecoded ferme sur `session`, volontairement omis des deps
    // pour ne pas redémarrer la caméra à chaque scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function resumeScanning() {
    setScanResult(null);
    setQuantity("");
    setLocation("");
    pausedRef.current = false;
    scannerRef.current?.resume();
  }

  async function handleSubmit() {
    if (!scanResult || !session) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      setNotice("الكمية غير صالحة.");
      return;
    }

    const payload = {
      mode,
      logId: scanResult.existingLog?.id,
      sessionId: session.id,
      productId: scanResult.productId,
      barcode: scanResult.barcode,
      productName: scanResult.productName || "منتج غير مسمى",
      countedQuantity: qty,
      location: location || "غير محدد",
    };

    setSubmitting(true);
    try {
      const result = await submitCount(payload);
      setSubmitting(false);

      if (!result.ok) {
        setNotice(result.error);
        return;
      }

      setNotice("تم الحفظ ✓");
      resumeScanning();
      syncPendingCounts();
    } catch (err) {
      setSubmitting(false);
      if (!isNetworkError(err)) {
        setNotice("حدث خطأ غير متوقع.");
        return;
      }
      // Pas de réseau : on garde le comptage localement, l'auditeur
      // peut continuer à scanner sans attendre — la synchronisation
      // se fera toute seule au retour de la connexion.
      await enqueuePendingCount(payload);
      setPendingCount((n) => n + 1);
      setNotice("لا يوجد اتصال — تم الحفظ محلياً، سيُرسل تلقائياً لاحقاً.");
      resumeScanning();
    }
  }

  function handleAddAsNewLine() {
    setMode("create");
    setQuantity("");
  }

  if (sessionError) {
    return (
      <main dir="rtl" className="min-h-dvh flex items-center justify-center p-6">
        <p className="text-center text-red-600">{sessionError}</p>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-dvh overflow-hidden overscroll-none touch-none bg-black text-white flex flex-col"
    >
      <header className="p-3 text-center text-sm bg-neutral-900 flex items-center justify-center gap-2">
        <span>{session?.title ?? "..."}</span>
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-xs font-bold">
            {pendingCount} بانتظار الإرسال
          </span>
        )}
        <LogoutButton className="text-xs underline text-gray-300" />
      </header>

      <div className="relative flex-1">
        <div id={SCANNER_ELEMENT_ID} className="w-full h-full" />
        {/* Réticule visuel 220x220 avec bordure pulsante — le viewfinder
            réel est géré par html5-qrcode via qrbox ci-dessus ; ceci
            n'est qu'un repère visuel superposé. */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <div className="w-[220px] h-[220px] border-4 border-green-500 rounded-xl animate-pulse" />
        </div>
      </div>

      {notice && !scanResult && (
        <p className="p-2 text-center text-sm bg-neutral-800">{notice}</p>
      )}

      {scanResult && (
        <div className="absolute inset-x-0 bottom-0 bg-white text-black rounded-t-2xl p-4 space-y-3 max-h-[70dvh] overflow-y-auto">
          {scanResult.existingLog && (
            <div className="bg-amber-100 border border-amber-400 rounded-lg p-3 text-sm space-y-1">
              <p className="font-bold">⚠ تم تسجيل هذا المنتج من قبل</p>
              <p>الكمية السابقة: {scanResult.existingLog.counted_quantity}</p>
              <p>الموقع: {scanResult.existingLog.location}</p>
              <p>بواسطة: {scanResult.existingLog.counted_by_name}</p>
              <p>التاريخ: {formatTime(scanResult.existingLog.counted_at)}</p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode("update")}
                  className={`flex-1 rounded-lg p-2 text-sm ${
                    mode === "update" ? "bg-black text-white" : "bg-white border"
                  }`}
                >
                  تعديل الكمية / الموقع
                </button>
                <button
                  type="button"
                  onClick={handleAddAsNewLine}
                  className={`flex-1 rounded-lg p-2 text-sm ${
                    mode === "create" ? "bg-black text-white" : "bg-white border"
                  }`}
                >
                  إضافة كسطر جديد
                </button>
              </div>
            </div>
          )}

          <p className="font-bold">
            {scanResult.found ? scanResult.productName : "منتج غير معروف"}
          </p>
          {!scanResult.found && (
            <p className="text-xs text-amber-700">
              الباركود غير موجود في قاعدة المنتجات — سيُسجَّل باسم مؤقت.
            </p>
          )}

          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            placeholder="الكمية المعدودة"
            className="w-full border rounded-lg p-3"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="الموقع (رف / طابق)"
            className="w-full border rounded-lg p-3"
          />

          {notice && <p className="text-sm text-center">{notice}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resumeScanning}
              className="flex-1 rounded-lg p-3 border"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 rounded-lg p-3 bg-black text-white disabled:opacity-50"
            >
              حفظ
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
