import { getPool } from "@/lib/admin/db";

export const LOYALTY_THRESHOLD = 10;

export interface LoyaltyAccount {
  phone: string;
  name: string | null;
  stamps: number;
  redeemed: number;
  rewardsAvailable: number;
  stampsToNextReward: number;
}

function toAccount(phone: string, name: string | null, stamps: number, redeemed: number): LoyaltyAccount {
  const rewardsAvailable = Math.floor(stamps / LOYALTY_THRESHOLD) - redeemed;
  const stampsToNextReward = LOYALTY_THRESHOLD - (stamps % LOYALTY_THRESHOLD);
  return {
    phone,
    name,
    stamps,
    redeemed,
    rewardsAvailable: Math.max(0, rewardsAvailable),
    stampsToNextReward,
  };
}

export async function getLoyalty(phone: string): Promise<LoyaltyAccount> {
  const pool = getPool();
  const { rows } = await pool.query<{ name: string | null; stamps: number; redeemed: number }>(
    "select name, stamps, redeemed from gestion_loyalty_accounts where phone = $1",
    [phone]
  );
  if (!rows[0]) return toAccount(phone, null, 0, 0);
  return toAccount(phone, rows[0].name, rows[0].stamps, rows[0].redeemed);
}

// Suma un sello cada vez que el local confirma un pedido hecho desde el
// menú online para ese teléfono, o cuando se cobra en el panel con un
// teléfono de fidelidad cargado (no se duplica: el llamador solo lo invoca
// una vez por cobro/confirmación). Si se pasa nombre, lo guarda sin pisar
// uno ya cargado con un valor vacío.
export async function addStamp(phone: string, name?: string | null): Promise<LoyaltyAccount> {
  const pool = getPool();
  await pool.query(
    `insert into gestion_loyalty_accounts (phone, stamps, name, updated_at)
     values ($1, 1, $2, now())
     on conflict (phone) do update set
       stamps = gestion_loyalty_accounts.stamps + 1,
       name = coalesce(excluded.name, gestion_loyalty_accounts.name),
       updated_at = excluded.updated_at`,
    [phone, name ?? null]
  );
  return getLoyalty(phone);
}
