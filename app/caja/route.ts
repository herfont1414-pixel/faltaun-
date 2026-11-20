import { NextRequest, NextResponse } from "next/server";
import { cajaTarget } from "@/lib/admin/caja-link";

export const dynamic = "force-dynamic";

const page = (body: string) =>
  new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Madero Caja</title>
<link rel="manifest" href="/caja/manifest"><link rel="icon" href="/icons/icon-192.png"><meta name="theme-color" content="#1a110b">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a110b;color:#efe3cc;font-family:system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:22px;margin:0 0 10px}p{font-size:15px;line-height:1.5;color:#d6b480;max-width:360px;margin:0 auto 18px}
a.b{display:inline-block;background:#e58a3c;color:#1a110b;font-weight:700;font-size:17px;padding:14px 26px;border-radius:12px;text-decoration:none}
.tip{margin-top:26px;font-size:14px;color:#efe3cc;background:rgba(255,255,255,.06);border-radius:12px;padding:12px 14px;max-width:360px}</style></head>
<body><div>${body}</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Link fijo a la caja (ver lib/admin/caja-link.ts). /caja va directo a la caja; /caja?guardar muestra
// cómo dejar el acceso en la pantalla del celular (el acceso abre /caja, no la dirección de hoy).
export async function GET(request: NextRequest) {
  const target = await cajaTarget().catch(() => ({ kind: "unknown" as const }));
  const save = request.nextUrl.searchParams.has("guardar");
  if (target.kind === "local") return NextResponse.redirect(new URL("/admin", request.url), { status: 302 });
  if (target.kind === "redirect" && !save) {
    return NextResponse.redirect(target.url, { status: 302, headers: { "cache-control": "no-store" } });
  }
  const tip = `<div class="tip">📌 Para no escanear más: en Chrome tocá <b>⋮ → Agregar a la pantalla principal</b>. El acceso «Madero Caja» abre siempre la caja, aunque cambie su dirección.</div>`;
  if (target.kind === "redirect") {
    return page(`<h1>Madero · Caja</h1><p>Tu celular tiene que estar en el Wi-Fi del local.</p><a class="b" href="${escape(target.url)}">Abrir la caja</a>${tip}`);
  }
  return page(
    `<h1>No encuentro la caja</h1><p>Prendé la PC de la caja y abrí MaderoSys. En un minuto este link vuelve a funcionar.</p><a class="b" href="/caja">Probar de nuevo</a>${save ? tip : ""}`
  );
}
