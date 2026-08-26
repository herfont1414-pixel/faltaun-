import { getPool } from "@/lib/admin/db";
import type { WebOrder, WebOrderStatus } from "@/lib/admin/types";

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

function mapRow(row: any): WebOrder {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    notes: row.notes,
    items: row.items,
    total: money(row.total),
    status: row.status,
    etaMinutes: row.eta_minutes,
    createdAt: row.created_at,
  };
}

export async function createWebOrder(input: {
  customerName: string;
  customerPhone: string;
  notes: string | null;
  items: { name: string; qty: number }[];
}): Promise<WebOrder> {
  const pool = getPool();

  const { rows: productRows } = await pool.query<{ name: string; price: string }>(
    "select name, price from gestion_products where active = true"
  );
  const priceByName = new Map(productRows.map((p) => [p.name, money(p.price)]));

  const items = input.items
    .filter((it) => priceByName.has(it.name) && it.qty > 0)
    .map((it) => ({ name: it.name, qty: it.qty, price: priceByName.get(it.name)! }));

  if (items.length === 0) throw new Error("El pedido no tiene productos válidos");

  const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);

  const { rows } = await pool.query(
    `insert into gestion_web_orders (customer_name, customer_phone, notes, items, total)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [input.customerName, input.customerPhone, input.notes, JSON.stringify(items), total]
  );
  return mapRow(rows[0]);
}

export async function listWebOrders(status?: WebOrderStatus): Promise<WebOrder[]> {
  const pool = getPool();
  const { rows } = status
    ? await pool.query("select * from gestion_web_orders where status = $1 order by created_at desc", [
        status,
      ])
    : await pool.query("select * from gestion_web_orders order by created_at desc limit 30");
  return rows.map(mapRow);
}

export async function respondWebOrder(id: string, status: WebOrderStatus, etaMinutes: number | null) {
  const pool = getPool();
  await pool.query(
    "update gestion_web_orders set status = $2, eta_minutes = $3, responded_at = now() where id = $1",
    [id, status, etaMinutes]
  );
}
