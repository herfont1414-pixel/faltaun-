import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { createSession, findUserByPin, recordAudit, SESSION_COOKIE } from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();

  const { pin } = await request.json();
  if (typeof pin !== "string" || !pin) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  const user = await findUserByPin(pin);
  if (!user) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  // El cookie guarda un token de sesión al azar, nunca el PIN: así el PIN
  // real nunca queda expuesto como si fuera la credencial de sesión.
  const token = await createSession(user.id);
  await recordAudit({ userId: user.id, action: "login", entity: "gestion_users", entityId: user.id });

  const response = NextResponse.json({ ok: true, user: { name: user.name, role: user.role } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
