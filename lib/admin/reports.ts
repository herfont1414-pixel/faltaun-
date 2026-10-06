import { getPool } from "@/lib/admin/db";
import type { OrderOrigin, PaymentMethod, SalesReport } from "@/lib/admin/types";

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

export async function getSalesReport(fromISO: string, toISO: string): Promise<SalesReport> {
  const pool = getPool();

  const { rows: orderRows } = await pool.query<{
    payment_method: PaymentMethod | null;
    total: string | number;
  }>(
    `select payment_method, total from gestion_orders
     where status = 'cerrada' and closed_at >= $1 and closed_at <= $2`,
    [fromISO, toISO]
  );

  let totalSales = 0;
  const byMethodMap = new Map<string, { total: number; count: number }>();
  for (const o of orderRows) {
    const total = money(o.total);
    totalSales += total;
    const key = o.payment_method ?? "sin_definir";
    const entry = byMethodMap.get(key) ?? { total: 0, count: 0 };
    entry.total += total;
    entry.count += 1;
    byMethodMap.set(key, entry);
  }
  const orderCount = orderRows.length;
  const avgTicket = orderCount > 0 ? totalSales / orderCount : 0;
  const byPaymentMethod = [...byMethodMap.entries()]
    .map(([method, v]) => ({ method: method as PaymentMethod | "sin_definir", total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);

  const { rows: itemRows } = await pool.query<{
    product_name: string;
    price: string | number;
    qty: number;
  }>(
    `select oi.product_name, oi.price, oi.qty
     from gestion_order_items oi
     join gestion_orders o on o.id = oi.order_id
     where o.status = 'cerrada' and o.closed_at >= $1 and o.closed_at <= $2`,
    [fromISO, toISO]
  );

  const productMap = new Map<string, { qty: number; revenue: number }>();
  for (const it of itemRows) {
    const entry = productMap.get(it.product_name) ?? { qty: 0, revenue: 0 };
    entry.qty += it.qty;
    entry.revenue += money(it.price) * it.qty;
    productMap.set(it.product_name, entry);
  }
  const topProducts = [...productMap.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15);

  const { rows: categoryRows } = await pool.query<{ name: string; category: string | null }>(
    `select p.name, c.name as category
     from gestion_products p
     join gestion_categories c on c.id = p.category_id`
  );
  const categoryByName = new Map(categoryRows.map((r) => [r.name, r.category]));

  const byCategoryMap = new Map<string, number>();
  for (const it of itemRows) {
    const category = categoryByName.get(it.product_name) ?? "Otros";
    byCategoryMap.set(category, (byCategoryMap.get(category) ?? 0) + money(it.price) * it.qty);
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const { rows: orderDetailRows } = await pool.query<{
    id: string;
    opened_at: string;
    closed_at: string;
    origin: OrderOrigin;
    table_number: number | null;
    payment_method: PaymentMethod | null;
    customer_name: string | null;
    total: string | number;
  }>(
    `select o.id, o.opened_at, o.closed_at, o.origin, t.number as table_number,
            o.payment_method, c.name as customer_name, o.total
     from gestion_orders o
     left join gestion_tables t on t.id = o.table_id
     left join gestion_customers c on c.id = o.customer_id
     where o.status = 'cerrada' and o.closed_at >= $1 and o.closed_at <= $2
     order by o.closed_at desc`,
    [fromISO, toISO]
  );
  const orders = orderDetailRows.map((o) => ({
    id: o.id,
    openedAt: o.opened_at,
    closedAt: o.closed_at,
    origin: o.origin,
    tableNumber: o.table_number,
    paymentMethod: o.payment_method,
    customerName: o.customer_name,
    total: money(o.total),
  }));

  return {
    from: fromISO,
    to: toISO,
    totalSales,
    orderCount,
    avgTicket,
    byPaymentMethod,
    topProducts,
    byCategory,
    orders,
  };
}
