import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDbMode, getPool } from "@/lib/admin/db";
import { isCloudRole } from "@/lib/admin/role";
import type { DbClient } from "@/lib/admin/db";
import { hashPin } from "@/lib/admin/auth";
import { ensureDefaultRewards } from "@/lib/admin/loyalty";

function readJson(file: string) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", file), "utf-8"));
}

// stock: cantidad controlada (baja con cada venta); sin stock = sin control de cantidad.
type CatalogProduct = { name: string; price: number; inStock?: boolean; stock?: number };

// Sincroniza categorías/productos contra data/catalogo_productos.json cada vez
// que ese archivo cambia (comparando un hash guardado en gestion_meta), no solo
// la primera vez: así una actualización del menú (ej. sacar descontinuados,
// marcar sin stock) se aplica sola en una base que ya tenía datos cargados,
// sin perder pedidos ni clientes. Los productos que ya no están en el archivo
// se pausan (active = false) en vez de borrarse, para poder reactivarlos; los creados
// desde el panel (created_in_panel) no se tocan.
async function syncCatalog(client: DbClient) {
  const raw = readFileSync(path.join(process.cwd(), "data", "catalogo_productos.json"), "utf-8");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const { rows: metaRows } = await client.query<{ value: string }>(
    "select value from gestion_meta where key = $1",
    ["catalog_hash"]
  );
  if (metaRows[0]?.value === hash) return;

  const catalog = JSON.parse(raw) as Record<string, CatalogProduct[]>;
  // Todo en una transacción y en lotes (no un producto por consulta): con la base en la
  // nube, 200 consultas sueltas podían pasar el tiempo máximo de una función de Vercel y
  // la carga quedaba a medias, repitiéndose en cada pedido. Así se aplica entera o nada.
  await client.query("begin");
  try {
    const keep = new Set<string>();
    let sortOrder = 0;
    for (const [categoryName, products] of Object.entries(catalog)) {
      sortOrder += 1;
      const { rows } = await client.query(
        `insert into gestion_categories (name, sort_order) values ($1, $2)
         on conflict (name) do update set sort_order = excluded.sort_order
         returning id`,
        [categoryName, sortOrder]
      );
      const categoryId = rows[0].id;
      for (let i = 0; i < products.length; i += CATALOG_BATCH) {
        const batch = products.slice(i, i + CATALOG_BATCH);
        const values: string[] = [];
        const params: unknown[] = [];
        for (const product of batch) {
          keep.add(`${categoryId}::${product.name}`);
          const stockQty =
            typeof product.stock === "number" && Number.isFinite(product.stock) ? Math.max(0, Math.floor(product.stock)) : null;
          const n = params.length;
          values.push(`($${n + 1}, $${n + 2}, $${n + 3}, true, $${n + 4}, $${n + 5})`);
          params.push(categoryId, product.name, product.price, product.inStock !== false, stockQty);
        }
        await client.query(
          `insert into gestion_products (category_id, name, price, active, in_stock, stock_qty)
           values ${values.join(", ")}
           on conflict (category_id, name) do update set
             price = excluded.price, active = true, in_stock = excluded.in_stock, stock_qty = excluded.stock_qty`,
          params
        );
      }
    }

    const { rows: existing } = await client.query<{ id: number; category_id: number; name: string }>(
      "select id, category_id, name from gestion_products where active = true and created_in_panel = false"
    );
    const toPause = existing.filter((p) => !keep.has(`${p.category_id}::${p.name}`)).map((p) => Number(p.id));
    for (let i = 0; i < toPause.length; i += CATALOG_BATCH) {
      const ids = toPause.slice(i, i + CATALOG_BATCH);
      await client.query(
        `update gestion_products set active = false where id in (${ids.map((_, j) => `$${j + 1}`).join(", ")})`,
        ids
      );
    }

    await client.query(
      `insert into gestion_meta (key, value) values ('catalog_hash', $1)
       on conflict (key) do update set value = excluded.value`,
      [hash]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

const CATALOG_BATCH = 50;

// Productos activos en Fudo que no estaban en el catálogo y el local pidió tener. Se
// cargan UNA sola vez (marca en gestion_meta) como si se hubieran creado desde el panel:
// no tocan el resto del catálogo ni el stock, y si después se pausan o editan a mano,
// queda así.
const MISSING_FUDO_PRODUCTS: { key: string; category: string; name: string; price: number }[] = [
  { key: "champinon_2026_10", category: "Pizzas", name: "Pizza Champiñon", price: 15000 },
  { key: "champinon_2026_10", category: "Media Pizza 1/2", name: "1/2 Champiñon", price: 8000 },
];

async function addMissingFudoProducts(client: DbClient) {
  for (const key of [...new Set(MISSING_FUDO_PRODUCTS.map((p) => p.key))]) {
    const metaKey = `extra_products_${key}`;
    const { rows } = await client.query("select 1 from gestion_meta where key = $1", [metaKey]);
    if (rows[0]) continue;
    for (const p of MISSING_FUDO_PRODUCTS.filter((x) => x.key === key)) {
      const { rows: cat } = await client.query<{ id: number }>("select id from gestion_categories where name = $1", [p.category]);
      if (!cat[0]) continue;
      await client.query(
        `insert into gestion_products (category_id, name, price, active, in_stock, stock_qty, created_in_panel)
         values ($1, $2, $3, true, true, null, true)
         on conflict (category_id, name) do nothing`,
        [cat[0].id, p.name, p.price]
      );
    }
    await client.query("insert into gestion_meta (key, value) values ($1, 'ok') on conflict (key) do nothing", [metaKey]);
  }
}

interface CsvIngredient {
  externalId: number;
  category: string;
  name: string;
  cost: number;
  supplier: string | null;
  unit: string;
  trackStock: boolean;
  stockQty: number | null;
}

// Parser manual, no una librería de CSV: el archivo es simple (sin comas ni
// comillas dentro de los campos), así que no hace falta una dependencia más.
function parseIngredientesCsv(raw: string): CsvIngredient[] {
  const lines = raw.trim().split(/\r?\n/);
  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const cols = line.split(",");
      const stockRaw = (cols[7] ?? "").trim();
      return {
        externalId: Number(cols[0]),
        category: (cols[1] ?? "").trim(),
        name: (cols[2] ?? "").trim(),
        cost: Number(cols[3]) || 0,
        supplier: (cols[4] ?? "").trim() || null,
        unit: (cols[5] ?? "").trim() || "unid.",
        trackStock: (cols[6] ?? "").trim().toLowerCase() === "si",
        stockQty: stockRaw ? Number(stockRaw) : null,
      };
    })
    .filter((ing) => ing.name && Number.isFinite(ing.externalId));
}

// Igual que syncCatalog: vuelve a sincronizar cada vez que cambia el CSV
// (por hash), no solo la primera vez, y deja constancia en el historial de
// costos cuando el costo de un ingrediente efectivamente cambió.
async function syncIngredients(client: DbClient) {
  const raw = readFileSync(path.join(process.cwd(), "data", "ingredientes.csv"), "utf-8");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const { rows: metaRows } = await client.query<{ value: string }>(
    "select value from gestion_meta where key = $1",
    ["ingredients_hash"]
  );
  if (metaRows[0]?.value === hash) return;

  const ingredients = parseIngredientesCsv(raw);
  for (const ing of ingredients) {
    const { rows: existingRows } = await client.query<{ id: number; cost: string | number }>(
      "select id, cost from gestion_ingredients where external_id = $1",
      [ing.externalId]
    );
    const { rows } = await client.query<{ id: number }>(
      `insert into gestion_ingredients (external_id, category, name, cost, supplier, unit, track_stock, stock_qty)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (external_id) do update set
         category = excluded.category, name = excluded.name, cost = excluded.cost,
         supplier = excluded.supplier, unit = excluded.unit, track_stock = excluded.track_stock,
         updated_at = now()
       returning id`,
      [ing.externalId, ing.category, ing.name, ing.cost, ing.supplier, ing.unit, ing.trackStock, ing.stockQty]
    );
    const id = rows[0].id;
    const previousCost = existingRows[0] ? Number(existingRows[0].cost) : null;
    if (previousCost === null || previousCost !== ing.cost) {
      await client.query("insert into gestion_ingredient_price_history (ingredient_id, cost) values ($1, $2)", [
        id,
        ing.cost,
      ]);
    }
  }

  await client.query(
    `insert into gestion_meta (key, value) values ('ingredients_hash', $1)
     on conflict (key) do update set value = excluded.value`,
    [hash]
  );
}

// A diferencia de Postgres, SQLite no soporta "alter table add column if not
// exists": "create table if not exists" tampoco agrega columnas a una tabla
// que ya existía de antes. Por eso las columnas nuevas en tablas viejas se
// migran acá a mano, revisando primero si ya están.
async function ensureSqliteColumn(client: DbClient, table: string, column: string, definition: string) {
  const { rows } = await client.query<{ name: string }>(`pragma table_info(${table})`);
  if (rows.some((r) => r.name === column)) return;
  await client.query(`alter table ${table} add column ${column} ${definition}`);
}

// Compatibilidad con el esquema de auth anterior (PIN único en ADMIN_PIN
// comparado directo): si todavía no hay ningún usuario creado y existe esa
// variable de entorno, se crea un usuario admin con ese mismo PIN (ya
// hasheado) para que el local no quede sin acceso al migrar.
async function ensureDefaultAdminUser(client: DbClient) {
  const pin = process.env.ADMIN_PIN;
  if (!pin) return;
  const { rows } = await client.query<{ count: string | number }>(
    "select count(*) as count from gestion_users"
  );
  if (Number(rows[0].count) > 0) return;
  await client.query(
    `insert into gestion_users (name, pin_hash, role, active) values ($1, $2, 'admin', true)`,
    ["Administrador", hashPin(pin)]
  );
}

let schemaApplied = false;
let rewardsSeeded = false;
// Una vez que el proceso verificó todo (esquema, catálogo, ingredientes, mesas), no se
// vuelve a consultar en cada pedido: los archivos de data/ no cambian mientras el
// servidor está andando (una actualización reinicia el proceso). Con la base en la nube,
// esto ahorra varias idas y vueltas por cada toque en el panel.
let seededOnce = false;

/** Solo para tests: fuerza a que ensureSeeded vuelva a verificar todo. */
export function resetSeedCache() {
  seededOnce = false;
  // También el esquema y los premios: otra base (tests con una PC y una nube) los necesita de nuevo.
  schemaApplied = false;
  rewardsSeeded = false;
}

export async function ensureSeeded() {
  if (seededOnce) return;
  const pool = getPool();
  const client = await pool.connect();
  try {
    if (!schemaApplied) {
      // El schema se vuelve a aplicar siempre que arranca el proceso (todo son
      // "create table/index if not exists" y "alter table add column if not
      // exists", así que no duplica nada): así una base que ya tenía datos de
      // antes también recibe las tablas o columnas nuevas que se agreguen más
      // adelante, sin tener que resetearla a mano.
      const schemaFile = getDbMode() === "sqlite" ? "schema.sqlite.sql" : "schema.sql";
      const schema = readFileSync(path.join(process.cwd(), "db", schemaFile), "utf-8");
      await client.query(schema);
      if (getDbMode() === "sqlite") {
        await ensureSqliteColumn(client, "gestion_products", "in_stock", "boolean not null default 1");
        await ensureSqliteColumn(client, "gestion_products", "stock_qty", "int");
        await ensureSqliteColumn(client, "gestion_products", "show_online", "boolean not null default 1");
        await ensureSqliteColumn(client, "gestion_products", "created_in_panel", "boolean not null default 0");
        await ensureSqliteColumn(client, "gestion_shifts", "expenses_efectivo", "numeric(12, 2) not null default 0");
        await ensureSqliteColumn(client, "gestion_orders", "kitchen_status", "text");
        await ensureSqliteColumn(client, "gestion_orders", "kitchen_sent_at", "text");
        await ensureSqliteColumn(client, "gestion_web_orders", "kitchen_status", "text");
        await ensureSqliteColumn(client, "gestion_web_orders", "kitchen_sent_at", "text");
        await ensureSqliteColumn(client, "gestion_orders", "is_delivery", "boolean not null default 0");
        await ensureSqliteColumn(client, "gestion_orders", "customer_name", "text");
        await ensureSqliteColumn(client, "gestion_orders", "customer_phone", "text");
        await ensureSqliteColumn(client, "gestion_orders", "customer_address", "text");
        await ensureSqliteColumn(client, "gestion_orders", "delivery_zone", "text");
        await ensureSqliteColumn(client, "gestion_orders", "shipping_cost", "numeric(10, 2) not null default 0");
        await ensureSqliteColumn(client, "gestion_orders", "delivery_person", "text");
        await ensureSqliteColumn(client, "gestion_orders", "delivery_status", "text");
        await ensureSqliteColumn(client, "gestion_web_orders", "customer_address", "text");
        await ensureSqliteColumn(
          client,
          "gestion_web_orders",
          "fulfillment",
          "text not null default 'retiro'"
        );
        await ensureSqliteColumn(client, "gestion_web_orders", "delivery_zone", "text");
        await ensureSqliteColumn(
          client,
          "gestion_web_orders",
          "shipping_cost",
          "numeric(10, 2) not null default 0"
        );
        await ensureSqliteColumn(client, "gestion_web_orders", "order_id", "text references gestion_orders(id) on delete set null");
        await ensureSqliteColumn(client, "gestion_orders", "channel", "text");
        await ensureSqliteColumn(client, "gestion_orders", "pay_method_hint", "text");
        await ensureSqliteColumn(client, "gestion_orders", "cash_given", "numeric(12, 2)");
        await ensureSqliteColumn(client, "gestion_web_orders", "cash_given", "numeric(12, 2)");
        await ensureSqliteColumn(client, "gestion_business_config", "transfer_alias", "text");
        await ensureSqliteColumn(client, "gestion_business_config", "transfer_holder", "text");
        await ensureSqliteColumn(client, "gestion_web_orders", "payment_method", "text");
        await ensureSqliteColumn(client, "gestion_delivery_zones", "max_km", "numeric(6, 2)");
        await ensureSqliteColumn(client, "gestion_business_config", "latitude", "real");
        await ensureSqliteColumn(client, "gestion_business_config", "longitude", "real");
        await ensureSqliteColumn(client, "gestion_web_orders", "delivery_lat", "real");
        await ensureSqliteColumn(client, "gestion_web_orders", "delivery_lng", "real");
        await ensureSqliteColumn(client, "gestion_orders", "delivery_lat", "real");
        await ensureSqliteColumn(client, "gestion_orders", "delivery_lng", "real");
        await ensureSqliteColumn(client, "gestion_loyalty_accounts", "name", "text");
        await ensureSqliteColumn(client, "gestion_loyalty_accounts", "order_count", "int not null default 0");
        await ensureSqliteColumn(
          client,
          "gestion_loyalty_accounts",
          "total_spent",
          "numeric(12, 2) not null default 0"
        );
        await ensureSqliteColumn(client, "gestion_loyalty_accounts", "origin", "text");
        await ensureSqliteColumn(client, "gestion_products", "print_area_id", "int");
        await ensureSqliteColumn(client, "gestion_orders", "notes", "text");
        await ensureSqliteColumn(client, "gestion_order_items", "note", "text");
        await ensureSqliteColumn(client, "gestion_order_items", "comanda_printed_qty", "int not null default 0");
        await ensureSqliteColumn(client, "gestion_web_orders", "pos_order_status", "text");
        await ensureSqliteColumn(client, "gestion_web_orders", "pos_delivery_status", "text");
        await ensureSqliteColumn(client, "gestion_web_orders", "pos_kitchen_status", "text");
        await ensureSqliteColumn(client, "gestion_business_config", "logo_url", "text");
        await ensureSqliteColumn(client, "gestion_print_config", "direct_print_enabled", "boolean not null default 0");
        await ensureSqliteColumn(client, "gestion_print_config", "printer_name", "text");
        await ensureSqliteColumn(client, "gestion_orders", "party_size", "int");
        await ensureSqliteColumn(client, "gestion_orders", "waiter", "text");
        await ensureSqliteColumn(client, "gestion_order_items", "product_id", "int");
        await ensureSqliteColumn(client, "gestion_shifts", "ingresos_efectivo", "numeric(12, 2) not null default 0");
        await ensureSqliteColumn(client, "gestion_shifts", "retiros_efectivo", "numeric(12, 2) not null default 0");
        await ensureSqliteColumn(client, "gestion_shifts", "ajustes_efectivo", "numeric(12, 2) not null default 0");
        await ensureSqliteColumn(client, "gestion_order_payments", "received_amount", "numeric(12, 2)");
        await ensureSqliteColumn(client, "gestion_order_payments", "change_amount", "numeric(12, 2)");
        await ensureSqliteColumn(client, "gestion_ingredients", "track_stock", "boolean not null default 0");
        await ensureSqliteColumn(client, "gestion_ingredients", "stock_qty", "numeric(12, 3)");
        await ensureSqliteColumn(client, "gestion_delivery_customers", "created_at", "text");
        await client.query(
          "update gestion_delivery_customers set created_at = updated_at where created_at is null"
        );
        await ensureSqliteColumn(client, "gestion_reservations", "table_number", "int");
        await ensureSqliteColumn(client, "gestion_reservations", "source", "text not null default 'web'");
        await ensureSqliteColumn(client, "gestion_reservations", "created_by", "int");
        await client.query("create index if not exists gestion_reservations_date_idx on gestion_reservations(reservation_date)");
        await ensureSqliteColumn(client, "gestion_loyalty_transactions", "stamp_day", "text");
        await ensureSqliteColumn(client, "gestion_loyalty_transactions", "user_id", "int");
        await client.query(
          `create unique index if not exists gestion_loyalty_one_stamp_per_day
             on gestion_loyalty_transactions(phone, stamp_day)
             where type = 'stamp' and stamp_day is not null`
        );
      }
      // Una sola vez: lo que ya estaba enviado a cocina antes de esta versión se da por impreso
      // (si no, el primer "Enviar a cocina" reimprimiría todo lo de las mesas abiertas).
      const { rows: backfilled } = await client.query("select 1 from gestion_meta where key = 'comanda_printed_backfill'");
      if (!backfilled[0]) {
        await client.query("update gestion_order_items set comanda_printed_qty = qty where sent_to_kitchen = true");
        await client.query("insert into gestion_meta (key, value) values ('comanda_printed_backfill', 'ok') on conflict (key) do nothing");
      }
      await client.query(
        `insert into gestion_print_areas (nombre) values ('Barra'), ('Cocina')
         on conflict (nombre) do nothing`
      );
      await client.query(`insert into gestion_print_config (id) values (1) on conflict (id) do nothing`);
      await client.query(`insert into gestion_afip_config (id) values (1) on conflict (id) do nothing`);
      await client.query(`insert into gestion_business_config (id) values (1) on conflict (id) do nothing`);
      schemaApplied = true;
    }

    // En la nube el menú, los precios y la fidelidad vienen de la PC (sync.ts): no se carga nada
    // desde los archivos ni se crean mesas, usuarios o premios propios.
    if (isCloudRole()) {
      seededOnce = true;
      return;
    }
    await syncCatalog(client);
    await addMissingFudoProducts(client);
    await syncIngredients(client);
    await ensureDefaultAdminUser(client);
    if (!rewardsSeeded) {
      // Premios de fidelidad por defecto: se crean una sola vez y no se pisan después.
      await ensureDefaultRewards(client);
      rewardsSeeded = true;
    }

    const { rows: zoneRows } = await client.query("select count(*) as count from gestion_zones");
    if (Number(zoneRows[0].count) > 0) {
      seededOnce = true;
      return;
    }

    const zones = [
      { name: "salon", from: 1, to: 35 },
      { name: "terraza", from: 36, to: 45 },
    ];
    for (const [i, zone] of zones.entries()) {
      const { rows } = await client.query(
        `insert into gestion_zones (name, sort_order) values ($1, $2)
         on conflict (name) do update set sort_order = excluded.sort_order
         returning id`,
        [zone.name, i]
      );
      const zoneId = rows[0].id;
      for (let n = zone.from; n <= zone.to; n++) {
        await client.query(
          `insert into gestion_tables (zone_id, number) values ($1, $2)
           on conflict (number) do nothing`,
          [zoneId, n]
        );
      }
    }

    const customers = readJson("clientes.json") as {
      externalId: number;
      name: string;
      phone: string | null;
      balance: number;
      cuentaCorriente: boolean;
      active: boolean;
    }[];
    const customerIdByName = new Map<string, number>();
    for (const c of customers) {
      const { rows } = await client.query(
        `insert into gestion_customers (external_id, name, phone, balance, cuenta_corriente, active)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (external_id) do update set
           name = excluded.name,
           phone = excluded.phone,
           balance = excluded.balance,
           cuenta_corriente = excluded.cuenta_corriente,
           active = excluded.active
         returning id`,
        [c.externalId, c.name, c.phone, c.balance, c.cuentaCorriente, c.active]
      );
      if (rows[0]) customerIdByName.set(c.name, rows[0].id);
    }

    const ledger = readJson("cuentas_corrientes.json") as {
      externalId: number;
      customerName: string;
      date: string;
      amount: number;
      type: string;
      paymentMethod: string;
      deleted: boolean;
    }[];
    for (const m of ledger) {
      if (m.deleted) continue;
      const customerId = customerIdByName.get(m.customerName);
      if (!customerId) continue;
      await client.query(
        `insert into gestion_customer_ledger (external_id, customer_id, occurred_at, amount, type, payment_method)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (external_id) do nothing`,
        [m.externalId, customerId, m.date, m.amount, m.type, m.paymentMethod]
      );
    }

    const suppliers = readJson("proveedores.json") as {
      externalId: number;
      name: string;
      phone: string | null;
      address: string | null;
      active: boolean;
    }[];
    for (const s of suppliers) {
      await client.query(
        `insert into gestion_suppliers (external_id, name, phone, address, active)
         values ($1, $2, $3, $4, $5)
         on conflict (external_id) do update set
           name = excluded.name, phone = excluded.phone, address = excluded.address, active = excluded.active`,
        [s.externalId, s.name, s.phone, s.address, s.active]
      );
    }
  } finally {
    client.release();
  }
}
