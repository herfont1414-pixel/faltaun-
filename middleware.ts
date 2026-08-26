import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin/login";

  if (isLoginPage || isLoginApi) return NextResponse.next();

  const expected = process.env.ADMIN_PIN;
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (expected && cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
