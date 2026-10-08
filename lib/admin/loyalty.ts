import { getPool } from "@/lib/admin/db";

export const LOYALTY_THRESHOLD = 10;

export interface LoyaltyAccount {
  phone: string;
  stamps: number;
  redeemed: number;
  rewardsAvailable: number;
  stampsToNextReward: number;
}

function toAccount(phone: string, stamps: number, redeemed: number): LoyaltyAccount {
  const rewardsAvailable = Math.floor(stamps / LOYALTY_THRESHOLD) - redeemed;
  const stampsToNextReward = LOYALTY_THRESHOLD - (stamps % LOYALTY_THRESHOLD);
  return { phone, stamps, redeemed, rewardsAvailable: Math.max(0, rewardsAvailable), stampsToNextReward };
}

export async function getLoyalty(phone: string): Promise<LoyaltyAccount> {
  const pool = getPool();
  const { rows } = await pool.query<{ stamps: number; redeemed: number }>(
    "select stamps, redeemed from gestion_loyalty_accounts where phone = $1",
    [phone]
  );
  if (!rows[0]) return toAccount(phone, 0, 0);
  return toAccount(phone, rows[0].stamps, rows[0].redeemed);
}

// Suma un sello cada vez que el local confirma un pedido hecho desde el
// menú online para ese teléfono (no se duplica: el llamador solo lo invoca
// en la transición a "confirmado").
export async function addStamp(phone: string): Promise<LoyaltyAccount> {
  const pool = getPool();
  await pool.query(
    `insert into gestion_loyalty_accounts (phone, stamps, updated_at)
     values ($1, 1, now())
     on conflict (phone) do update set stamps = gestion_loyalty_accounts.stamps + 1, updated_at = excluded.updated_at`,
    [phone]
  );
  return getLoyalty(phone);
}
