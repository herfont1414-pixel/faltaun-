import { getPool } from "@/lib/admin/db";

function money(value: string | number | null) {
  if (value === null) return 0;
  return typeof value === "string" ? parseFloat(value) : value;
}

export interface CrmCustomer {
  phone: string;
  name: string | null;
  address: string | null;
  stamps: number;
  orderCount: number;
  totalSpent: number;
  origin: string | null;
  cuentaCorriente: boolean;
  ccBalance: number | null;
  lastOrderAt: string | null;
  // Pedidos cobrados en el panel con este teléfono (incluye los web, que se cobran ahí).
  posOrders: number;
  posSpent: number;
}

// Un cliente puede existir en hasta 3 tablas independientes (fidelidad,
// datos de delivery, cuenta corriente heredada de Fudo) sin que ninguna
// sea "la" tabla maestra. En vez de elegir una como ancla (y perder a los
// clientes que solo están en las otras dos), se arma la lista de
// teléfonos únicos primero y después se completa cada uno con lo que haya
// en cada tabla. "Última compra" se calcula por separado, comparando el
// último pedido de mesa/mostrador (con teléfono, ej. delivery) contra el
// último pedido web — con un CASE explícito en vez de max(a,b), porque esa
// función multi-argumento trata los NULL distinto en Postgres y SQLite.
export async function listCrmCustomers(): Promise<CrmCustomer[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    with phones as (
      select phone from gestion_loyalty_accounts
      union
      select phone from gestion_delivery_customers
      union
      select phone from gestion_customers where phone is not null and phone <> ''
    ),
    last_orders as (
      select customer_phone as phone, max(closed_at) as last_at, count(*) as n, sum(total) as spent
      from gestion_orders
      where customer_phone is not null and status = 'cerrada'
      group by customer_phone
    ),
    last_web_orders as (
      select customer_phone as phone, max(created_at) as last_at
      from gestion_web_orders
      group by customer_phone
    )
    select
      p.phone,
      coalesce(l.name, d.name, c.name) as name,
      d.address,
      coalesce(l.stamps, 0) as stamps,
      coalesce(l.order_count, 0) as order_count,
      coalesce(l.total_spent, 0) as total_spent,
      l.origin,
      coalesce(c.cuenta_corriente, false) as cuenta_corriente,
      c.balance as cc_balance,
      case
        when lo.last_at is null then lw.last_at
        when lw.last_at is null then lo.last_at
        when lo.last_at > lw.last_at then lo.last_at
        else lw.last_at
      end as last_order_at,
      coalesce(lo.n, 0) as pos_orders,
      coalesce(lo.spent, 0) as pos_spent
    from phones p
    left join gestion_loyalty_accounts l on l.phone = p.phone
    left join gestion_delivery_customers d on d.phone = p.phone
    left join gestion_customers c on c.phone = p.phone
    left join last_orders lo on lo.phone = p.phone
    left join last_web_orders lw on lw.phone = p.phone
    order by coalesce(l.total_spent, 0) desc, coalesce(l.order_count, 0) desc, p.phone
  `);
  return rows.map((r) => ({
    phone: r.phone,
    name: r.name,
    address: r.address,
    stamps: r.stamps,
    orderCount: r.order_count,
    totalSpent: money(r.total_spent),
    origin: r.origin,
    cuentaCorriente: !!r.cuenta_corriente,
    ccBalance: r.cc_balance === null || r.cc_balance === undefined ? null : money(r.cc_balance),
    lastOrderAt: r.last_order_at ?? null,
    posOrders: Number(r.pos_orders ?? 0),
    posSpent: money(r.pos_spent ?? 0),
  }));
}

export interface DirectoryCustomer {
  name: string;
  phone: string | null;
  address: string | null;
  orders: number;
  spent: number;
  stamps: number;
  lastOrderAt: string | null;
  ccBalance: number | null;
}

// Clientes para el buscador al cargar un pedido (mesa, mostrador, delivery): los del CRM
// (fidelidad, delivery, cuentas corrientes) con sus compras, más los clientes de Fudo que
// no tienen teléfono (se buscan por nombre). Sin nombre no sirven para buscar.
export async function listCustomerDirectory(): Promise<DirectoryCustomer[]> {
  const crm = await listCrmCustomers();
  const { rows } = await getPool().query(
    "select name, balance, cuenta_corriente from gestion_customers where active = true and (phone is null or phone = '')"
  );
  const out: DirectoryCustomer[] = crm
    .filter((c) => c.name && c.name.trim())
    .map((c) => ({
      name: c.name!.trim(),
      phone: c.phone,
      address: c.address,
      orders: Math.max(c.orderCount, c.posOrders),
      spent: Math.max(c.totalSpent, c.posSpent),
      stamps: Number(c.stamps),
      lastOrderAt: c.lastOrderAt,
      ccBalance: c.cuentaCorriente ? c.ccBalance : null,
    }));
  for (const r of rows) {
    if (!r.name || !String(r.name).trim()) continue;
    out.push({
      name: String(r.name).trim(),
      phone: null,
      address: null,
      orders: 0,
      spent: 0,
      stamps: 0,
      lastOrderAt: null,
      ccBalance: r.cuenta_corriente ? money(r.balance) : null,
    });
  }
  return out;
}
