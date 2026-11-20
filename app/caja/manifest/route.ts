import { NextResponse } from "next/server";

// Acceso directo "Madero Caja" en la pantalla del celular: siempre abre /caja (el link fijo).
export function GET() {
  return NextResponse.json(
    {
      name: "Madero Caja",
      short_name: "Caja",
      start_url: "/caja",
      scope: "/caja",
      display: "browser",
      background_color: "#1a110b",
      theme_color: "#1a110b",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } }
  );
}
