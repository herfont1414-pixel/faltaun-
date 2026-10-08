import { NextRequest, NextResponse } from "next/server";
import { destroySession, getSessionUser, recordAudit, SESSION_COOKIE } from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await getSessionUser(token);
    if (user) await recordAudit({ userId: user.id, action: "logout", entity: "gestion_users", entityId: user.id });
    await destroySession(token);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
