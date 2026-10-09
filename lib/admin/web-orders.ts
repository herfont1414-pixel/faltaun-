import { getPool } from "@/lib/admin/db";
import type { DbClient } from "@/lib/admin/db";
import { addStamp } from "@/lib/admin/loyalty";
import { recordStockMovement } from "@/lib/admin/stock-movements";
import { quoteDelivery } from "@/lib/admin/delivery-quote";
import { isValidLatLng } from "@/lib/geo";
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
    deliveryLat: row.delivery_lat === null || row.delivery_lat === undefined ? null : money(row.delivery_lat),
    deliveryLng: row.delivery_lng === null || row.delivery_lng === undefined ? null : money(row.delivery_lng),
    orderId: row.order_id ?? null,
    orderStatus: row.order_status ?? null,
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
  // Dónde marcó el cliente su dirección en el mapa (opcional).
  deliveryLat?: number | null;
  deliveryLng?: number | null;
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
  // se resuelve siempre en el servidor. Con la dirección marcada en el mapa y
  // zonas por distancia cargadas, se calcula por kilómetros desde el local; si
  // no, contra la zona por nombre guardada. Si la zona no existe, o la
  // dirección queda fuera del reparto, se rechaza el pedido en vez de aceptar
  // un envío gratis o inventado.
  let shippingCost = 0;
  let deliveryZone = input.deliveryZone;
  let deliveryLat: number | null = null;
  let deliveryLng: number | null = null;
  if (input.fulfillment === "delivery") {
    let resolved = false;
    if (isValidLatLng(input.deliveryLat, input.deliveryLng)) {
      deliveryLat = input.deliveryLat as number;
      deliveryLng = input.deliveryLng as number;
      const quote = await quoteDelivery({ lat: deliveryLat, lng: deliveryLng });
      if (quote.status === "out_of_range") {
        throw new Error(`Tu dirección queda fuera de la zona de reparto (hasta ${quote.maxKm} km del local)`);
      }
      if (quote.status === "ok") {
        deliveryZone = quote.zone.name;
        shippingCost = quote.zone.cost;
        resolved = true;
      }
    }
    if (!resolved) {
      if (!deliveryZone) throw new Error("Falta la zona de entrega");
      const { rows: zoneRows } = await pool.query<{ cost: string | number; max_km: string | number | null }>(
        "select cost, max_km from gestion_delivery_zones where name = $1",
        [deliveryZone]
      );
      if (!zoneRows[0]) throw new Error("La zona de entrega elegida no existe");
      // Una zona por distancia solo se puede obtener marcando la dirección en el mapa.
      if (zoneRows[0].max_km !== null && zoneRows[0].max_km !== undefined) {
        throw new Error("Marcá tu dirección en el mapa para calcular el envío");
      }
      shippingCost = money(zoneRows[0].cost);
    }
  }
  const total = items.reduce((sum, it) => sum + it.price * it.qty, 0) + shippingCost;

  await pool.query(
    `insert into gestion_delivery_customers (phone, name, address, updated_at, created_at)
     values ($1, $2, $3, now(), now())
     on conflict (phone) do update set name = excluded.name,
       address = coalesce(excluded.address, gestion_delivery_customers.address),
       updated_at = excluded.updated_at`,
    [input.customerPhone, input.customerName, input.customerAddress]
  );

  const { rows } = await pool.query(
    `insert into gestion_web_orders
       (customer_name, customer_phone, customer_address, fulfillment, delivery_zone, shipping_cost, notes, items, total,
        delivery_lat, delivery_lng)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [
      input.customerName,
      input.customerPhone,
      input.customerAddress,
      input.fulfillment,
      deliveryZone,
      shippingCost,
      input.notes,
      JSON.stringify(items),
      total,
      deliveryLat,
      deliveryLng,
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
  const base = `select w.*, o.status as order_status
    from gestion_web_orders w
    left join gestion_orders o on o.id = w.order_id`;
  const { rows } = status
    ? await pool.query(`${base} where w.status = $1 order by w.created_at desc`, [status])
    : await pool.query(`${base} order by w.created_at desc limit 30`);
  return rows.map(mapRow);
}

type WebOrderItemRow = { name: string; qty: number; price: number };

function parseItems(raw: unknown): WebOrderItemRow[] {
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as WebOrderItemRow[];
}

// Crea el pedido real (gestion_orders + ítems) que corresponde a un pedido web
// aceptado. Es lo que permite prepararlo, mandarlo a cocina, marcarlo "en
// camino"/"entregado", cobrarlo y cerrarlo como cualquier otro pedido, y que
// entre en caja y reportes. Los precios son los que se le mostraron al cliente
// (la foto del pedido web), no los de hoy. Corre dentro de la transacción de
// quien lo llama.
async function createPosOrderForWeb(
  client: DbClient,
  web: {
    id: string;
    customer_name: string;
    customer_phone: string;
    customer_address: string | null;
    delivery_lat?: string | number | null;
    delivery_lng?: string | number | null;
    fulfillment: string;
    delivery_zone: string | null;
    shipping_cost: string | number | null;
    notes: string | null;
    items: unknown;
    kitchen_status?: string | null;
  },
  kitchenStatus: string | null
): Promise<string> {
  const isDelivery = web.fulfillment === "delivery";
  const notes = ["Pedido web", web.notes?.trim()].filter(Boolean).join(" · ");
  const { rows } = await client.query<{ id: string }>(
    `insert into gestion_orders
       (origin, is_delivery, customer_name, customer_phone, customer_address, delivery_zone, shipping_cost,
        delivery_status, notes, kitchen_status, kitchen_sent_at, delivery_lat, delivery_lng)
     values ('mostrador', ${isDelivery ? "true" : "false"}, $1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10)
     returning id`,
    [
      web.customer_name,
      web.customer_phone,
      isDelivery ? web.customer_address : null,
      isDelivery ? web.delivery_zone : null,
      isDelivery ? money(web.shipping_cost ?? 0) : 0,
      isDelivery ? "preparando" : null,
      notes,
      kitchenStatus,
      isDelivery ? (web.delivery_lat ?? null) : null,
      isDelivery ? (web.delivery_lng ?? null) : null,
    ]
  );
  const orderId = rows[0].id;

  for (const it of parseItems(web.items)) {
    const { rows: prodRows } = await client.query<{ id: number }>(
      "select id from gestion_products where name = $1",
      [it.name]
    );
    await client.query(
      `insert into gestion_order_items (order_id, product_name, price, qty, sent_to_kitchen, product_id)
       values ($1, $2, $3, $4, true, $5)`,
      [orderId, it.name, it.price, it.qty, prodRows[0]?.id ?? null]
    );
  }
  await client.query("update gestion_web_orders set order_id = $2 where id = $1", [web.id, orderId]);
  return orderId;
}

// Devuelve el id del pedido real vinculado al pedido web, creándolo si hace
// falta. Sirve para los pedidos que se aceptaron ANTES de que existiera el
// vínculo: ahí el stock ya se había descontado al aceptar, así que se repone
// para que el cobro (que es donde se descuenta ahora) no lo reste dos veces.
export async function ensurePosOrderForWebOrder(webOrderId: string): Promise<string> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      "select * from gestion_web_orders where id = $1 for update",
      [webOrderId]
    );
    const web = rows[0];
    if (!web) throw new Error("Pedido no encontrado");
    if (web.status !== "confirmado") throw new Error("Solo se pueden abrir los pedidos aceptados");

    if (web.order_id) {
      const { rows: existing } = await client.query("select id from gestion_orders where id = $1", [web.order_id]);
      if (existing[0]) {
        await client.query("commit");
        return web.order_id;
      }
    }

    for (const it of parseItems(web.items)) {
      const { rows: prodRows } = await client.query<{ id: number; stock_qty: number | null }>(
        "select id, stock_qty from gestion_products where name = $1 for update",
        [it.name]
      );
      const product = prodRows[0];
      if (!product || product.stock_qty === null) continue;
      const { rows: moved } = await client.query(
        `select 1 as found from gestion_stock_movements
         where reference_type = 'web_order' and reference_id = $1 and product_id = $2 and type = 'venta'`,
        [webOrderId, product.id]
      );
      if (!moved[0]) continue;
      await client.query("update gestion_products set stock_qty = $2, in_stock = true where id = $1", [
        product.id,
        product.stock_qty + it.qty,
      ]);
      await recordStockMovement(
        {
          productId: product.id,
          type: "devolucion",
          quantity: it.qty,
          referenceType: "web_order",
          referenceId: webOrderId,
          note: "El stock se descuenta al cobrar el pedido",
        },
        client
      );
    }

    // Si en la cocina ya figuraba como despachado, el pedido real también.
    const orderId = await createPosOrderForWeb(client, web, web.kitchen_status ?? null);
    await client.query("commit");
    return orderId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function respondWebOrder(
  id: string,
  status: WebOrderStatus,
  etaMinutes: number | null
): Promise<{ orderId: string | null }> {
  const pool = getPool();
  if (status === "confirmado") {
    const client = await pool.connect();
    let orderId: string | null = null;
    try {
      await client.query("begin");

      const { rows: orderRows } = await client.query("select * from gestion_web_orders where id = $1 for update", [id]);
      const web = orderRows[0];
      if (!web) throw new Error("Pedido no encontrado");
      // Idempotencia: si ya estaba confirmado (doble click, reintento de
      // red), no se vuelve a crear nada.
      if (web.status !== "pendiente") {
        await client.query("rollback");
        return { orderId: web.order_id ?? null };
      }

      // Al aceptar solo se VERIFICA que haya stock; el descuento se hace al
      // cobrar (finalizeOrder), igual que en mesas y mostrador. Así el stock
      // se descuenta una sola vez y, si el pedido no se cobra, no se pierde.
      for (const it of parseItems(web.items)) {
        const { rows: prodRows } = await client.query<{ stock_qty: number | null }>(
          "select stock_qty from gestion_products where name = $1",
          [it.name]
        );
        const product = prodRows[0];
        if (product && product.stock_qty !== null && product.stock_qty < it.qty) {
          throw new Error(`No hay suficiente stock de ${it.name} para confirmar este pedido`);
        }
      }

      await client.query(
        `update gestion_web_orders
         set status = $2, eta_minutes = $3, responded_at = now(),
             kitchen_status = 'pendiente', kitchen_sent_at = now()
         where id = $1`,
        [id, status, etaMinutes]
      );
      orderId = await createPosOrderForWeb(client, web, "pendiente");

      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => {});
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
    return { orderId };
  }
  await pool.query(
    "update gestion_web_orders set status = $2, eta_minutes = $3, responded_at = now() where id = $1",
    [id, status, etaMinutes]
  );
  return { orderId: null };
}
