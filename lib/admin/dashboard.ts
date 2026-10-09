import { getPool } from "@/lib/admin/db";
import { sumExpenses } from "@/lib/admin/expenses";
import { getCurrentShift } from "@/lib/admin/shifts";

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

export interface Alert {
  type:
    | "stock_critico"
    | "costo_ingrediente_subio"
    | "margen_bajo"
    | "caja_con_diferencia"
    | "pedido_pendiente";
  message: string;
}

export interface DashboardSummary {
  ventasHoy: number;
  pedidosHoy: number;
  ticketPromedio: number;
  costoMercaderiaEstimado: number;
  margenBrutoEstimado: number | null;
  gastosHoy: number;
  resultadoOperativoEstimado: number | null;
  cajaEsperada: number | null;
  turnoAbierto: boolean;
  pedidosDeliveryHoy: number;
  clientesNuevosHoy: number;
  topVendidos: { name: string; qty: number; revenue: number }[];
  masRentables: { name: string; qty: number; marginTotal: number; marginPct: number }[];
  pocoVolumenPocoMargen: { name: string; qty: number; marginPct: number }[];
  alertas: Alert[];
}

const STOCK_CRITICO_UMBRAL = 3;
const MARGEN_BAJO_UMBRAL_PCT = 20;
const CAJA_DIFERENCIA_UMBRAL = 1000;
const PEDIDO_PENDIENTE_MINUTOS = 20;

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const pool = getPool();
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const fromISO = from.toISOString();
  const toISO = now.toISOString();

  const { rows: orderRows } = await pool.query<{ id: string; total: string | number; is_delivery: boolean }>(
    `select id, total, is_delivery from gestion_orders
     where status = 'cerrada' and closed_at >= $1 and closed_at <= $2`,
    [fromISO, toISO]
  );
  const ventasHoy = orderRows.reduce((sum, o) => sum + money(o.total), 0);
  const pedidosHoy = orderRows.length;
  const ticketPromedio = pedidosHoy > 0 ? ventasHoy / pedidosHoy : 0;
  const pedidosDeliveryHoy = orderRows.filter((o) => o.is_delivery).length;

  const gastosHoy = await sumExpenses(fromISO, toISO);

  // Costo de mercadería: solo se puede estimar para los ítems vendidos que
  // tienen una receta cargada (Fase 7) — el costo se recalcula con el costo
  // ACTUAL de cada ingrediente, no el que tenía el día de la venta, porque
  // no se guarda un costo histórico por venta. Si ningún ítem vendido hoy
  // tiene receta, no se inventa un número: queda en null.
  const { rows: itemRows } = await pool.query<{
    product_id: number | null;
    product_name: string;
    price: string | number;
    qty: number;
  }>(
    `select oi.product_id, oi.product_name, oi.price, oi.qty
     from gestion_order_items oi
     join gestion_orders o on o.id = oi.order_id
     where o.status = 'cerrada' and o.closed_at >= $1 and o.closed_at <= $2`,
    [fromISO, toISO]
  );

  const { rows: recipeCostRows } = await pool.query<{ product_id: number; cost_total: string | number }>(
    `select r.product_id, sum(ri.quantity * i.cost) as cost_total
     from gestion_recipes r
     join gestion_recipe_items ri on ri.recipe_id = r.id
     join gestion_ingredients i on i.id = ri.ingredient_id
     group by r.product_id`
  );
  const costPerProduct = new Map(recipeCostRows.map((r) => [r.product_id, money(r.cost_total)]));

  let costoMercaderiaEstimado = 0;
  let anyRecipeCost = false;
  const soldMap = new Map<
    string,
    { qty: number; revenue: number; unitCost: number | null; productId: number | null }
  >();
  for (const it of itemRows) {
    const entry = soldMap.get(it.product_name) ?? {
      qty: 0,
      revenue: 0,
      unitCost: it.product_id != null ? costPerProduct.get(it.product_id) ?? null : null,
      productId: it.product_id,
    };
    entry.qty += it.qty;
    entry.revenue += money(it.price) * it.qty;
    soldMap.set(it.product_name, entry);
    if (entry.unitCost !== null) {
      costoMercaderiaEstimado += entry.unitCost * it.qty;
      anyRecipeCost = true;
    }
  }

  const margenBrutoEstimado = anyRecipeCost ? ventasHoy - costoMercaderiaEstimado : null;
  const resultadoOperativoEstimado = margenBrutoEstimado !== null ? margenBrutoEstimado - gastosHoy : null;

  const shift = await getCurrentShift();

  const { rows: newCustomerRows } = await pool.query<{ count: string | number }>(
    `select count(*) as count from gestion_delivery_customers where created_at >= $1 and created_at <= $2`,
    [fromISO, toISO]
  );
  const clientesNuevosHoy = Number(newCustomerRows[0]?.count ?? 0);

  const topVendidos = [...soldMap.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  const rentables = [...soldMap.entries()]
    .filter(([, v]) => v.unitCost !== null)
    .map(([name, v]) => {
      const marginUnit = money(v.revenue) / v.qty - (v.unitCost ?? 0);
      const marginTotal = marginUnit * v.qty;
      const unitPrice = v.revenue / v.qty;
      const marginPct = unitPrice > 0 ? (marginUnit / unitPrice) * 100 : 0;
      return { name, qty: v.qty, marginTotal, marginPct };
    });
  const masRentables = [...rentables].sort((a, b) => b.marginTotal - a.marginTotal).slice(0, 8);
  const pocoVolumenPocoMargen = rentables
    .filter((r) => r.marginPct < MARGEN_BAJO_UMBRAL_PCT && r.qty <= 3)
    .sort((a, b) => a.marginPct - b.marginPct)
    .slice(0, 8);

  const alertas: Alert[] = [];

  const { rows: criticalStockRows } = await pool.query<{ name: string; stock_qty: number }>(
    `select name, stock_qty from gestion_products
     where active = true and stock_qty is not null and stock_qty <= $1
     order by stock_qty asc limit 10`,
    [STOCK_CRITICO_UMBRAL]
  );
  for (const p of criticalStockRows) {
    alertas.push({ type: "stock_critico", message: `${p.name}: quedan ${p.stock_qty} unidades` });
  }

  const { rows: recentCostIncreases } = await pool.query<{ name: string; old_cost: string | number; new_cost: string | number }>(
    `select i.name,
            (select cost from gestion_ingredient_price_history h2
             where h2.ingredient_id = i.id order by h2.created_at desc limit 1 offset 1) as old_cost,
            i.cost as new_cost
     from gestion_ingredients i
     where i.id in (
       select ingredient_id from gestion_ingredient_price_history
       where created_at >= $1
     )`,
    [fromISO]
  );
  for (const r of recentCostIncreases) {
    if (r.old_cost == null) continue;
    if (money(r.new_cost) > money(r.old_cost)) {
      alertas.push({
        type: "costo_ingrediente_subio",
        message: `${r.name}: de ${money(r.old_cost)} a ${money(r.new_cost)}`,
      });
    }
  }

  for (const r of rentables) {
    if (r.marginPct < MARGEN_BAJO_UMBRAL_PCT) {
      alertas.push({ type: "margen_bajo", message: `${r.name}: margen de ${r.marginPct.toFixed(0)}%` });
    }
  }

  const { rows: lastClosedShift } = await pool.query<{ difference: string | number | null }>(
    "select difference from gestion_shifts where status = 'cerrado' order by closed_at desc limit 1"
  );
  if (lastClosedShift[0]?.difference != null && Math.abs(money(lastClosedShift[0].difference)) >= CAJA_DIFERENCIA_UMBRAL) {
    const diff = money(lastClosedShift[0].difference);
    alertas.push({
      type: "caja_con_diferencia",
      message: `Último cierre de caja: ${diff < 0 ? "faltante" : "sobrante"} de ${Math.abs(diff)}`,
    });
  }

  const pendingThreshold = new Date(now.getTime() - PEDIDO_PENDIENTE_MINUTOS * 60000).toISOString();
  const { rows: pendingWeb } = await pool.query<{ count: string | number }>(
    "select count(*) as count from gestion_web_orders where status = 'pendiente' and created_at <= $1",
    [pendingThreshold]
  );
  if (Number(pendingWeb[0]?.count ?? 0) > 0) {
    alertas.push({
      type: "pedido_pendiente",
      message: `${pendingWeb[0].count} pedido(s) web esperan respuesta hace más de ${PEDIDO_PENDIENTE_MINUTOS} min`,
    });
  }

  return {
    ventasHoy,
    pedidosHoy,
    ticketPromedio,
    costoMercaderiaEstimado,
    margenBrutoEstimado,
    gastosHoy,
    resultadoOperativoEstimado,
    cajaEsperada: shift?.expectedCash ?? null,
    turnoAbierto: shift !== null,
    pedidosDeliveryHoy,
    clientesNuevosHoy,
    topVendidos,
    masRentables,
    pocoVolumenPocoMargen,
    alertas,
  };
}
