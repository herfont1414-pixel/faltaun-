import { getPool } from "@/lib/admin/db";
import type { BusinessConfig } from "@/lib/admin/types";

const DEFAULTS: BusinessConfig = {
  name: "",
  address: "",
  hours: "",
  whatsappNumber: "",
};

export async function getBusinessConfig(): Promise<BusinessConfig> {
  const pool = getPool();
  const { rows } = await pool.query<{
    name: string | null;
    address: string | null;
    hours: string | null;
    whatsapp_number: string | null;
  }>("select name, address, hours, whatsapp_number from gestion_business_config where id = 1");
  const row = rows[0];
  if (!row) return DEFAULTS;
  return {
    name: row.name ?? "",
    address: row.address ?? "",
    hours: row.hours ?? "",
    whatsappNumber: row.whatsapp_number ?? "",
  };
}

export async function updateBusinessConfig(patch: Partial<BusinessConfig>): Promise<BusinessConfig> {
  const current = await getBusinessConfig();
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next: BusinessConfig = { ...current, ...definedPatch };
  const pool = getPool();
  await pool.query(
    `insert into gestion_business_config (id, name, address, hours, whatsapp_number)
     values (1, $1, $2, $3, $4)
     on conflict (id) do update set
       name = excluded.name,
       address = excluded.address,
       hours = excluded.hours,
       whatsapp_number = excluded.whatsapp_number`,
    [next.name, next.address, next.hours, next.whatsappNumber]
  );
  return next;
}
