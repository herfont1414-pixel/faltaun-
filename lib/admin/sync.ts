// Conexión entre la PC del local y la nube (el menú online).
//
// La PC es el sistema de verdad (mesas, caja, pedidos, stock, fidelidad…). La nube solo
// muestra el menú y recibe reservas y pedidos web. Hablan por HTTPS, siempre empezando la PC
// (la PC no es alcanzable desde afuera):
//   PC → nube : una copia del menú, precios, stock, zonas de envío, datos del local, reglas y
//               cuentas de fidelidad, el especial del día y el estado de cada pedido web.
//               Solo se manda lo que cambió desde la vez anterior (por huella de contenido).
//   nube → PC : los pedidos web y reservas nuevos (bandeja de entrada), que la PC baja, guarda
//               en su base y "confirma" en la llamada siguiente.
// Todo es idempotente: si se corta internet o se repite un envío, no se duplica nada.
//
// Este archivo no abre conexiones ni usa timers: son funciones sobre una base (Db) para poder
// probarlas. El ciclo de la PC está en sync-worker.ts y la ruta de la nube en app/api/sync.
import crypto from "node:crypto";
import type { Db, DbClient } from "@/lib/admin/db";
import { cached } from "@/lib/admin/read-cache";
import { PC_ONLINE_WINDOW_MS, isCloudRole } from "@/lib/admin/role";

export type Row = Record<string, unknown>;

export interface TableSpec {
  name: string;
  cols: string[];
  key: string;
  // replace: la nube deja la tabla idéntica a la de la PC. upsert: agrega y actualiza, nunca borra.
  mode: "replace" | "upsert";
  orderBy: string;
}

// Lo que la PC publica. Las columnas son las que usa el menú público (no se manda nada interno).
// El orden importa: primero lo que otras tablas referencian.
export const PUBLISHED_TABLES: TableSpec[] = [
  { name: "gestion_categories", cols: ["id", "name", "sort_order"], key: "id", mode: "replace", orderBy: "id" },
  {
    name: "gestion_products",
    cols: ["id", "category_id", "name", "price", "active", "in_stock", "stock_qty", "show_online"],
    key: "id",
    mode: "replace",
    orderBy: "id",
  },
  { name: "gestion_delivery_zones", cols: ["id", "name", "cost", "max_km"], key: "id", mode: "replace", orderBy: "id" },
  {
    name: "gestion_business_config",
    cols: ["id", "name", "address", "hours", "whatsapp_number", "logo_url", "transfer_alias", "transfer_holder", "latitude", "longitude"],
    key: "id",
    mode: "upsert",
    orderBy: "id",
  },
  {
    name: "gestion_loyalty_rewards",
    cols: ["id", "code", "name", "description", "first_milestone", "step", "active", "sort_order"],
    key: "id",
    mode: "upsert",
    orderBy: "id",
  },
  {
    name: "gestion_loyalty_accounts",
    cols: ["phone", "name", "stamps", "redeemed", "order_count", "total_spent", "origin"],
    key: "phone",
    mode: "upsert",
    orderBy: "phone",
  },
  {
    name: "gestion_loyalty_grants",
    cols: ["id", "phone", "reward_id", "milestone", "status", "created_at", "redeemed_at", "delivered_product_name", "note"],
    key: "id",
    mode: "upsert",
    orderBy: "created_at, id",
  },
];

// Claves de gestion_meta que se publican (especial del día, su foto y el ranking de más pedidos).
export const META_KEYS = [
  "menu_special_active",
  "menu_special_id",
  "menu_special_text",
  "menu_special_image_product",
  "menu_special_image_v",
  "menu_special_image",
  "menu_popular_names",
];
const META = "meta";

// Se publican siempre juntas: reemplazar categorías borraría los productos en cascada.
const LINKED: Record<string, string> = { gestion_categories: "gestion_products", gestion_products: "gestion_categories" };

export interface SyncRequest {
  v: 1;
  // Pedidos web y reservas que la PC ya guardó: se sacan de la bandeja.
  ack: { web: string[]; reserva: string[] };
  // Tablas que cambiaron (y "meta"), con todas sus filas.
  publish: Record<string, Row[]>;
  // Estado de los pedidos web que cambió.
  tracking: Row[];
}

