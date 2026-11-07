import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseProductImportFile } from "@/lib/excel";

function asFile(buffer: ArrayBuffer, name = "products.xlsx"): File {
  return { name, arrayBuffer: async () => buffer } as File;
}

describe("product spreadsheet import", () => {
  it("preserves text barcodes and formatted numeric quantities and prices", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["الباركود", "اسم المنتج", "الكمية الحالية", "سعر الشراء"],
      ["0001234", "منتج", 1234.5, 27.75],
      [1234, "منتج", 2, 3],
    ]);
    sheet.A3.z = "0000000";
    sheet.C2.z = "#,##0.00";
    sheet.D2.z = '$0.00';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Products");
    const rows = await parseProductImportFile(asFile(XLSX.write(workbook, { type: "array", bookType: "xlsx" })));
    expect(rows[0]).toMatchObject({ barcode: "0001234", system_quantity: 1234.5, purchase_price: 27.75 });
    expect(rows[1].barcode).toBe("0001234");
  });

  it("preserves leading zeros in CSV barcodes", async () => {
    const csv = "الباركود,اسم المنتج,الكمية الحالية\n0001234,منتج,12\n";
    const rows = await parseProductImportFile(asFile(new TextEncoder().encode(csv).buffer, "products.csv"));
    expect(rows[0]).toMatchObject({ barcode: "0001234", system_quantity: 12 });
  });
});
