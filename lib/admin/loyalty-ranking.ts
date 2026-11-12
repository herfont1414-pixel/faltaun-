import { getPool } from "@/lib/admin/db";
import { listRewards } from "@/lib/admin/loyalty";
import { stampsToNext } from "@/lib/admin/loyalty-rewards";
import { businessDayKey } from "@/lib/admin/business-day";

// Tabla de posiciones de fidelidad: todos los clientes con su cantidad de sellos, cuánto les
// falta para el próximo premio, premios para entregar y canjeados, compras, gasto y cuándo
// sumaron su último sello. Solo lectura (no crea ni cambia nada).

export interface LoyaltyRankingRow {
  phone: string;
  name: string | null;
  stamps: number;
  orderCount: number;
  totalSpent: number;
  pendingRewards: number;
  redeemedRewards: number;
  /** Sellos sumados en los últimos 30 días (sin contar los cargados a mano). */
  stamps30d: number;
  /** Último sello (o carga inicial), ISO; null si no hay registro. */
  lastStampAt: string | null;
  next: { rewardName: string; rewardCode: string; milestone: number; remaining: number } | null;
}

export interface LoyaltyRanking {
  rows: LoyaltyRankingRow[];
  summary: {
    customers: number;
    totalStamps: number;
    nearReward: number;
    pendingRewards: number;
    redeemedRewards: number;
    activeLast30d: number;
  };
}

const toIso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};

export async function getLoyaltyRanking(now: Date = new Date()): Promise<LoyaltyRanking> {
  const pool = getPool();
  const since = businessDayKey(new Date(now.getTime() - 29 * 86_400_000));
  const { rows } = await pool.query(
    `select a.phone, a.name, a.stamps, a.order_count, a.total_spent,
            (select max(t.created_at) from gestion_loyalty_transactions t
              where t.phone = a.phone and t.type in ('stamp', 'import')) as last_stamp_at,
            (select count(*) from gestion_loyalty_transactions t
              where t.phone = a.phone and t.type = 'stamp' and t.stamp_day >= $1) as stamps_30d,
            (select count(*) from gestion_loyalty_grants g where g.phone = a.phone and g.status = 'disponible') as pending,
            (select count(*) from gestion_loyalty_grants g where g.phone = a.phone and g.status = 'canjeado') as redeemed
     from gestion_loyalty_accounts a
     order by a.stamps desc, a.total_spent desc, a.phone`,
    [since]
  );
  const rules = (await listRewards(pool)).filter((r) => r.active);

  const out: LoyaltyRankingRow[] = rows.map((r: any) => {
    const stamps = Number(r.stamps);
    const next = rules.length ? stampsToNext(rules, stamps) : null;
    return {
      phone: r.phone,
      name: r.name ?? null,
      stamps,
      orderCount: Number(r.order_count ?? 0),
      totalSpent: Number(r.total_spent ?? 0),
      pendingRewards: Number(r.pending ?? 0),
      redeemedRewards: Number(r.redeemed ?? 0),
      stamps30d: Number(r.stamps_30d ?? 0),
      lastStampAt: toIso(r.last_stamp_at),
      next: next ? { rewardName: next.rule.name, rewardCode: next.rule.code, milestone: next.milestone, remaining: next.remaining } : null,
    };
  });

  const withStamps = out.filter((r) => r.stamps > 0);
  return {
    rows: out,
    summary: {
      customers: withStamps.length,
      totalStamps: withStamps.reduce((s, r) => s + r.stamps, 0),
      nearReward: withStamps.filter((r) => r.next && r.next.remaining <= 2).length,
      pendingRewards: out.reduce((s, r) => s + r.pendingRewards, 0),
      redeemedRewards: out.reduce((s, r) => s + r.redeemedRewards, 0),
      activeLast30d: out.filter((r) => r.stamps30d > 0).length,
    },
  };
}
