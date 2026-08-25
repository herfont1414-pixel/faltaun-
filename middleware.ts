import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "gestion_auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/gestion/login";
  const isLoginApi = pathname === "/api/gestion/login";

  if (isLoginPage || isLoginApi) return NextResponse.next();

  const expected = process.env.GESTION_PASSWORD;
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (expected && cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/gestion")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const loginUrl = new URL("/gestion/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/gestion/:path*", "/api/gestion/:path*"],
};
