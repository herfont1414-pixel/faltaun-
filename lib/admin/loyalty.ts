import { getPool } from "@/lib/admin/db";
import type { DbClient } from "@/lib/admin/db";
import { recordAudit } from "@/lib/admin/auth";
import { recordStockMovement } from "@/lib/admin/stock-movements";
import { hitsAt, stampsToNext } from "@/lib/admin/loyalty-rewards";

// Regla vieja (un premio genérico cada 10 sellos). Ya no define premios: se conserva
// solo como referencia histórica (el informe de solo lectura la usa para comparar).
export const LOYALTY_THRESHOLD = 10;

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

// ---------- Premios (catálogo) ----------

export interface LoyaltyReward {
  id: number;
  code: string;
  name: string;
  description: string | null;
  firstMilestone: number;
  step: number;
  productId: number | null;
  productName: string | null;
  active: boolean;
  sortOrder: number;
}

const REWARD_SELECT = `
  select r.id, r.code, r.name, r.description, r.first_milestone, r.step, r.product_id, r.active, r.sort_order,
         p.name as product_name
  from gestion_loyalty_rewards r
  left join gestion_products p on p.id = r.product_id`;

function toReward(r: any): LoyaltyReward {
  return {
    id: Number(r.id),
    code: r.code,
    name: r.name,
    description: r.description ?? null,
    firstMilestone: Number(r.first_milestone),
    step: Number(r.step),
    productId: r.product_id == null ? null : Number(r.product_id),
    productName: r.product_name ?? null,
    active: Boolean(r.active),
    sortOrder: Number(r.sort_order),
  };
}

export async function listRewards(db: DbClient = getPool()): Promise<LoyaltyReward[]> {
  const { rows } = await db.query(`${REWARD_SELECT} order by r.sort_order, r.id`);
  return rows.map(toReward);
}

// Premios por defecto (papas en 5, hamburguesa simple en 15; ambos se repiten cada 15).
// Se crean una sola vez (on conflict do nothing): lo que el administrador edite después
// no se pisa. El premio de papas queda vinculado al producto "Papas Fritas" por su ID,
// sin ningún precio; si todavía no existe, se elige después desde el administrador.
export async function ensureDefaultRewards(client: DbClient) {
  await client.query(
    `insert into gestion_loyalty_rewards (code, name, description, first_milestone, step, product_id, sort_order)
     values ('papas', 'Papas fritas gratis', 'Una porción de papas fritas gratis', 5, 15,
             (select id from gestion_products where name = 'Papas Fritas' order by id limit 1), 1)
     on conflict (code) do nothing`
  );
  await client.query(
    `insert into gestion_loyalty_rewards (code, name, description, first_milestone, step, sort_order)
     values ('burger', 'Hamburguesa gratis', 'Una hamburguesa simple gratis, a elección (no incluye dobles ni triples)', 15, 15, 2)
     on conflict (code) do nothing`
  );
}

