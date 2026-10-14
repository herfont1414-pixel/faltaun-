import { readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "@/lib/admin/db";
import { drinkGroupLabel, drinkGroupOf, isDrinksCategory } from "@/lib/admin/drink-groups";

// Productos vendidos en un rango de días, uniendo:
//  - el historial de Fudo (data/historico-productos-fudo.json: totales diarios por
//    producto) para los días hasta el último día de ese archivo, y
//  - las ventas cobradas en MaderoSys desde el día siguiente.
// Nunca se suman las dos fuentes para un mismo día: así no hay doble conteo y los
// pedidos de prueba anteriores al arranque no se mezclan. Solo lectura.

type HistoryRow = [day: string, category: string, subcategory: string | null, product: string, qty: number, amount: number];
interface HistoryFile {
  source: string;
  from: string;
  to: string;
  rows: HistoryRow[];
}

export interface ProductSalesRow {
  name: string;
  category: string;
  qty: number;
  revenue: number;
  share: number; // % de los ingresos del rango
  sources: ("fudo" | "sistema")[];
}

export interface ProductSalesReport {
  from: string;
  to: string;
  historyFrom: string | null;
  historyUntil: string | null;
  rows: ProductSalesRow[];
  byCategory: { category: string; qty: number; revenue: number; share: number }[];
  totalQty: number;
  totalRevenue: number;
  fudoRevenue: number;
  systemRevenue: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

let historyCache: HistoryFile | null = null;
export function loadFudoHistory(): HistoryFile {
  if (historyCache) return historyCache;
  try {
    const raw = readFileSync(path.join(process.cwd(), "data", "historico-productos-fudo.json"), "utf-8");
    historyCache = JSON.parse(raw) as HistoryFile;
  } catch {
    historyCache = { source: "", from: "", to: "", rows: [] };
  }
  return historyCache;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const titleCase = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(/])([a-zñáéíóú])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());

// 00:00 en Argentina (UTC-3, sin horario de verano) del día AAAA-MM-DD.
const dayStart = (day: string) => new Date(`${day}T03:00:00.000Z`);
function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Bebidas se muestra con su grupo (igual que en Productos): "Bebidas · Cervezas".
function displayCategory(category: string, productName: string) {
  return isDrinksCategory(category) ? `${category} · ${drinkGroupLabel(drinkGroupOf(productName))}` : category;
}

export async function getProductSales(from: string, to: string): Promise<ProductSalesReport> {
  if (!DAY.test(from) || !DAY.test(to)) throw new Error("Fechas inválidas");
  if (from > to) [from, to] = [to, from];

  const pool = getPool();
  // Catálogo actual: nombre y categoría con los que se muestran también las ventas de Fudo.
  const { rows: catalogRows } = await pool.query<{ name: string; category: string }>(
    `select p.name, c.name as category
     from gestion_products p
     join gestion_categories c on c.id = p.category_id`
  );
  const byKey = new Map<string, { name: string; category: string }>();
  for (const r of catalogRows) if (!byKey.has(normalize(r.name))) byKey.set(normalize(r.name), r);
  const categoryByKey = new Map<string, string>();
  for (const r of catalogRows) categoryByKey.set(normalize(r.category), r.category);

  const agg = new Map<string, { name: string; category: string; qty: number; revenue: number; sources: Set<"fudo" | "sistema"> }>();
  function add(rawName: string, rawCategory: string | null, qty: number, revenue: number, source: "fudo" | "sistema") {
    const key = normalize(rawName);
    const known = byKey.get(key);
    const name = known?.name ?? titleCase(rawName);
    let category: string;
    if (known) category = known.category;
    else if (!rawCategory) category = "Otros";
    else if (normalize(rawCategory) === "v") category = "Envíos"; // "DELIVERY PUEBLO" en Fudo
    else category = categoryByKey.get(normalize(rawCategory)) ?? titleCase(rawCategory);
    category = displayCategory(category, name);
    const entry = agg.get(key) ?? { name, category, qty: 0, revenue: 0, sources: new Set() };
    entry.qty += qty;
    entry.revenue += revenue;
    entry.sources.add(source);
    agg.set(key, entry);
  }

  // 1) Historial de Fudo: días del rango hasta el último día del archivo.
  const history = loadFudoHistory();
  const historyUntil = history.to || null;
  let fudoRevenue = 0;
  for (const [day, category, , product, qty, amount] of history.rows) {
    if (day < from || day > to) continue;
    add(product, category, Number(qty), Number(amount), "fudo");
    fudoRevenue += Number(amount);
  }

  // 2) MaderoSys: desde el día siguiente al historial.
  let systemRevenue = 0;
  const liveFrom = historyUntil && addDays(historyUntil, 1) > from ? addDays(historyUntil, 1) : from;
  if (liveFrom <= to) {
    const { rows: items } = await pool.query<{ product_name: string; price: string | number; qty: number }>(
      `select oi.product_name, oi.price, oi.qty
       from gestion_order_items oi
       join gestion_orders o on o.id = oi.order_id
       where o.status = 'cerrada' and o.closed_at >= $1 and o.closed_at < $2`,
      [dayStart(liveFrom).toISOString(), dayStart(addDays(to, 1)).toISOString()]
    );
    for (const it of items) {
      const revenue = Number(it.price) * Number(it.qty);
      add(it.product_name, null, Number(it.qty), revenue, "sistema");
      systemRevenue += revenue;
    }
  }

  const totalRevenue = fudoRevenue + systemRevenue;
  const pct = (v: number) => (totalRevenue > 0 ? Math.round((v / totalRevenue) * 1000) / 10 : 0);
  const rows = [...agg.values()]
    .map((e) => ({
      name: e.name,
      category: e.category,
      qty: Math.round(e.qty * 100) / 100,
      revenue: Math.round(e.revenue * 100) / 100,
      share: pct(e.revenue),
      sources: [...e.sources].sort(),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || a.name.localeCompare(b.name));

  const catMap = new Map<string, { qty: number; revenue: number }>();
  for (const r of rows) {
    const c = catMap.get(r.category) ?? { qty: 0, revenue: 0 };
    c.qty += r.qty;
    c.revenue += r.revenue;
    catMap.set(r.category, c);
  }
  const byCategory = [...catMap.entries()]
    .map(([category, v]) => ({ category, qty: v.qty, revenue: v.revenue, share: pct(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    from,
    to,
    historyFrom: history.from || null,
    historyUntil,
    rows,
    byCategory,
    totalQty: rows.reduce((s, r) => s + r.qty, 0),
    totalRevenue,
    fudoRevenue,
    systemRevenue,
  };
}
