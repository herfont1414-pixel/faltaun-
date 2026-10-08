import { getPool } from "@/lib/admin/db";
import { addStamp } from "@/lib/admin/loyalty";
import type { Fulfillment, WebOrder, WebOrderStatus } from "@/lib/admin/types";

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

function mapRow(row: any): WebOrder {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address ?? null,
    fulfillment: row.fulfillment ?? "retiro",
    deliveryZone: row.delivery_zone ?? null,
    shippingCost: money(row.shipping_cost ?? 0),
    notes: row.notes,
    items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
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
  fulfillment: Fulfillment;
  customerAddress: string | null;
  deliveryZone: string | null;
  shippingCost: number;
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

  const shippingCost = input.fulfillment === "delivery" ? input.shippingCost : 0;
  const total = items.reduce((sum, it) => sum + it.price * it.qty, 0) + shippingCost;

  await pool.query(
    `insert into gestion_delivery_customers (phone, name, address, updated_at)
     values ($1, $2, $3, now())
     on conflict (phone) do update set name = excluded.name,
       address = coalesce(excluded.address, gestion_delivery_customers.address),
       updated_at = excluded.updated_at`,
    [input.customerPhone, input.customerName, input.customerAddress]
  );

  const { rows } = await pool.query(
    `insert into gestion_web_orders
       (customer_name, customer_phone, customer_address, fulfillment, delivery_zone, shipping_cost, notes, items, total)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      input.customerName,
      input.customerPhone,
      input.customerAddress,
      input.fulfillment,
      input.deliveryZone,
      shippingCost,
      input.notes,
      JSON.stringify(items),
      total,
    ]
  );
  return mapRow(rows[0]);
}

export async function listWebOrdersByPhone(phone: string, limit = 15): Promise<WebOrder[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select * from gestion_web_orders where customer_phone = $1 order by created_at desc limit $2",
    [phone, limit]
  );
  return rows.map(mapRow);
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
  if (status === "confirmado") {
    const { rows } = await pool.query(
      `update gestion_web_orders
       set status = $2, eta_minutes = $3, responded_at = now(),
           kitchen_status = 'pendiente', kitchen_sent_at = now()
       where id = $1
       returning customer_phone, customer_name, total`,
      [id, status, etaMinutes]
    );
    if (rows[0]?.customer_phone) {
      await addStamp(rows[0].customer_phone, id, {
        name: rows[0].customer_name,
        orderTotal: money(rows[0].total),
        origin: "web",
      });
    }
    return;
  }
  await pool.query(
    "update gestion_web_orders set status = $2, eta_minutes = $3, responded_at = now() where id = $1",
    [id, status, etaMinutes]
  );
}
