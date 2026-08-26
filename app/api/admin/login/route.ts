import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { pin } = await request.json();
  const expected = process.env.ADMIN_PIN;

  if (!expected || pin !== expected) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_auth", expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
