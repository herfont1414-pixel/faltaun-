import { getPool } from "@/lib/admin/db";

export interface PrintableItem {
  id: string;
  // Unidades que salen en esta comanda (en "solo lo nuevo", lo que falta imprimir de la línea).
  // `qty` ya es esa cantidad.
  name: string;
  qty: number;
  category: string;
  area: string;
  note: string | null;
}

export interface PrintableOrder {
  orderId: string;
  tableNumber: number | null;
  origin: "mesa" | "mostrador" | "delivery";
  customerName: string | null;
  partySize: number | null;
  waiter: string | null;
  // Pedido de mostrador que se lleva (no es mesa ni delivery).
  takeAway: boolean;
  openedAt: string;
  notes: string | null;
  items: PrintableItem[];
  areas: string[];
  // Comanda de lo agregado: el pedido ya tenía productos impresos antes.
  addition: boolean;
}

// Si el producto no tiene un área de impresión asignada en Productos, se
// usa este heurístico de respaldo para que igual salga en algún lado de
// la comanda (antes de que existiera gestion_print_areas, todo se
// repartía así).
function fallbackArea(category: string) {
  return category === "Bebidas" ? "Barra" : "Cocina";
}

// Por defecto devuelve solo lo enviado a cocina que todavía no salió en una comanda
// (por línea: las unidades que faltan imprimir, así "1 papas más" sale como 1 y no como el
// total); con { all: true } devuelve todo lo enviado (reimpresión completa).
export async function getPrintableOrder(orderId: string, options: { all?: boolean } = {}): Promise<PrintableOrder> {
  const pool = getPool();
  const { rows: orderRows } = await pool.query(
    `select o.id, o.origin, o.opened_at, o.notes, o.is_delivery, o.customer_name, o.party_size, o.waiter,
            t.number as table_number
     from gestion_orders o
     left join gestion_tables t on t.id = o.table_id
     where o.id = $1`,
    [orderId]
  );
  if (!orderRows[0]) throw new Error(`Pedido ${orderId} no existe`);
  const orderRow = orderRows[0];

  const { rows: itemRows } = await pool.query(
    `select oi.id, oi.product_name, oi.qty, oi.note, oi.comanda_printed_qty, c.name as category_name, pa.nombre as area_name
     from gestion_order_items oi
     join gestion_products p on p.name = oi.product_name
     join gestion_categories c on c.id = p.category_id
     left join gestion_print_areas pa on pa.id = p.print_area_id
     where oi.order_id = $1 and oi.sent_to_kitchen = true
     order by c.sort_order, oi.product_name`,
    [orderId]
  );

  const pending = (r: { qty: number; comanda_printed_qty: number | null }) => Math.max(0, Number(r.qty) - Number(r.comanda_printed_qty ?? 0));
  const wanted = options.all ? itemRows : itemRows.filter((r) => pending(r) > 0);
  const addition = !options.all && itemRows.some((r) => Number(r.comanda_printed_qty ?? 0) > 0) && wanted.length > 0;
  const items: PrintableItem[] = wanted.map((r) => ({
    id: String(r.id),
    name: r.product_name,
    qty: options.all ? Number(r.qty) : pending(r),
    category: r.category_name,
    area: r.area_name ?? fallbackArea(r.category_name),
    note: r.note ?? null,
  }));

  return {
    orderId,
    tableNumber: orderRow.table_number,
    origin: orderRow.is_delivery ? "delivery" : orderRow.origin,
    customerName: orderRow.customer_name ?? null,
    partySize: orderRow.party_size ?? null,
    waiter: orderRow.waiter ?? null,
    takeAway: !orderRow.is_delivery && !orderRow.table_number,
    openedAt: orderRow.opened_at,
    notes: orderRow.notes ?? null,
    items,
    areas: [...new Set(items.map((it) => it.area))],
    addition,
  };
}

// Marca como impresas las unidades que acaban de salir en una comanda (solo esas: si mientras
// se imprimía se agregó otra, queda pendiente para la próxima). Nunca pasa del total de la línea.
export async function markComandaPrinted(orderId: string, printed: { id: string; qty: number }[]) {
  for (const p of printed) {
    await getPool().query(
      `update gestion_order_items
         set comanda_printed_qty = case when comanda_printed_qty + $3 > qty then qty else comanda_printed_qty + $3 end
       where order_id = $1 and id = $2`,
      [orderId, p.id, p.qty]
    );
  }
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
  items: { name: string; qty: number; price: number; note: string | null }[];
  shippingCost: number;
  total: number;
  paymentMethod: string | null;
  payments: { method: string; amount: number; receivedAmount: number | null; changeAmount: number | null }[];
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
    `select product_name, price, qty, note from gestion_order_items where order_id = $1 order by id`,
    [orderId]
  );
  const items = itemRows.map((r) => ({
    name: r.product_name,
    qty: r.qty,
    price: toNumber(r.price),
    note: r.note ?? null,
  }));
  const shippingCost = toNumber(order.shipping_cost ?? 0);
  const itemsTotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const liveTotal = itemsTotal + (order.is_delivery ? shippingCost : 0);

  const { rows: paymentRows } = await pool.query(
    "select method, amount, received_amount, change_amount from gestion_order_payments where order_id = $1 order by created_at",
    [orderId]
  );
  const payments = paymentRows.map((r) => ({
    method: r.method,
    amount: toNumber(r.amount),
    receivedAmount: r.received_amount === null || r.received_amount === undefined ? null : toNumber(r.received_amount),
    changeAmount: r.change_amount === null || r.change_amount === undefined ? null : toNumber(r.change_amount),
  }));

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
    payments,
  };
}
