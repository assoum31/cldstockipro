"use client";

// Tout ce fichier s'exécute dans le navigateur (lecture de File,
// déclenchement de téléchargement) : ne JAMAIS l'importer depuis du
// code serveur.
import * as XLSX from "xlsx";
import type { ProductImportRow } from "@/app/dashboard/actions";

const TEMPLATE_HEADERS = [
  "الباركود",
  "اسم المنتج",
  "التصنيف",
  "الموقع الافتراضي",
  "الكمية الحالية",
  "سعر الشراء",
  "سعر البيع",
] as const;

function triggerDownload(workbook: XLSX.WorkBook, filename: string) {
  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Section C de la spec : "Stocki_Inventory_Template.xlsx" vierge,
// avec juste les en-têtes attendus par bulkUpsertProducts.
export function downloadProductTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS as unknown as string[]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Produits");
  triggerDownload(workbook, "Stocki_Inventory_Template.xlsx");
}

// Lit un .xlsx/.csv et le convertit en lignes typées pour
// bulkUpsertProducts. { raw: false } force les cellules en chaînes
// pour ne jamais perdre les zéros de tête d'un code-barres (sinon
// "0001234" devient le nombre 1234).
export async function parseProductImportFile(
  file: File
): Promise<ProductImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    raw: false,
    defval: "",
  });

  return rows
    .map((row) => ({
      barcode: String(row["الباركود"] ?? "").trim(),
      name: String(row["اسم المنتج"] ?? "").trim(),
      category: String(row["التصنيف"] ?? "").trim() || null,
      default_location: String(row["الموقع الافتراضي"] ?? "").trim() || null,
      system_quantity: Number(row["الكمية الحالية"] ?? 0) || 0,
      purchase_price: Number(row["سعر الشراء"] ?? 0) || 0,
      sale_price: Number(row["سعر البيع"] ?? 0) || 0,
    }))
    .filter((row) => row.barcode.length > 0);
}

type AuditLogRow = {
  barcode: string;
  product_name: string;
  counted_quantity: number;
  location: string;
  counted_by_name: string;
  counted_at: string;
};

// Export audit en .xlsx (binaire, aucun souci d'encodage — la
// remarque "UTF-8 BOM" de la spec ne concerne que le CSV ; cette
// fonction produit un vrai classeur Excel, donc non applicable ici).
export function downloadAuditExport(rows: AuditLogRow[], filename: string) {
  const data = rows.map((r) => ({
    الباركود: r.barcode,
    "اسم المنتج": r.product_name,
    "الكمية المعدودة": r.counted_quantity,
    الموقع: r.location,
    "تم العد بواسطة": r.counted_by_name,
    التاريخ: new Date(r.counted_at).toLocaleString("ar-TN"),
  }));

  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Audit");
  triggerDownload(workbook, filename);
}
