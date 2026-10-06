import { readFileSync } from "node:fs";
import path from "node:path";
import { getDbMode, getPool } from "@/lib/admin/db";

function readJson(file: string) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", file), "utf-8"));
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
      schemaApplied = true;
    }

    const { rows: seededRows } = await client.query("select count(*) as count from gestion_categories");
    if (Number(seededRows[0].count) > 0) return;

    const catalog = readJson("catalogo_productos.json") as Record<
      string,
      { name: string; price: number }[]
    >;
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
        await client.query(
          `insert into gestion_products (category_id, name, price)
           values ($1, $2, $3)
           on conflict (category_id, name) do update set price = excluded.price`,
          [categoryId, product.name, product.price]
        );
      }
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
  } finally {
    client.release();
  }
}
