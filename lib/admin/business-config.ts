import { getPool } from "@/lib/admin/db";
import type { BusinessConfig } from "@/lib/admin/types";

const DEFAULTS: BusinessConfig = {
  name: "",
  address: "",
  hours: "",
  whatsappNumber: "",
  logoUrl: "",
  transferAlias: "",
  transferHolder: "",
};

export async function getBusinessConfig(): Promise<BusinessConfig> {
  const pool = getPool();
  const { rows } = await pool.query<{
    name: string | null;
    address: string | null;
    hours: string | null;
    whatsapp_number: string | null;
    logo_url: string | null;
    transfer_alias: string | null;
    transfer_holder: string | null;
  }>(
    "select name, address, hours, whatsapp_number, logo_url, transfer_alias, transfer_holder from gestion_business_config where id = 1"
  );
  const row = rows[0];
  if (!row) return DEFAULTS;
  return {
    name: row.name ?? "",
    address: row.address ?? "",
    hours: row.hours ?? "",
    whatsappNumber: row.whatsapp_number ?? "",
    logoUrl: row.logo_url ?? "",
    transferAlias: row.transfer_alias ?? "",
    transferHolder: row.transfer_holder ?? "",
  };
}

export async function updateBusinessConfig(patch: Partial<BusinessConfig>): Promise<BusinessConfig> {
  const current = await getBusinessConfig();
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next: BusinessConfig = { ...current, ...definedPatch };
  const pool = getPool();
  await pool.query(
    `insert into gestion_business_config
       (id, name, address, hours, whatsapp_number, logo_url, transfer_alias, transfer_holder)
     values (1, $1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do update set
       name = excluded.name,
       address = excluded.address,
       hours = excluded.hours,
       whatsapp_number = excluded.whatsapp_number,
       logo_url = excluded.logo_url,
       transfer_alias = excluded.transfer_alias,
       transfer_holder = excluded.transfer_holder`,
    [next.name, next.address, next.hours, next.whatsappNumber, next.logoUrl, next.transferAlias.trim(), next.transferHolder.trim()]
  );
  return next;
}
