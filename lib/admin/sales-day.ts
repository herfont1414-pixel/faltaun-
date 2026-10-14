import { getPool } from "@/lib/admin/db";
import { businessDayKey } from "@/lib/admin/business-day";

// Ventas de una JORNADA del local: de 6:00 a 6:00 del día siguiente (hora de Argentina),
// así lo que se cobra a la 1 de la madrugada queda en la noche a la que pertenece.
// Solo lectura: lista cada venta cobrada con su mesa/origen, mozo, quién cobró, ítems y
// pagos, y los totales por origen, por mesa y por medio de pago.

export const JORNADA_START_HOUR = 6;

export type SaleKind = "mesa" | "mostrador" | "delivery" | "web" | "whatsapp";

export const SALE_KIND_LABEL: Record<SaleKind, string> = {
  mesa: "Mesas",
  mostrador: "Mostrador",
  delivery: "Delivery",
  web: "Web (retiro)",
  whatsapp: "WhatsApp (retiro)",
};

export interface SaleItem {
  name: string;
  qty: number;
  price: number;
  note: string | null;
}

export interface SaleRow {
  id: string;
  kind: SaleKind;
  label: string; // "Mesa 12", "Mostrador", "Delivery · Juan"…
  tableNumber: number | null;
  zone: string | null;
  waiter: string | null;
  partySize: number | null;
  customerName: string | null;
  openedAt: string;
  closedAt: string | null;
  total: number;
  payments: { method: string; amount: number }[];
  closedBy: string | null;
  notes: string | null;
  items: SaleItem[];
}

