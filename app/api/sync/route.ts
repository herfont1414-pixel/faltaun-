import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPool, isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { isCloudRole } from "@/lib/admin/role";
import { clientIp, rateLimit } from "@/lib/admin/rate-limit";
import { handleSync } from "@/lib/admin/sync";
import type { SyncRequest } from "@/lib/admin/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const digest = (value: string) => crypto.createHash("sha256").update(value).digest();

// Lugar donde la PC del local le habla a la nube (ver lib/admin/sync.ts). Solo existe en la
// nube (MADERO_ROL=nube) y exige la clave compartida SYNC_TOKEN.
export async function POST(request: NextRequest) {
  if (!isCloudRole()) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const expected = process.env.SYNC_TOKEN?.trim() ?? "";
  if (!isDbConfigured() || expected.length < 16) {
    return NextResponse.json({ error: "La conexión con el local no está configurada" }, { status: 503 });
  }

  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!crypto.timingSafeEqual(digest(given), digest(expected))) {
    // Freno contra probar claves: solo cuentan los intentos fallidos.
    await ensureSeeded();
    const limit = await rateLimit("sync_auth", clientIp(request), 20, 60 * 60 * 1000);
    return NextResponse.json({ error: "No autorizado" }, { status: limit.ok ? 401 : 429 });
  }

  let body: SyncRequest;
  try {
    const raw = await request.text();
    if (raw.length > 8_000_000) return NextResponse.json({ error: "Pedido demasiado grande" }, { status: 413 });
    body = JSON.parse(raw) as SyncRequest;
    if (!body || body.v !== 1) throw new Error("versión");
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  try {
    await ensureSeeded();
    return NextResponse.json(await handleSync(getPool(), body));
  } catch (error) {
    console.error("[sync] error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
