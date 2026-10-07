import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDbMode, getPool } from "@/lib/admin/db";
import type { DbClient } from "@/lib/admin/db";

function readJson(file: string) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", file), "utf-8"));
}

type CatalogProduct = { name: string; price: number; inStock?: boolean };

// Sincroniza categorías/productos contra data/catalogo_productos.json cada vez
// que ese archivo cambia (comparando un hash guardado en gestion_meta), no solo
// la primera vez: así una actualización del menú (ej. sacar descontinuados,
// marcar sin stock) se aplica sola en una base que ya tenía datos cargados,
// sin perder pedidos ni clientes. Los productos que ya no están en el archivo
// se pausan (active = false) en vez de borrarse, para poder reactivarlos.
async function syncCatalog(client: DbClient) {
  const raw = readFileSync(path.join(process.cwd(), "data", "catalogo_productos.json"), "utf-8");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const { rows: metaRows } = await client.query<{ value: string }>(
    "select value from gestion_meta where key = $1",
    ["catalog_hash"]
  );
  if (metaRows[0]?.value === hash) return;

  const catalog = JSON.parse(raw) as Record<string, CatalogProduct[]>;
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
    for (const product of products) {
      keep.add(`${categoryId}::${product.name}`);
      await client.query(
        `insert into gestion_products (category_id, name, price, active, in_stock)
         values ($1, $2, $3, true, $4)
         on conflict (category_id, name) do update set price = excluded.price, active = true, in_stock = excluded.in_stock`,
        [categoryId, product.name, product.price, product.inStock !== false]
      );
    }
  }

  const { rows: existing } = await client.query<{ id: number; category_id: number; name: string }>(
    "select id, category_id, name from gestion_products where active = true"
  );
  for (const p of existing) {
    if (!keep.has(`${p.category_id}::${p.name}`)) {
      await client.query("update gestion_products set active = false where id = $1", [p.id]);
    }
  }

  await client.query(
    `insert into gestion_meta (key, value) values ('catalog_hash', $1)
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

let schemaApplied = false;

export async function ensureSeeded() {
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
        await ensureSqliteColumn(client, "gestion_shifts", "expenses_efectivo", "numeric(12, 2) not null default 0");
        await ensureSqliteColumn(client, "gestion_orders", "kitchen_status", "text");
        await ensureSqliteColumn(client, "gestion_orders", "kitchen_sent_at", "text");
        await ensureSqliteColumn(client, "gestion_web_orders", "kitchen_status", "text");
        await ensureSqliteColumn(client, "gestion_web_orders", "kitchen_sent_at", "text");
      }
      schemaApplied = true;
    }

    await syncCatalog(client);

    const { rows: zoneRows } = await client.query("select count(*) as count from gestion_zones");
    if (Number(zoneRows[0].count) > 0) return;

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
  } finally {
    client.release();
  }
}
