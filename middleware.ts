import { NextRequest, NextResponse } from "next/server";

// Debe coincidir con SESSION_COOKIE en lib/admin/auth.ts. No se importa esa
// constante acá porque este middleware corre en el Edge Runtime, que no
// puede cargar better-sqlite3 ni abrir una conexión pg normal — por eso
// solo valida que el cookie de sesión esté presente (una redirección rápida
// para la UI). La autorización real (que la sesión exista, no haya vencido
// y el usuario tenga el rol correcto) se verifica en cada ruta /api/admin/*
// dentro del Node runtime, contra la base de datos. Ver requireUser().
const SESSION_COOKIE = "admin_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin/login";

  if (isLoginPage || isLoginApi) return NextResponse.next();

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