export interface SyncResponse {
  ok: true;
  inbox: { web: Row[]; reserva: Row[] };
}

export const emptyRequest = (): SyncRequest => ({ v: 1, ack: { web: [], reserva: [] }, publish: {}, tracking: [] });

export const contentHash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Fechas a texto ISO y números como vienen: lo que viaja es JSON puro, igual para SQLite y PostgreSQL.
function plain(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
}

// ---------------------------------------------------------------------------------------------
// PC: leer lo que hay que publicar
// ---------------------------------------------------------------------------------------------

export async function readPublishable(db: DbClient, popularNames: string[] = []): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const spec of PUBLISHED_TABLES) {
    const { rows } = await db.query<Row>(`select ${spec.cols.join(", ")} from ${spec.name} order by ${spec.orderBy}`);
    out[spec.name] = rows.map(plain);
  }
  const { rows: meta } = await db.query<{ key: string; value: string | null }>(
    `select key, value from gestion_meta where key in (${META_KEYS.map((_, i) => `$${i + 1}`).join(", ")}) order by key`,
    META_KEYS
  );
  const metaRows: Row[] = meta.filter((m) => m.key !== "menu_popular_names").map((m) => ({ key: m.key, value: m.value }));
  metaRows.push({ key: "menu_popular_names", value: JSON.stringify(popularNames) });
  out[META] = metaRows.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return out;
}

// Estado de los pedidos web de los últimos días (lo que el cliente ve en "Mis pedidos").
export async function readTracking(db: DbClient, since: Date): Promise<Row[]> {
  const { rows } = await db.query<Row>(
    `select w.id, w.status, w.eta_minutes, w.responded_at,
            o.status as pos_order_status, o.delivery_status as pos_delivery_status, o.kitchen_status as pos_kitchen_status
     from gestion_web_orders w
     left join gestion_orders o on o.id = w.order_id
     where w.created_at >= $1
     order by w.created_at, w.id`,
    [since.toISOString()]
  );
  return rows.map((r) => plain({ ...r, id: String(r.id) }));
}

// Qué tablas mandar: las que cambiaron respecto de las huellas de la última vez que salieron bien.
export function changedTables(current: Record<string, Row[]>, sentHashes: Record<string, string>): string[] {
  const changed = new Set(Object.keys(current).filter((name) => contentHash(current[name]) !== sentHashes[name]));
  for (const name of [...changed]) if (LINKED[name]) changed.add(LINKED[name]);
  return Object.keys(current).filter((name) => changed.has(name));
}

// ---------------------------------------------------------------------------------------------
// Nube: aplicar lo que manda la PC
// ---------------------------------------------------------------------------------------------

const BATCH = 100;

async function insertRows(client: DbClient, spec: TableSpec, rows: Row[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const marks = spec.cols.map((col) => {
        params.push(row[col] === undefined ? null : row[col]);
        return `$${params.length}`;
      });
      return `(${marks.join(", ")})`;
    });
    const update =
      spec.mode === "upsert"
        ? ` on conflict (${spec.key}) do update set ${spec.cols.filter((c) => c !== spec.key).map((c) => `${c} = excluded.${c}`).join(", ")}`
        : "";
    await client.query(`insert into ${spec.name} (${spec.cols.join(", ")}) values ${tuples.join(", ")}${update}`, params);
  }
}

