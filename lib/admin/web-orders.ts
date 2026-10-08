import { getPool } from "@/lib/admin/db";
import { addStamp } from "@/lib/admin/loyalty";
import { recordStockMovement } from "@/lib/admin/stock-movements";
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
}): Promise<WebOrder> {
  const pool = getPool();

  const { rows: productRows } = await pool.query<{
    name: string;
    price: string;
    in_stock: boolean;
    stock_qty: number | null;
  }>("select name, price, in_stock, stock_qty from gestion_products where active = true");
  const byName = new Map(productRows.map((p) => [p.name, p]));

  const items = input.items
    .filter((it) => byName.has(it.name) && it.qty > 0)
    .map((it) => ({ name: it.name, qty: it.qty, price: money(byName.get(it.name)!.price) }));

  if (items.length === 0) throw new Error("El pedido no tiene productos válidos");

  // Nunca confiar en el stock que "cree" el cliente: se valida acá contra
  // el stock real. No se descuenta todavía (el pedido puede ser rechazado);
  // se descuenta cuando el local lo confirma, ver respondWebOrder().
  for (const it of items) {
    const product = byName.get(it.name)!;
    if (!product.in_stock) throw new Error(`${it.name} ya no está disponible`);
    if (product.stock_qty !== null && product.stock_qty < it.qty) {
      throw new Error(`No hay suficiente stock de ${it.name}`);
    }
  }

  // El costo de envío NUNCA se confía del cliente (body.shippingCost):
  // se resuelve siempre contra la zona real guardada en el servidor. Si
  // la zona no existe (o ya no existe), se rechaza el pedido en vez de
  // aceptar un envío gratis o inventado.
  let shippingCost = 0;
  if (input.fulfillment === "delivery") {
    if (!input.deliveryZone) throw new Error("Falta la zona de entrega");
    const { rows: zoneRows } = await pool.query<{ cost: string | number }>(
      "select cost from gestion_delivery_zones where name = $1",
      [input.deliveryZone]
    );
    if (!zoneRows[0]) throw new Error("La zona de entrega elegida no existe");
    shippingCost = money(zoneRows[0].cost);
  }
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
    const client = await pool.connect();
    try {
      await client.query("begin");

      const { rows: orderRows } = await client.query(
        "select status, customer_phone, customer_name, total, items from gestion_web_orders where id = $1 for update",
        [id]
      );
      if (!orderRows[0]) throw new Error("Pedido no encontrado");
      // Idempotencia: si ya estaba confirmado (doble click, reintento de
      // red), no se vuelve a descontar stock ni se reprocesa nada.
      if (orderRows[0].status !== "pendiente") return;

      const items = typeof orderRows[0].items === "string" ? JSON.parse(orderRows[0].items) : orderRows[0].items;

      // Re-validar y descontar stock recién ahora, al confirmar (no en la
      // creación, donde el pedido todavía puede ser rechazado). Se bloquea
      // cada producto para que dos pedidos web confirmados a la vez no
      // sobrevendan el mismo stock; si no alcanza, se rechaza toda la
      // confirmación (igual criterio que finalizeOrder en Fase 4).
      for (const it of items as { name: string; qty: number }[]) {
        const { rows: prodRows } = await client.query<{ id: number; stock_qty: number | null }>(
          "select id, stock_qty from gestion_products where name = $1 for update",
          [it.name]
        );
        const product = prodRows[0];
        if (!product || product.stock_qty === null) continue;
        const newQty = product.stock_qty - it.qty;
        if (newQty < 0) {
          throw new Error(`No hay suficiente stock de ${it.name} para confirmar este pedido`);
        }
        await client.query("update gestion_products set stock_qty = $2, in_stock = $3 where id = $1", [
          product.id,
          newQty,
          newQty > 0,
        ]);
        await recordStockMovement(
          { productId: product.id, type: "venta", quantity: -it.qty, referenceType: "web_order", referenceId: id },
          client
        );
      }

      await client.query(
        `update gestion_web_orders
         set status = $2, eta_minutes = $3, responded_at = now(),
             kitchen_status = 'pendiente', kitchen_sent_at = now()
         where id = $1`,
        [id, status, etaMinutes]
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const { rows } = await pool.query(
      "select customer_phone, customer_name, total from gestion_web_orders where id = $1",
      [id]
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
