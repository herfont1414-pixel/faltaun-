import { getPool } from "@/lib/admin/db";
import { sumExpenses } from "@/lib/admin/expenses";
import type { OrderOrigin, PaymentMethod, SalesReport } from "@/lib/admin/types";

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

export async function getSalesReport(fromISO: string, toISO: string): Promise<SalesReport> {
  const pool = getPool();

  const { rows: orderRows } = await pool.query<{ total: string | number }>(
    `select total from gestion_orders
     where status = 'cerrada' and closed_at >= $1 and closed_at <= $2`,
    [fromISO, toISO]
  );
  const totalSales = orderRows.reduce((sum, o) => sum + money(o.total), 0);
  const orderCount = orderRows.length;
  const avgTicket = orderCount > 0 ? totalSales / orderCount : 0;

  // Desde gestion_order_payments, no desde gestion_orders.payment_method:
  // una venta puede estar pagada con varios medios combinados.
  const { rows: paymentRows } = await pool.query<{ method: PaymentMethod; total: string | number; count: string }>(
    `select gop.method, sum(gop.amount) as total, count(*) as count
     from gestion_order_payments gop
     join gestion_orders o on o.id = gop.order_id
     where o.status = 'cerrada' and o.closed_at >= $1 and o.closed_at <= $2
     group by gop.method`,
    [fromISO, toISO]
  );
  const byPaymentMethod = paymentRows
    .map((r) => ({ method: r.method, total: money(r.total), count: Number(r.count) }))
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

  const totalExpenses = await sumExpenses(fromISO, toISO);

  // Costo y margen bruto estimados: solo sobre los ítems del rango que
  // tienen una receta cargada (Fase 7), usando el costo ACTUAL de cada
  // ingrediente — igual criterio que el dashboard de hoy (Fase 12). Si
  // ningún ítem del rango tiene receta, queda en null en vez de un cero
  // engañoso.
  const { rows: recipeCostRows } = await pool.query<{ product_id: number; cost_total: string | number }>(
    `select r.product_id, sum(ri.quantity * i.cost) as cost_total
     from gestion_recipes r
     join gestion_recipe_items ri on ri.recipe_id = r.id
     join gestion_ingredients i on i.id = ri.ingredient_id
     group by r.product_id`
  );
  const costPerProduct = new Map(recipeCostRows.map((r) => [r.product_id, money(r.cost_total)]));

  const { rows: costItemRows } = await pool.query<{ product_id: number | null; qty: number }>(
    `select oi.product_id, oi.qty
     from gestion_order_items oi
     join gestion_orders o on o.id = oi.order_id
     where o.status = 'cerrada' and o.closed_at >= $1 and o.closed_at <= $2`,
    [fromISO, toISO]
  );
  let costoMercaderiaEstimado = 0;
  let anyRecipeCost = false;
  for (const it of costItemRows) {
    if (it.product_id == null) continue;
    const unitCost = costPerProduct.get(it.product_id);
    if (unitCost === undefined) continue;
    costoMercaderiaEstimado += unitCost * it.qty;
    anyRecipeCost = true;
  }
  const margenBrutoEstimado = anyRecipeCost ? totalSales - costoMercaderiaEstimado : null;
  const resultadoOperativoEstimado = margenBrutoEstimado !== null ? margenBrutoEstimado - totalExpenses : null;

  // Ventas por empleado: no existe una columna "cerrado por" en
  // gestion_orders, así que se reconstruye desde la auditoría (Fase 3),
  // que ya registra quién cerró cada pedido (action = 'order_close').
  const { rows: employeeRows } = await pool.query<{ user_name: string | null; total: string | number; count: string }>(
    `select u.name as user_name, sum(o.total) as total, count(*) as count
     from gestion_audit_log a
     join gestion_orders o on cast(o.id as text) = a.entity_id
     left join gestion_users u on u.id = a.user_id
     where a.action = 'order_close' and o.status = 'cerrada'
       and o.closed_at >= $1 and o.closed_at <= $2
     group by u.name`,
    [fromISO, toISO]
  );
  const byEmployee = employeeRows
    .map((r) => ({ userName: r.user_name ?? "Sin usuario", orderCount: Number(r.count), total: money(r.total) }))
    .sort((a, b) => b.total - a.total);

  return {
    from: fromISO,
    to: toISO,
    totalSales,
    orderCount,
    avgTicket,
    byPaymentMethod,
    topProducts,
    byCategory,
    byEmployee,
    orders,
    totalExpenses,
    netTotal: totalSales - totalExpenses,
    costoMercaderiaEstimado: anyRecipeCost ? costoMercaderiaEstimado : null,
    margenBrutoEstimado,
    resultadoOperativoEstimado,
  };
}