export async function applyPublish(db: Db, publish: Record<string, Row[]>): Promise<string[]> {
  const specs = PUBLISHED_TABLES.filter((s) => Array.isArray(publish[s.name]));
  const hasMeta = Array.isArray(publish[META]);
  if (specs.length === 0 && !hasMeta) return [];
  const client = await db.connect();
  try {
    await client.query("begin");
    // Primero se vacían (en orden inverso: productos antes que categorías) las tablas "replace"…
    for (const spec of [...specs].reverse()) if (spec.mode === "replace") await client.query(`delete from ${spec.name}`);
    // …y después se cargan todas en orden.
    for (const spec of specs) await insertRows(client, spec, publish[spec.name]);
    if (hasMeta) {
      const rows = publish[META].filter((r) => META_KEYS.includes(String(r.key)));
      for (const row of rows) {
        await client.query(
          "insert into gestion_meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
          [row.key, row.value ?? null]
        );
      }
      // Una clave que ya no está en la PC (por ejemplo, se sacó la foto del especial) se borra.
      const keep = new Set(rows.map((r) => String(r.key)));
      for (const key of META_KEYS) if (!keep.has(key)) await client.query("delete from gestion_meta where key = $1", [key]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    (client as unknown as { release(): void }).release();
  }
  return [...specs.map((s) => s.name), ...(hasMeta ? [META] : [])];
}

const WEB_STATUS = new Set(["pendiente", "confirmado", "rechazado"]);

export async function applyTracking(db: DbClient, rows: Row[]) {
  for (const r of rows) {
    const status = String(r.status);
    if (!WEB_STATUS.has(status)) continue;
    await db.query(
      `update gestion_web_orders
          set status = $2, eta_minutes = $3, responded_at = $4,
              pos_order_status = $5, pos_delivery_status = $6, pos_kitchen_status = $7
        where id = $1`,
      [String(r.id), status, r.eta_minutes ?? null, r.responded_at ?? null, r.pos_order_status ?? null, r.pos_delivery_status ?? null, r.pos_kitchen_status ?? null]
    );
  }
}

export async function applyAck(db: DbClient, ack: SyncRequest["ack"]) {
  for (const kind of ["web", "reserva"] as const) {
    const ids = (ack[kind] ?? []).map(String).slice(0, 500);
    if (ids.length === 0) continue;
    await db.query(
      `delete from gestion_sync_inbox where kind = $1 and ref_id in (${ids.map((_, i) => `$${i + 2}`).join(", ")})`,
      [kind, ...ids]
    );
  }
}

// Bandeja de entrada: lo que entró en la nube y la PC todavía no confirmó haber guardado.
export async function readInbox(db: DbClient, limit = 50): Promise<SyncResponse["inbox"]> {
  const { rows: pending } = await db.query<{ kind: string; ref_id: string }>(
    "select kind, ref_id from gestion_sync_inbox order by id limit $1",
    [limit]
  );
  const inbox: SyncResponse["inbox"] = { web: [], reserva: [] };
  if (pending.length === 0) return inbox;
  const load = async (table: string, kind: "web" | "reserva") => {
    const ids = pending.filter((p) => p.kind === kind).map((p) => String(p.ref_id));
    if (ids.length === 0) return [] as Row[];
    const { rows } = await db.query<Row>(`select * from ${table} where id in (${ids.map((_, i) => `$${i + 1}`).join(", ")})`, ids);
    // Una entrada sin su pedido/reserva (se borró): se limpia para que no quede dando vueltas.
    const found = new Set(rows.map((r) => String(r.id)));
    for (const id of ids.filter((i) => !found.has(i))) {
      await db.query("delete from gestion_sync_inbox where kind = $1 and ref_id = $2", [kind, id]);
    }
    return rows.map(plain);
  };
  inbox.web = await load("gestion_web_orders", "web");
  inbox.reserva = await load("gestion_reservations", "reserva");
  return inbox;
}

// Insert (con `returning *`) de un pedido web o una reserva. En la nube, además, lo anota en la
// bandeja de entrada en la MISMA transacción: así nunca queda un pedido que la PC no vaya a bajar.
export async function insertWithInbox(db: Db, kind: "web" | "reserva", sql: string, params: unknown[]): Promise<Row[]> {
  if (!isCloudRole()) return (await db.query<Row>(sql, params)).rows;
  const client = await db.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<Row>(sql, params);
    await client.query("insert into gestion_sync_inbox (kind, ref_id) values ($1, $2) on conflict (kind, ref_id) do nothing", [
      kind,
      String(rows[0].id),
    ]);
    await client.query("commit");
    return rows;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    (client as unknown as { release(): void }).release();
  }
}

// Anota que la PC está conectada, como mucho una vez por minuto (cada escritura cuenta en el plan).
let lastHeartbeatWrite = 0;
export async function noteHeartbeat(db: DbClient, now = Date.now(), force = false) {
  if (!force && now - lastHeartbeatWrite < 45_000) return;
  lastHeartbeatWrite = now;
  await db.query(
    "insert into gestion_meta (key, value) values ('pc_last_seen', $1) on conflict (key) do update set value = excluded.value",
    [new Date(now).toISOString()]
  );
}

export function resetHeartbeatThrottle() {
  lastHeartbeatWrite = 0;
}

// ¿La PC del local está conectada? En la PC (y en una instalación completa) siempre sí; en la
// nube, si habló hace menos de PC_ONLINE_WINDOW_MS: es lo que "abre" y "cierra" los pedidos web.
export async function isPcOnline(db: DbClient, now = Date.now()): Promise<boolean> {
  if (!isCloudRole()) return true;
  const value = await cached("pc_last_seen", 10_000, ["gestion_meta"], async () => {
    const { rows } = await db.query<{ value: string | null }>("select value from gestion_meta where key = 'pc_last_seen'");
    return rows[0]?.value ?? "";
  });
  const seen = Date.parse(value);
  return Number.isFinite(seen) && now - seen < PC_ONLINE_WINDOW_MS;
}

// Todo lo que hace la nube cuando la PC llama: confirmaciones, tablas nuevas, estados, "estoy
// conectada" y la bandeja de entrada (en ese orden).
export async function handleSync(db: Db, body: SyncRequest, now = Date.now()): Promise<SyncResponse> {
  await applyAck(db, body.ack ?? { web: [], reserva: [] });
  if (body.publish && typeof body.publish === "object") await applyPublish(db, body.publish);
  if (Array.isArray(body.tracking) && body.tracking.length > 0) await applyTracking(db, body.tracking);
  await noteHeartbeat(db, now);
  return { ok: true, inbox: await readInbox(db) };
}

// ---------------------------------------------------------------------------------------------
// PC: guardar lo que bajó de la nube
// ---------------------------------------------------------------------------------------------

const text = (v: unknown) => (v === undefined || v === null ? null : String(v));

export async function applyInbox(db: Db, inbox: SyncResponse["inbox"]): Promise<{ web: string[]; reserva: string[] }> {
  const done = { web: [] as string[], reserva: [] as string[] };
  if (inbox.web.length === 0 && inbox.reserva.length === 0) return done;
  const client = await db.connect();
  try {
    await client.query("begin");
    for (const w of inbox.web) {
      const items = typeof w.items === "string" ? w.items : JSON.stringify(w.items ?? []);
      // Mismo id que en la nube: si ya está (la nube lo reenvió) no se toca, ni su estado.
      await client.query(
        `insert into gestion_web_orders
           (id, customer_name, customer_phone, customer_address, fulfillment, delivery_zone, shipping_cost, notes, items, total,
            status, created_at, delivery_lat, delivery_lng, payment_method, cash_given)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pendiente', $11, $12, $13, $14, $15)
         on conflict (id) do nothing`,
        [
          String(w.id), String(w.customer_name), String(w.customer_phone), text(w.customer_address), w.fulfillment === "delivery" ? "delivery" : "retiro",
          text(w.delivery_zone), w.shipping_cost ?? 0, text(w.notes), items, w.total, text(w.created_at) ?? new Date().toISOString(),
          w.delivery_lat ?? null, w.delivery_lng ?? null, text(w.payment_method), w.cash_given ?? null,
        ]
      );
      // Igual que al crear un pedido web en el sistema completo: el cliente queda para delivery.
      await client.query(
        `insert into gestion_delivery_customers (phone, name, address, updated_at, created_at)
         values ($1, $2, $3, now(), now())
         on conflict (phone) do update set name = excluded.name,
           address = coalesce(excluded.address, gestion_delivery_customers.address), updated_at = excluded.updated_at`,
        [String(w.customer_phone), String(w.customer_name), text(w.customer_address)]
      );
      done.web.push(String(w.id));
    }
    for (const r of inbox.reserva) {
      await client.query(
        `insert into gestion_reservations
           (id, customer_name, customer_phone, party_size, reservation_date, reservation_time, notes, status, created_at, source)
         values ($1, $2, $3, $4, $5, $6, $7, 'pendiente', $8, 'web')
         on conflict (id) do nothing`,
        [
          String(r.id), String(r.customer_name), String(r.customer_phone), r.party_size, String(r.reservation_date),
          String(r.reservation_time), text(r.notes), text(r.created_at) ?? new Date().toISOString(),
        ]
      );
      done.reserva.push(String(r.id));
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    (client as unknown as { release(): void }).release();
  }
  return done;
}
