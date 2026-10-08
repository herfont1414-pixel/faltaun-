import { getPool } from "@/lib/admin/db";

export interface PrintableItem {
  name: string;
  qty: number;
  category: string;
  area: string;
}

export interface PrintableOrder {
  orderId: string;
  tableNumber: number | null;
  origin: "mesa" | "mostrador" | "delivery";
  customerName: string | null;
  openedAt: string;
  notes: string | null;
  items: PrintableItem[];
  areas: string[];
}

// Si el producto no tiene un área de impresión asignada en Productos, se
// usa este heurístico de respaldo para que igual salga en algún lado de
// la comanda (antes de que existiera gestion_print_areas, todo se
// repartía así).
function fallbackArea(category: string) {
  return category === "Bebidas" ? "Barra" : "Cocina";
}

export async function getPrintableOrder(orderId: string): Promise<PrintableOrder> {
  const pool = getPool();
  const { rows: orderRows } = await pool.query(
    `select o.id, o.origin, o.opened_at, o.notes, o.is_delivery, o.customer_name, t.number as table_number
     from gestion_orders o
     left join gestion_tables t on t.id = o.table_id
     where o.id = $1`,
    [orderId]
  );
  if (!orderRows[0]) throw new Error(`Pedido ${orderId} no existe`);
  const orderRow = orderRows[0];

  const { rows: itemRows } = await pool.query(
    `select oi.product_name, oi.qty, c.name as category_name, pa.nombre as area_name
     from gestion_order_items oi
     join gestion_products p on p.name = oi.product_name
     join gestion_categories c on c.id = p.category_id
     left join gestion_print_areas pa on pa.id = p.print_area_id
     where oi.order_id = $1 and oi.sent_to_kitchen = true
     order by c.sort_order, oi.product_name`,
    [orderId]
  );

  const items: PrintableItem[] = itemRows.map((r) => ({
    name: r.product_name,
    qty: r.qty,
    category: r.category_name,
    area: r.area_name ?? fallbackArea(r.category_name),
  }));

  return {
    orderId,
    tableNumber: orderRow.table_number,
    origin: orderRow.is_delivery ? "delivery" : orderRow.origin,
    customerName: orderRow.customer_name ?? null,
    openedAt: orderRow.opened_at,
    notes: orderRow.notes ?? null,
    items,
    areas: [...new Set(items.map((it) => it.area))],
  };
}

export interface PrintableTicket {
  orderId: string;
  tableNumber: number | null;
  origin: "mesa" | "mostrador";
  isDelivery: boolean;
  status: "abierta" | "cerrada";
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  openedAt: string;
  items: { name: string; qty: number; price: number }[];
  shippingCost: number;
  total: number;
  paymentMethod: string | null;
}

function toNumber(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

export async function getPrintableTicket(orderId: string): Promise<PrintableTicket> {
  const pool = getPool();
  const { rows: orderRows } = await pool.query(
    `select o.*, t.number as table_number
     from gestion_orders o
     left join gestion_tables t on t.id = o.table_id
     where o.id = $1`,
    [orderId]
  );
  if (!orderRows[0]) throw new Error(`Pedido ${orderId} no existe`);
  const order = orderRows[0];

  const { rows: itemRows } = await pool.query(
    `select product_name, price, qty from gestion_order_items where order_id = $1 order by id`,
    [orderId]
  );
  const items = itemRows.map((r) => ({ name: r.product_name, qty: r.qty, price: toNumber(r.price) }));
  const shippingCost = toNumber(order.shipping_cost ?? 0);
  const itemsTotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const liveTotal = itemsTotal + (order.is_delivery ? shippingCost : 0);

  return {
    orderId,
    tableNumber: order.table_number,
    origin: order.origin,
    isDelivery: !!order.is_delivery,
    status: order.status,
    customerName: order.customer_name ?? null,
    customerPhone: order.customer_phone ?? null,
    customerAddress: order.customer_address ?? null,
    openedAt: order.opened_at,
    items,
    shippingCost,
    total: order.status === "cerrada" ? toNumber(order.total) : liveTotal,
    paymentMethod: order.payment_method ?? null,
  };
}
