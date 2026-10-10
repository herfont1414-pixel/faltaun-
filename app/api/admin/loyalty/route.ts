import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, getPool } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { requireUser } from "@/lib/admin/auth";
import {
  getLoyalty,
  listGrantsForPhone,
  listPendingGrants,
  listRewards,
  searchLoyaltyAccounts,
} from "@/lib/admin/loyalty";

export const dynamic = "force-dynamic";

// Lectura para la pantalla de premios y canjes (admin y encargado):
//  ?q=...      → búsqueda de clientes por teléfono o nombre
//  ?phone=...  → ficha de un cliente (sellos, premios y canjes)
//  sin params  → premios pendientes de todos los clientes + premios configurados
// Solo hace SELECT: canjear y editar premios se hace por sus propias rutas.
export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "La base de datos todavía no está configurada." }, { status: 503 });
  }
  await ensureSeeded();
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const params = request.nextUrl.searchParams;
  try {
    const q = params.get("q");
    if (q !== null) {
      return NextResponse.json({ results: await searchLoyaltyAccounts(q) });
    }
    const phone = params.get("phone");
    if (phone) {
      const { rows: exists } = await getPool().query("select phone from gestion_loyalty_accounts where phone = $1", [phone]);
      if (!exists[0]) return NextResponse.json({ error: "No hay una cuenta de fidelidad con ese teléfono" }, { status: 404 });
      const [account, grants] = await Promise.all([getLoyalty(phone), listGrantsForPhone(phone)]);
      return NextResponse.json({ account, grants });
    }
    const [pending, rewards] = await Promise.all([listPendingGrants(200), listRewards()]);
    // Comodidad para elegir qué hamburguesa se entregó (no es una lista autorizada:
    // el campo es opcional y el empleado puede dejarlo vacío).
    const { rows: burgers } = await getPool().query(
      `select p.id, p.name, p.stock_qty, p.in_stock
       from gestion_products p join gestion_categories c on c.id = p.category_id
       where p.active = true and lower(c.name) = 'burger'
       order by p.name`
    );
    return NextResponse.json({
      pending,
      rewards,
      burgerChoices: burgers.map((b: any) => ({
        id: Number(b.id),
        name: b.name,
        stockQty: b.stock_qty == null ? null : Number(b.stock_qty),
        inStock: Boolean(b.in_stock),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
