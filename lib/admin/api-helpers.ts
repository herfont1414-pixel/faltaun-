import { NextRequest, NextResponse } from "next/server";
import { getState } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { requireUser } from "@/lib/admin/auth";
import type { AuthUser, Role } from "@/lib/admin/auth";

// Punto único de autorización para casi todas las rutas de mutación del
// admin (las que usan este helper). El middleware (Edge Runtime) solo mira
// si hay un cookie de sesión presente; acá, ya en Node runtime y con acceso
// a la base, se valida que esa sesión exista, no haya vencido y el usuario
// esté activo — y opcionalmente que tenga uno de los roles permitidos.
export async function ok<T>(
  request: NextRequest,
  mutate: (user: AuthUser) => Promise<T>,
  roles?: Role[]
) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "La base de datos todavía no está configurada (falta DATABASE_URL)." },
      { status: 503 }
    );
  }
  await ensureSeeded();
  const user = await requireUser(request, roles);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await mutate(user);
    const state = await getState();
    return NextResponse.json({ ...state, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
