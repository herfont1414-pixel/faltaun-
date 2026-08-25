import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Madero Restó | Bar & Restó",
  description: "Cocina de autor, tragos de barra y una carta de vinos pensada para compartir. Reservá tu mesa online.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Madero Restó",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0b0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