export async function updateReward(
  id: number,
  changes: { name?: string; description?: string | null; productId?: number | null; active?: boolean },
  userId: number | null
): Promise<LoyaltyReward> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: before } = await client.query(`${REWARD_SELECT} where r.id = $1`, [id]);
    if (!before[0]) throw new Error("Ese premio no existe");
    if (changes.name !== undefined && !changes.name.trim()) throw new Error("El nombre del premio no puede quedar vacío");
    if (changes.productId != null) {
      const { rows } = await client.query("select id from gestion_products where id = $1", [changes.productId]);
      if (!rows[0]) throw new Error("Ese producto no existe");
    }
    // Los hitos (cuántos sellos) no se editan acá: cambiarlos con premios ya generados
    // podría duplicar o desfasar premios. Se muestran en pantalla pero son de solo lectura.
    const sets: string[] = [];
    const params: unknown[] = [id];
    const add = (col: string, value: unknown) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };
    if (changes.name !== undefined) add("name", changes.name.trim().slice(0, 80));
    if (changes.description !== undefined) add("description", changes.description?.trim().slice(0, 240) || null);
    if (changes.productId !== undefined) add("product_id", changes.productId);
    if (changes.active !== undefined) add("active", changes.active);
    if (sets.length > 0) {
      await client.query(`update gestion_loyalty_rewards set ${sets.join(", ")}, updated_at = now() where id = $1`, params);
    }
    await recordAudit({
      userId,
      action: "loyalty_reward_update",
      entity: "gestion_loyalty_rewards",
      entityId: id,
      oldValue: toReward(before[0]),
      newValue: changes,
      client,
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const { rows } = await pool.query(`${REWARD_SELECT} where r.id = $1`, [id]);
  return toReward(rows[0]);
}

// ---------- Cuenta del cliente ----------

export interface LoyaltyAccount {
  phone: string;
  name: string | null;
  stamps: number;
  // Campo del sistema anterior (canjes viejos). No se usa para los premios nuevos.
  redeemed: number;
  orderCount: number;
  totalSpent: number;
  // Premios nuevos generados y todavía sin entregar.
  rewardsAvailable: number;
  // Sellos que faltan para el próximo hito de cualquier premio activo.
  stampsToNextReward: number;
}

function toAccount(
  row: { phone: string; name: string | null; stamps: number; redeemed: number; order_count: number; total_spent: string | number },
  rewardsAvailable: number,
  stampsToNextReward: number
): LoyaltyAccount {
  return {
    phone: row.phone,
    name: row.name,
    stamps: row.stamps,
    redeemed: row.redeemed,
    orderCount: row.order_count,
    totalSpent: money(row.total_spent),
    rewardsAvailable,
    stampsToNextReward,
  };
}

export async function getLoyalty(phone: string): Promise<LoyaltyAccount> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select phone, name, stamps, redeemed, order_count, total_spent from gestion_loyalty_accounts where phone = $1",
    [phone]
  );
  const row = rows[0] ?? { phone, name: null, stamps: 0, redeemed: 0, order_count: 0, total_spent: 0 };
  const rewards = (await listRewards(pool)).filter((r) => r.active);
  const { rows: pending } = await pool.query(
    "select count(*) as n from gestion_loyalty_grants where phone = $1 and status = 'disponible'",
    [phone]
  );
  const next = stampsToNext(
    rewards.map((r) => ({ firstMilestone: r.firstMilestone, step: r.step })),
    row.stamps
  );
  return toAccount(row, Number(pending[0]?.n ?? 0), next?.remaining ?? 0);
}

// Suma un sello y acumula compras/gasto cada vez que el local confirma un
// pedido hecho desde el menú online para ese teléfono, o cuando se cobra en
// el panel con un teléfono de fidelidad cargado. orderId es obligatorio
// porque es lo que garantiza "un pedido = una sola operación de fidelidad":
// el insert en gestion_loyalty_transactions tiene un unique(order_id, type),
// así que si addStamp se llama dos veces para el mismo pedido (doble click,
// reintento de red), la segunda vez el insert no inserta nada y se corta
// ahí mismo, sin tocar gestion_loyalty_accounts de nuevo.
//
// Todo ocurre en una sola transacción (transacción + cuenta + premios), así una
// caída a mitad no deja datos a medias. Si el sello cruza un hito (papas 5, 20,
// 35…; hamburguesa 15, 30, 45…) se genera ese premio, una sola vez por cliente e
// hito (unique en gestion_loyalty_grants). Solo se premia el hito que se cruza con
// este sello: no hay premios retroactivos por sellos anteriores.
export async function addStamp(
  phone: string,
  orderId: string,
  options: { name?: string | null; orderTotal?: number; origin?: string } = {}
): Promise<LoyaltyAccount> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: inserted } = await client.query<{ id: number }>(
      `insert into gestion_loyalty_transactions (phone, order_id, type, stamps, amount)
       values ($1, $2, 'stamp', 1, $3)
       on conflict (order_id, type) do nothing
       returning id`,
      [phone, orderId, options.orderTotal ?? 0]
    );
    if (!inserted[0]) {
      // Ya se sumó el sello de este pedido antes; no se duplica.
      await client.query("rollback");
    } else {
      const { rows: acc } = await client.query<{ stamps: number }>(
        `insert into gestion_loyalty_accounts (phone, stamps, name, order_count, total_spent, origin, updated_at)
         values ($1, 1, $2, 1, $3, $4, now())
         on conflict (phone) do update set
           stamps = gestion_loyalty_accounts.stamps + 1,
           name = coalesce(excluded.name, gestion_loyalty_accounts.name),
           order_count = gestion_loyalty_accounts.order_count + 1,
           total_spent = gestion_loyalty_accounts.total_spent + excluded.total_spent,
           origin = coalesce(gestion_loyalty_accounts.origin, excluded.origin),
           updated_at = excluded.updated_at
         returning stamps`,
        [phone, options.name ?? null, options.orderTotal ?? 0, options.origin ?? null]
      );
      const newStamps = Number(acc[0].stamps);

      // Los premios van en un savepoint: si fallan (por ejemplo, tabla no disponible),
      // el sello igual se cuenta y el pedido no se ve afectado.
      await client.query("savepoint loyalty_grants");
      try {
        for (const reward of await listRewards(client)) {
          if (!reward.active || !hitsAt(reward, newStamps)) continue;
          await client.query(
            `insert into gestion_loyalty_grants (phone, reward_id, milestone)
             values ($1, $2, $3)
             on conflict (phone, reward_id, milestone) do nothing`,
            [phone, reward.id, newStamps]
          );
        }
        await client.query("release savepoint loyalty_grants");
      } catch (error) {
        await client.query("rollback to savepoint loyalty_grants");
        console.error("No se pudo generar el premio de fidelidad", error);
      }
      await client.query("commit");
    }
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return getLoyalty(phone);
}

