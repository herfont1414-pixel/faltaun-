import { getPool } from "@/lib/admin/db";
import type { KitchenSource, KitchenStatus, KitchenTicket } from "@/lib/admin/types";

export async function getKitchenTickets(): Promise<KitchenTicket[]> {
  const pool = getPool();

  const { rows: orderRows } = await pool.query<{
    id: string;
    origin: "mesa" | "mostrador";
    table_number: number | null;
    kitchen_status: KitchenStatus;
    kitchen_sent_at: string;
    is_delivery: boolean;
    customer_name: string | null;
  }>(
    `select o.id, o.origin, t.number as table_number, o.kitchen_status, o.kitchen_sent_at,
            o.is_delivery, o.customer_name
     from gestion_orders o
     left join gestion_tables t on t.id = o.table_id
     where o.status = 'abierta' and o.kitchen_status is not null and o.kitchen_status != 'despachado'
     order by o.kitchen_sent_at`
  );

  const orderTickets: KitchenTicket[] = [];
  if (orderRows.length > 0) {
    const ids = orderRows.map((r) => r.id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const { rows: itemRows } = await pool.query<{
      order_id: string;
      product_name: string;
      qty: number;
      sent_to_kitchen: boolean;
    }>(
      `select order_id, product_name, qty, sent_to_kitchen
       from gestion_order_items
       where order_id in (${placeholders})`,
      ids
    );
    for (const o of orderRows) {
      const items = itemRows
        .filter((it) => it.order_id === o.id && it.sent_to_kitchen)
        .map((it) => ({ name: it.product_name, qty: it.qty }));
      orderTickets.push({
        id: o.id,
        source: "orden",
        origin: o.is_delivery ? "delivery" : o.origin,
        tableNumber: o.table_number,
        customerName: o.is_delivery ? o.customer_name : null,
        items,
        kitchenStatus: o.kitchen_status,
        sentAt: o.kitchen_sent_at,
      });
    }
  }

  const { rows: webRows } = await pool.query<{
    id: string;
    customer_name: string;
    items: string | { name: string; qty: number }[];
    kitchen_status: KitchenStatus;
    kitchen_sent_at: string;
  }>(
    `select id, customer_name, items, kitchen_status, kitchen_sent_at
     from gestion_web_orders
     where kitchen_status is not null and kitchen_status != 'despachado'
     order by kitchen_sent_at`
  );
  const webTickets: KitchenTicket[] = webRows.map((w) => {
    const parsedItems = typeof w.items === "string" ? JSON.parse(w.items) : w.items;
    return {
      id: w.id,
      source: "web",
      origin: "web",
      tableNumber: null,
      customerName: w.customer_name,
      items: parsedItems.map((it: { name: string; qty: number }) => ({ name: it.name, qty: it.qty })),
      kitchenStatus: w.kitchen_status,
      sentAt: w.kitchen_sent_at,
    };
  });

  return [...orderTickets, ...webTickets].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

export async function setKitchenStatus(id: string, source: KitchenSource, status: KitchenStatus) {
  const pool = getPool();
  if (source === "orden") {
    await pool.query("update gestion_orders set kitchen_status = $2 where id = $1", [id, status]);
  } else {
    await pool.query("update gestion_web_orders set kitchen_status = $2 where id = $1", [id, status]);
  }
}
