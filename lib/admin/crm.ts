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
}

// Un cliente puede existir en hasta 3 tablas independientes (fidelidad,
// datos de delivery, cuenta corriente heredada de Fudo) sin que ninguna
// sea "la" tabla maestra. En vez de elegir una como ancla (y perder a los
// clientes que solo están en las otras dos), se arma la lista de
// teléfonos únicos primero y después se completa cada uno con lo que haya
// en cada tabla.
export async function listCrmCustomers(): Promise<CrmCustomer[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    with phones as (
      select phone from gestion_loyalty_accounts
      union
      select phone from gestion_delivery_customers
      union
      select phone from gestion_customers where phone is not null and phone <> ''
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
      c.balance as cc_balance
    from phones p
    left join gestion_loyalty_accounts l on l.phone = p.phone
    left join gestion_delivery_customers d on d.phone = p.phone
    left join gestion_customers c on c.phone = p.phone
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
  }));
}