// ---------- Premios del cliente ----------

export interface LoyaltyGrant {
  id: string;
  phone: string;
  rewardId: number;
  rewardCode: string;
  rewardName: string;
  rewardDescription: string | null;
  milestone: number;
  status: "disponible" | "canjeado";
  createdAt: string;
  redeemedAt: string | null;
  redeemedByName: string | null;
  deliveredProductId: number | null;
  deliveredProductName: string | null;
  note: string | null;
}

const GRANT_SELECT = `
  select g.id, g.phone, g.reward_id, g.milestone, g.status, g.created_at, g.redeemed_at,
         g.delivered_product_id, g.delivered_product_name, g.note,
         r.code as reward_code, r.name as reward_name, r.description as reward_description,
         u.name as redeemed_by_name
  from gestion_loyalty_grants g
  join gestion_loyalty_rewards r on r.id = g.reward_id
  left join gestion_users u on u.id = g.redeemed_by`;

function toGrant(g: any): LoyaltyGrant {
  return {
    id: String(g.id),
    phone: g.phone,
    rewardId: Number(g.reward_id),
    rewardCode: g.reward_code,
    rewardName: g.reward_name,
    rewardDescription: g.reward_description ?? null,
    milestone: Number(g.milestone),
    status: g.status,
    createdAt: String(g.created_at),
    redeemedAt: g.redeemed_at ? String(g.redeemed_at) : null,
    redeemedByName: g.redeemed_by_name ?? null,
    deliveredProductId: g.delivered_product_id == null ? null : Number(g.delivered_product_id),
    deliveredProductName: g.delivered_product_name ?? null,
    note: g.note ?? null,
  };
}

export async function listGrantsForPhone(phone: string): Promise<LoyaltyGrant[]> {
  const { rows } = await getPool().query(
    `${GRANT_SELECT} where g.phone = $1 order by g.created_at desc, g.milestone desc`,
    [phone]
  );
  return rows.map(toGrant);
}

export async function listPendingGrants(limit = 100): Promise<(LoyaltyGrant & { customerName: string | null })[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  const { rows } = await getPool().query(
    `select g.id, g.phone, g.reward_id, g.milestone, g.status, g.created_at, g.redeemed_at,
            g.delivered_product_id, g.delivered_product_name, g.note,
            r.code as reward_code, r.name as reward_name, r.description as reward_description,
            null as redeemed_by_name, a.name as customer_name
     from gestion_loyalty_grants g
     join gestion_loyalty_rewards r on r.id = g.reward_id
     left join gestion_loyalty_accounts a on a.phone = g.phone
     where g.status = 'disponible'
     order by g.created_at asc, g.milestone asc
     limit ${n}`
  );
  return rows.map((r) => ({ ...toGrant(r), customerName: r.customer_name ?? null }));
}

// ---------- Canje ----------

export interface RedeemInput {
  grantId: string;
  userId: number;
  // Producto realmente entregado (opcional). Para el premio de papas se toma el
  // producto vinculado al premio si no se indica otro.
  productId?: number | null;
  note?: string | null;
}