export interface SalesDay {
  day: string;
  from: string;
  to: string;
  isToday: boolean;
  total: number;
  count: number;
  avgTicket: number;
  byKind: { kind: SaleKind; label: string; total: number; count: number }[];
  byTable: { tableNumber: number; zone: string | null; total: number; count: number; people: number }[];
  byPayment: { method: string; total: number; count: number }[];
  byWaiter: { waiter: string; total: number; count: number }[];
  sales: SaleRow[];
  open: SaleRow[]; // en curso ahora (solo para la jornada actual)
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Jornada que contiene a `now` (antes de las 6:00 todavía es la del día anterior). */
export function jornadaKey(now: Date = new Date()) {
  return businessDayKey(new Date(now.getTime() - JORNADA_START_HOUR * 3600_000));
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 6:00 en Argentina (UTC-3) = 9:00 UTC.
const jornadaStart = (day: string) => new Date(`${day}T${String(JORNADA_START_HOUR + 3).padStart(2, "0")}:00:00.000Z`);

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const num = (v: unknown) => (typeof v === "string" ? parseFloat(v) : Number(v ?? 0));
const ZONE_LABEL: Record<string, string> = { salon: "Salón", terraza: "Terraza" };
const zoneLabel = (z: string | null) => (z ? ZONE_LABEL[z] ?? z.charAt(0).toUpperCase() + z.slice(1) : null);

function kindOf(r: { table_number: unknown; is_delivery: unknown; channel: unknown; origin: unknown }): SaleKind {
  if (r.table_number !== null && r.table_number !== undefined) return "mesa";
  if (r.is_delivery === true || r.is_delivery === 1) return "delivery";
  if (r.channel === "web") return "web";
  if (r.channel === "whatsapp") return "whatsapp";
  return r.origin === "mesa" ? "mesa" : "mostrador";
}

function labelOf(kind: SaleKind, tableNumber: number | null, customer: string | null, channel: unknown) {
  if (kind === "mesa") return tableNumber ? `Mesa ${tableNumber}` : "Mesa";
  const who = customer ? ` · ${customer}` : "";
  if (kind === "delivery") return `Delivery${channel === "web" ? " (web)" : ""}${who}`;
  if (kind === "web") return `Web · retiro${who}`;
  if (kind === "whatsapp") return `WhatsApp · retiro${who}`;
  return `Mostrador${who}`;
}

const ORDER_COLUMNS = `
  o.id, t.number as table_number, z.name as zone, o.origin, o.channel, o.is_delivery,
  coalesce(o.customer_name, c.name) as customer_name, o.waiter, o.party_size,
  o.opened_at, o.closed_at, o.total, o.notes`;
const ORDER_JOINS = `
  from gestion_orders o
  left join gestion_tables t on t.id = o.table_id
  left join gestion_zones z on z.id = t.zone_id
  left join gestion_customers c on c.id = o.customer_id`;

export async function getSalesDay(day: string, now: Date = new Date()): Promise<SalesDay> {
  if (!DAY.test(day)) throw new Error("Fecha inválida");
  const pool = getPool();
  const from = jornadaStart(day).toISOString();
  const to = jornadaStart(addDays(day, 1)).toISOString();
  const isToday = day === jornadaKey(now);

  const closedWhere = "where o.status = 'cerrada' and o.closed_at >= $1 and o.closed_at < $2";
  const { rows: orderRows } = await pool.query(`select ${ORDER_COLUMNS} ${ORDER_JOINS} ${closedWhere} order by o.closed_at desc`, [from, to]);
  const { rows: itemRows } = await pool.query(
    `select oi.order_id, oi.product_name, oi.price, oi.qty, oi.note
     from gestion_order_items oi join gestion_orders o on o.id = oi.order_id
     ${closedWhere} order by oi.order_id`,
    [from, to]
  );
  const { rows: payRows } = await pool.query(
    `select p.order_id, p.method, p.amount
     from gestion_order_payments p join gestion_orders o on o.id = p.order_id
     ${closedWhere}`,
    [from, to]
  );
  // Quién cobró: no hay columna "cerrado por"; se toma de la auditoría del cobro.
  const { rows: closerRows } = await pool.query(
    `select a.entity_id, u.name as user_name
     from gestion_audit_log a
     join gestion_orders o on cast(o.id as text) = a.entity_id
     left join gestion_users u on u.id = a.user_id
     ${closedWhere} and a.action = 'order_close'`,
    [from, to]
  );

  const itemsBy = new Map<string, SaleItem[]>();
  for (const r of itemRows) {
    const list = itemsBy.get(String(r.order_id)) ?? [];
    list.push({ name: r.product_name, qty: num(r.qty), price: num(r.price), note: r.note ?? null });
    itemsBy.set(String(r.order_id), list);
  }
  const paysBy = new Map<string, { method: string; amount: number }[]>();
  for (const r of payRows) {
    const list = paysBy.get(String(r.order_id)) ?? [];
    list.push({ method: r.method, amount: num(r.amount) });
    paysBy.set(String(r.order_id), list);
  }
  const closerBy = new Map<string, string>();
  for (const r of closerRows) if (r.user_name) closerBy.set(String(r.entity_id), r.user_name);

  const toSale = (r: any, items: SaleItem[], total: number): SaleRow => {
    const kind = kindOf(r);
    const tableNumber = r.table_number === null || r.table_number === undefined ? null : Number(r.table_number);
    return {
      id: String(r.id),
      kind,
      label: labelOf(kind, tableNumber, r.customer_name ?? null, r.channel),
      tableNumber,
      zone: zoneLabel(r.zone ?? null),
      waiter: r.waiter ?? null,
      partySize: r.party_size === null || r.party_size === undefined ? null : Number(r.party_size),
      customerName: r.customer_name ?? null,
      openedAt: iso(r.opened_at)!,
      closedAt: iso(r.closed_at),
      total,
      payments: paysBy.get(String(r.id)) ?? [],
      closedBy: closerBy.get(String(r.id)) ?? null,
      notes: r.notes ?? null,
      items,
    };
  };
  const sales = orderRows.map((r) => toSale(r, itemsBy.get(String(r.id)) ?? [], num(r.total)));

  // En curso (solo en la jornada actual): pedidos abiertos ahora, con su total parcial.
  let open: SaleRow[] = [];
  if (isToday) {
    const { rows: openRows } = await pool.query(`select ${ORDER_COLUMNS} ${ORDER_JOINS} where o.status = 'abierta' order by o.opened_at`);
    const { rows: openItems } = await pool.query(
      `select oi.order_id, oi.product_name, oi.price, oi.qty, oi.note
       from gestion_order_items oi join gestion_orders o on o.id = oi.order_id
       where o.status = 'abierta'`
    );
    const openBy = new Map<string, SaleItem[]>();
    for (const r of openItems) {
      const list = openBy.get(String(r.order_id)) ?? [];
      list.push({ name: r.product_name, qty: num(r.qty), price: num(r.price), note: r.note ?? null });
      openBy.set(String(r.order_id), list);
    }
    open = openRows
      .map((r) => {
        const items = openBy.get(String(r.id)) ?? [];
        return toSale(r, items, items.reduce((s, it) => s + it.price * it.qty, 0));
      })
      .filter((s) => s.items.length > 0 || s.kind === "mesa");
  }

  const total = sales.reduce((s, o) => s + o.total, 0);
  const count = sales.length;

  const kindMap = new Map<SaleKind, { total: number; count: number }>();
  const tableMap = new Map<number, { zone: string | null; total: number; count: number; people: number }>();
  const payMap = new Map<string, { total: number; count: number }>();
  const waiterMap = new Map<string, { total: number; count: number }>();
  for (const s of sales) {
    const k = kindMap.get(s.kind) ?? { total: 0, count: 0 };
    k.total += s.total;
    k.count += 1;
    kindMap.set(s.kind, k);
    if (s.tableNumber !== null) {
      const t = tableMap.get(s.tableNumber) ?? { zone: s.zone, total: 0, count: 0, people: 0 };
      t.total += s.total;
      t.count += 1;
      t.people += s.partySize ?? 0;
      tableMap.set(s.tableNumber, t);
    }
    for (const p of s.payments) {
      const m = payMap.get(p.method) ?? { total: 0, count: 0 };
      m.total += p.amount;
      m.count += 1;
      payMap.set(p.method, m);
    }
    if (s.kind === "mesa") {
      const name = s.waiter?.trim() || "Sin mozo asignado";
      const w = waiterMap.get(name) ?? { total: 0, count: 0 };
      w.total += s.total;
      w.count += 1;
      waiterMap.set(name, w);
    }
  }

  return {
    day,
    from,
    to,
    isToday,
    total,
    count,
    avgTicket: count ? total / count : 0,
    byKind: [...kindMap.entries()]
      .map(([kind, v]) => ({ kind, label: SALE_KIND_LABEL[kind], ...v }))
      .sort((a, b) => b.total - a.total),
    byTable: [...tableMap.entries()].map(([tableNumber, v]) => ({ tableNumber, ...v })).sort((a, b) => a.tableNumber - b.tableNumber),
    byPayment: [...payMap.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.total - a.total),
    byWaiter: [...waiterMap.entries()].map(([waiter, v]) => ({ waiter, ...v })).sort((a, b) => b.total - a.total),
    sales,
    open,
  };
}
