import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("Falta la variable de entorno DATABASE_URL.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

function readJson(file) {
  return JSON.parse(readFileSync(path.join(root, "data", file), "utf-8"));
}

async function run() {
  const client = await pool.connect();
  try {
    console.log("Aplicando schema...");
    const schema = readFileSync(path.join(root, "db", "schema.sql"), "utf-8");
    await client.query(schema);

    console.log("Cargando categorías y productos...");
    const catalog = readJson("catalogo_productos.json");
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

    console.log("Cargando zonas y mesas...");
    const zones = [
      { name: "salon", label: "Salón", from: 1, to: 35 },
      { name: "terraza", label: "Terraza", from: 36, to: 45 },
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

    console.log("Cargando clientes...");
    const customers = readJson("clientes.json");
    const customerIdByName = new Map();
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

    console.log("Cargando movimientos de cuenta corriente...");
    const ledger = readJson("cuentas_corrientes.json");
    let skipped = 0;
    for (const m of ledger) {
      if (m.deleted) continue;
      const customerId = customerIdByName.get(m.customerName);
      if (!customerId) {
        skipped += 1;
        continue;
      }
      await client.query(
        `insert into gestion_customer_ledger (external_id, customer_id, occurred_at, amount, type, payment_method)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (external_id) do nothing`,
        [m.externalId, customerId, m.date, m.amount, m.type, m.paymentMethod]
      );
    }
    if (skipped > 0) {
      console.log(`  (${skipped} movimientos omitidos: cliente no encontrado)`);
    }

    console.log("Listo.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
