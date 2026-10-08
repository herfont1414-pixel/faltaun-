import { getPool } from "@/lib/admin/db";
import type { AfipConfig } from "@/lib/admin/types";

const DEFAULTS: AfipConfig = {
  cuit: "",
  puntoVenta: null,
  condicionIva: "",
  habilitado: false,
};

export async function getAfipConfig(): Promise<AfipConfig> {
  const pool = getPool();
  const { rows } = await pool.query<{
    cuit: string | null;
    punto_venta: number | null;
    condicion_iva: string | null;
    habilitado: boolean;
  }>("select cuit, punto_venta, condicion_iva, habilitado from gestion_afip_config where id = 1");
  const row = rows[0];
  if (!row) return DEFAULTS;
  return {
    cuit: row.cuit ?? "",
    puntoVenta: row.punto_venta,
    condicionIva: row.condicion_iva ?? "",
    habilitado: !!row.habilitado,
  };
}

export async function updateAfipConfig(patch: Partial<AfipConfig>): Promise<AfipConfig> {
  const current = await getAfipConfig();
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next: AfipConfig = { ...current, ...definedPatch };
  const pool = getPool();
  await pool.query(
    `insert into gestion_afip_config (id, cuit, punto_venta, condicion_iva, habilitado)
     values (1, $1, $2, $3, $4)
     on conflict (id) do update set
       cuit = excluded.cuit,
       punto_venta = excluded.punto_venta,
       condicion_iva = excluded.condicion_iva,
       habilitado = excluded.habilitado`,
    [next.cuit, next.puntoVenta, next.condicionIva, next.habilitado]
  );
  return next;
}