// Registra la entrega física de un premio. Todo en una transacción:
//  1) "reclama" el premio con un UPDATE ... WHERE status = 'disponible' (atómico: si dos
//     personas lo intentan a la vez, o hay doble clic, solo una lo consigue);
//  2) si el producto entregado controla stock, lo descuenta UNA vez con el mismo mecanismo
//     del cobro (fila bloqueada + movimiento en la bitácora de stock);
//  3) deja la auditoría.
// Si el producto está agotado o algo falla, se deshace todo y el premio sigue pendiente.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function redeemGrant(input: RedeemInput): Promise<LoyaltyGrant> {
  // Un id con formato inválido es "no existe" (así PostgreSQL no devuelve su error interno).
  if (typeof input.grantId !== "string" || !UUID.test(input.grantId)) throw new Error("Ese premio no existe");
  const pool = getPool();
  const client = await pool.connect();
  let grantId = input.grantId;
  try {
    await client.query("begin");

    const { rows: found } = await client.query(`${GRANT_SELECT} where g.id = $1`, [grantId]);
    const grant = found[0];
    if (!grant) throw new Error("Ese premio no existe");
    if (grant.status !== "disponible") throw new Error("Ese premio ya fue canjeado");

    // Producto entregado: el indicado, o el vinculado al premio (papas).
    let productId: number | null = input.productId ?? null;
    if (productId == null) {
      const { rows: linked } = await client.query("select product_id from gestion_loyalty_rewards where id = $1", [grant.reward_id]);
      productId = linked[0]?.product_id ?? null;
    }
    let product: { id: number; name: string } | null = null;
    if (productId != null) {
      const { rows: p } = await client.query("select id, name from gestion_products where id = $1", [productId]);
      if (!p[0]) throw new Error("Ese producto no existe");
      product = { id: Number(p[0].id), name: p[0].name };
    }
    const note = input.note?.trim().slice(0, 200) || null;

    // 1) Reclamo atómico del premio.
    const { rows: claimed } = await client.query(
      `update gestion_loyalty_grants
       set status = 'canjeado', redeemed_at = now(), redeemed_by = $2,
           delivered_product_id = $3, delivered_product_name = $4, note = $5
       where id = $1 and status = 'disponible'
       returning id`,
      [grantId, input.userId, product?.id ?? null, product?.name ?? null, note]
    );
    if (!claimed[0]) throw new Error("Ese premio ya fue canjeado");

    // 2) Stock: solo si el producto entregado lo controla (stock_qty no nulo).
    let stockDiscounted = false;
    if (product) {
      const { rows: stock } = await client.query<{ stock_qty: number | null; in_stock: boolean }>(
        "select stock_qty, in_stock from gestion_products where id = $1 for update",
        [product.id]
      );
      const s = stock[0];
      if (s && (!s.in_stock || (s.stock_qty !== null && s.stock_qty < 1))) {
        throw new Error(`${product.name} está agotado: el premio sigue pendiente hasta que se pueda entregar`);
      }
      if (s && s.stock_qty !== null) {
        const newQty = s.stock_qty - 1;
        await client.query("update gestion_products set stock_qty = $2, in_stock = $3 where id = $1", [product.id, newQty, newQty > 0]);
        await recordStockMovement(
          {
            productId: product.id,
            type: "ajuste_negativo",
            quantity: -1,
            referenceType: "loyalty_reward",
            referenceId: grantId,
            note: `Canje de premio de fidelidad (${grant.reward_name})`,
            userId: input.userId,
          },
          client
        );
        stockDiscounted = true;
      }
    }

    // 3) Auditoría, dentro de la misma transacción.
    await recordAudit({
      userId: input.userId,
      action: "loyalty_redeem",
      entity: "gestion_loyalty_grants",
      entityId: grantId,
      oldValue: { status: "disponible" },
      newValue: {
        phone: grant.phone,
        reward: grant.reward_name,
        milestone: Number(grant.milestone),
        product: product?.name ?? null,
        stockDiscounted,
        note,
      },
      client,
    });

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const { rows } = await pool.query(`${GRANT_SELECT} where g.id = $1`, [grantId]);
  return toGrant(rows[0]);
}

// ---------- Búsqueda para el administrador ----------

export interface LoyaltySearchRow {
  phone: string;
  name: string | null;
  stamps: number;
  pendingGrants: number;
}

export async function searchLoyaltyAccounts(query: string): Promise<LoyaltySearchRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const useDigits = digits.length >= 3 && digits.length >= q.replace(/\s/g, "").length - 2;
  const { rows } = await getPool().query(
    `select a.phone, a.name, a.stamps,
            (select count(*) from gestion_loyalty_grants g where g.phone = a.phone and g.status = 'disponible') as pending
     from gestion_loyalty_accounts a
     where ${useDigits ? "a.phone like $1" : "a.name ilike $1"}
     order by a.stamps desc, a.phone
     limit 20`,
    [`%${useDigits ? digits : q}%`]
  );
  return rows.map((r) => ({ phone: r.phone, name: r.name ?? null, stamps: Number(r.stamps), pendingGrants: Number(r.pending) }));
}
