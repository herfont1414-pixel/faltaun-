import { getPool } from "@/lib/admin/db";

export interface PrintableItem {
  name: string;
  qty: number;
  category: string;
}

export interface PrintableOrder {
  orderId: string;
  tableNumber: number | null;
  origin: "mesa" | "mostrador";
  openedAt: string;
  items: PrintableItem[];
}

export async function getPrintableOrder(orderId: string): Promise<PrintableOrder> {
  const pool = getPool();
  const { rows: orderRows } = await pool.query(
    `select o.id, o.origin, o.opened_at, t.number as table_number
     from gestion_orders o
     left join gestion_tables t on t.id = o.table_id
     where o.id = $1`,
    [orderId]
  );
  if (!orderRows[0]) throw new Error(`Pedido ${orderId} no existe`);

  const { rows: itemRows } = await pool.query(
    `select oi.product_name, oi.qty, c.name as category_name
     from gestion_order_items oi
     join gestion_products p on p.name = oi.product_name
     join gestion_categories c on c.id = p.category_id
     where oi.order_id = $1 and oi.sent_to_kitchen = true
     order by c.sort_order, oi.product_name`,
    [orderId]
  );

  return {
    orderId,
    tableNumber: orderRows[0].table_number,
    origin: orderRows[0].origin,
    openedAt: orderRows[0].opened_at,
    items: itemRows.map((r) => ({ name: r.product_name, qty: r.qty, category: r.category_name })),
  };
}
