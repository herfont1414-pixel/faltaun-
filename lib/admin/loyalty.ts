import { getPool } from "@/lib/admin/db";

export const LOYALTY_THRESHOLD = 10;

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

export interface LoyaltyAccount {
  phone: string;
  name: string | null;
  stamps: number;
  redeemed: number;
  orderCount: number;
  totalSpent: number;
  rewardsAvailable: number;
  stampsToNextReward: number;
}

function toAccount(row: {
  phone: string;
  name: string | null;
  stamps: number;
  redeemed: number;
  order_count: number;
  total_spent: string | number;
}): LoyaltyAccount {
  const rewardsAvailable = Math.floor(row.stamps / LOYALTY_THRESHOLD) - row.redeemed;
  const stampsToNextReward = LOYALTY_THRESHOLD - (row.stamps % LOYALTY_THRESHOLD);
  return {
    phone: row.phone,
    name: row.name,
    stamps: row.stamps,
    redeemed: row.redeemed,
    orderCount: row.order_count,
    totalSpent: money(row.total_spent),
    rewardsAvailable: Math.max(0, rewardsAvailable),
    stampsToNextReward,
  };
}

export async function getLoyalty(phone: string): Promise<LoyaltyAccount> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select phone, name, stamps, redeemed, order_count, total_spent from gestion_loyalty_accounts where phone = $1",
    [phone]
  );
  if (!rows[0]) {
    return toAccount({ phone, name: null, stamps: 0, redeemed: 0, order_count: 0, total_spent: 0 });
  }
  return toAccount(rows[0]);
}

// Suma un sello y acumula compras/gasto cada vez que el local confirma un
// pedido hecho desde el menú online para ese teléfono, o cuando se cobra en
// el panel con un teléfono de fidelidad cargado (no se duplica: el llamador
// solo lo invoca una vez por cobro/confirmación). Si se pasa nombre, lo
// guarda sin pisar uno ya cargado con un valor vacío.
export async function addStamp(
  phone: string,
  options: { name?: string | null; orderTotal?: number; origin?: string } = {}
): Promise<LoyaltyAccount> {
  const pool = getPool();
  await pool.query(
    `insert into gestion_loyalty_accounts (phone, stamps, name, order_count, total_spent, origin, updated_at)
     values ($1, 1, $2, 1, $3, $4, now())
     on conflict (phone) do update set
       stamps = gestion_loyalty_accounts.stamps + 1,
       name = coalesce(excluded.name, gestion_loyalty_accounts.name),
       order_count = gestion_loyalty_accounts.order_count + 1,
       total_spent = gestion_loyalty_accounts.total_spent + excluded.total_spent,
       origin = coalesce(gestion_loyalty_accounts.origin, excluded.origin),
       updated_at = excluded.updated_at`,
    [phone, options.name ?? null, options.orderTotal ?? 0, options.origin ?? null]
  );
  return getLoyalty(phone);
}
