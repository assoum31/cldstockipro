import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

// Verrouillage du viewport (section 5B de la spec) : pas de zoom, pas
// de rebond de scroll, couvre les encoches (viewportFit: "cover") —
// nécessaire pour le /scan plein écran en entrepôt.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "StockiPro",
  description: "جرد المخزون في الوقت الحقيقي",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="font-[family-name:var(--font-cairo)] antialiased">
        {children}
      </body>
    </html>
  );
}
