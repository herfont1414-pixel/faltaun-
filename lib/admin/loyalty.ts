import { getPool } from "@/lib/admin/db";
import type { DbClient } from "@/lib/admin/db";
import { recordAudit } from "@/lib/admin/auth";
import { recordStockMovement } from "@/lib/admin/stock-movements";
import { hitsAt, stampsToNext } from "@/lib/admin/loyalty-rewards";
import { whatsappDigits } from "@/lib/phone";

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

// Cuenta de fidelidad que le corresponde a un teléfono escrito de cualquier forma
// ("3755589363", "+54 9 3755 58-9363", "0375515589363"…). Solo LEE y nunca modifica,
// combina ni renombra cuentas:
//  1) si ya existe una cuenta con exactamente ese texto, es esa;
//  2) si no, una cuenta existente cuyo número, ya normalizado, es el mismo (si hubiera
//     varias duplicadas, la de más sellos; no se combinan);
//  3) si no hay ninguna, se devuelve el texto tal cual para crear una cuenta nueva.
// Una cuenta nueva conserva el texto con el que se cargó (así el resto del sistema, que
// agrupa por ese texto, sigue igual) y los pedidos siguientes con otro formato ya la encuentran.
// Números de menos de 8 dígitos no se normalizan (no alcanzan para identificar).
export async function resolveLoyaltyPhone(db: DbClient, raw: string): Promise<string> {
  const phone = raw.trim();
  const { rows: exact } = await db.query("select phone from gestion_loyalty_accounts where phone = $1", [phone]);
  if (exact[0]) return phone;
  const canonical = whatsappDigits(phone);
  if (canonical.replace(/\D/g, "").length < 8) return phone;
  const { rows } = await db.query<{ phone: string; stamps: number }>("select phone, stamps from gestion_loyalty_accounts");
  const matches = rows.filter((r) => whatsappDigits(r.phone) === canonical);
  if (matches.length === 0) return phone;
  matches.sort((a, b) => Number(b.stamps) - Number(a.stamps) || a.phone.localeCompare(b.phone));
  return matches[0].phone;
}

export async function getLoyalty(rawPhone: string): Promise<LoyaltyAccount> {
  const pool = getPool();
  const phone = await resolveLoyaltyPhone(pool, rawPhone);
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

// Suma un sello y acumula compras/gasto cuando el local confirma un pedido hecho desde
// el menú online, o cuando se cobra en el panel con un teléfono de fidelidad cargado.
// orderId es obligatorio: es lo que garantiza "un pedido = un solo sello": el insert en
// gestion_loyalty_transactions tiene un unique(order_id, type), así que si se llama dos
// veces para el mismo pedido (doble click, reintento, otro camino del sistema), la segunda
// no inserta nada y se corta, sin tocar la cuenta ni los premios.
//
// UNA SOLA TRANSACCIÓN: sello + cuenta + premio del hito cruzado (papas 5, 20, 35…;
// hamburguesa 15, 30, 45…, una vez por cliente e hito: unique en gestion_loyalty_grants).
// Si cualquier paso falla, no queda nada registrado: no hay sellos sin su premio ni
// premios sin su sello, y repetir la llamada con el mismo pedido es seguro y completa
// todo. No hay premios retroactivos: solo se premia el hito que cruza este sello.
//
// Esta función NO abre ni cierra la transacción: la usa addStamp (propia) y el aceptar
// pedido web (dentro de su transacción), así aceptar + sello + premio son atómicos.
export async function awardStampInTx(
  client: DbClient,
  rawPhone: string,
  orderId: string,
  options: { name?: string | null; orderTotal?: number; origin?: string } = {}
): Promise<{ awarded: boolean; phone: string; stamps: number }> {
  const phone = await resolveLoyaltyPhone(client, rawPhone);
  const { rows: inserted } = await client.query<{ id: number }>(
    `insert into gestion_loyalty_transactions (phone, order_id, type, stamps, amount)
     values ($1, $2, 'stamp', 1, $3)
     on conflict (order_id, type) do nothing
     returning id`,
    [phone, orderId, options.orderTotal ?? 0]
  );
  if (!inserted[0]) {
    // Ya se sumó el sello de este pedido antes; no se duplica.
    return { awarded: false, phone, stamps: 0 };
  }
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
  for (const reward of await listRewards(client)) {
    if (!reward.active || !hitsAt(reward, newStamps)) continue;
    await client.query(
      `insert into gestion_loyalty_grants (phone, reward_id, milestone)
       values ($1, $2, $3)
       on conflict (phone, reward_id, milestone) do nothing`,
      [phone, reward.id, newStamps]
    );
  }
  return { awarded: true, phone, stamps: newStamps };
}

export async function addStamp(
  phone: string,
  orderId: string,
  options: { name?: string | null; orderTotal?: number; origin?: string } = {}
): Promise<LoyaltyAccount> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await awardStampInTx(client, phone, orderId, options);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return getLoyalty(phone);
}

// Recuperación del sello de un cobro del panel cuyo cobro SÍ se registró pero el sello no
// (por ejemplo, un corte justo después del cobro). Es seguro e idempotente: solo actúa si el
// pedido está cerrado hace poco y todavía NO tiene sello (la misma clave que usa addStamp);
// un pedido que ya sumó su sello devuelve null y no se toca nada.
// Ventana de recuperación: ni antes de 5 s (así un doble clic o un envío duplicado, que llegan
// a la vez, siguen recibiendo "ya fue cerrado" y no se disfrazan de reintento) ni después de
// 30 min (no sirve para sumar sellos a pedidos viejos).
const RECOVERY_MIN_AGE_MS = 5 * 1000;
const RECOVERY_WINDOW_MS = 30 * 60 * 1000;

export async function recoverClosedOrderStamp(
  orderId: string,
  rawPhone: string
): Promise<{ total: number; origin: string } | null> {
  const pool = getPool();
  const { rows: orders } = await pool.query(
    "select status, closed_at, total, is_delivery, origin from gestion_orders where id = $1",
    [orderId]
  );
  const order = orders[0];
  if (!order || order.status !== "cerrada" || !order.closed_at) return null;
  const age = Date.now() - new Date(order.closed_at).getTime();
  if (age < RECOVERY_MIN_AGE_MS || age > RECOVERY_WINDOW_MS) return null;

  // Un pedido web ya sumó (o suma) su sello con el id del pedido web.
  const { rows: web } = await pool.query("select id from gestion_web_orders where order_id = $1", [orderId]);
  const key = web[0]?.id ?? orderId;
  const { rows: existing } = await pool.query(
    "select 1 as found from gestion_loyalty_transactions where order_id = $1 and type = 'stamp'",
    [String(key)]
  );
  if (existing[0]) return null;

  const total = money(order.total);
  const origin = order.is_delivery ? "delivery" : String(order.origin);
  await addStamp(rawPhone, String(key), { orderTotal: total, origin });
  return { total, origin };
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

export async function listGrantsForPhone(rawPhone: string): Promise<LoyaltyGrant[]> {
  const phone = await resolveLoyaltyPhone(getPool(), rawPhone);
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
