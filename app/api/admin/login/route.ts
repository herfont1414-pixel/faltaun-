import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { createSession, findUserByPin, recordAudit, SESSION_COOKIE } from "@/lib/admin/auth";
import { clearRateLimit, clientIp, LIMITS, rateLimit, tooManyMessage } from "@/lib/admin/rate-limit";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();

  const { pin } = await request.json().catch(() => ({ pin: null }));

  // Freno contra probar PINs al azar: después de 5 intentos fallidos desde la misma
  // conexión, el login queda bloqueado 15 minutos (para esa conexión).
  const ip = clientIp(request);
  const limit = await rateLimit("login", ip, LIMITS.login.max, LIMITS.login.windowMs);
  if (!limit.ok) {
    await recordAudit({ userId: null, action: "login_blocked", entity: "gestion_users", newValue: { ip } }).catch(() => {});
    return NextResponse.json(
      { error: tooManyMessage(limit.retryAfterSec, "intentos con PIN incorrecto") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  if (typeof pin !== "string" || !pin) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  const user = await findUserByPin(pin);
  if (!user) {
    await recordAudit({ userId: null, action: "login_failed", entity: "gestion_users", newValue: { ip } }).catch(() => {});
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }
  // PIN correcto: se borran los intentos fallidos de esta conexión.
  await clearRateLimit("login", ip);

  // El cookie guarda un token de sesión al azar, nunca el PIN: así el PIN
  // real nunca queda expuesto como si fuera la credencial de sesión.
  const token = await createSession(user.id);
  await recordAudit({ userId: user.id, action: "login", entity: "gestion_users", entityId: user.id });

  const response = NextResponse.json({ ok: true, user: { name: user.name, role: user.role } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Solo se manda por HTTPS (la web y el panel van siempre con candado). COOKIE_SECURE=false
    // permite probar un servidor nuevo por http:// antes de tener la dirección definitiva.
    secure: process.env.NODE_ENV === "production" && !/^(false|0|no|off)$/i.test(process.env.COOKIE_SECURE ?? ""),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
