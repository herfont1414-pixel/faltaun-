import { getPool, isDbConfigured } from "@/lib/admin/db";
import { isCloudRole } from "@/lib/admin/role";
import { isPcOnline } from "@/lib/admin/sync";

// Link fijo para abrir la caja desde el celular o desde otra PC del local: madero14.vercel.app/caja.
// La PC manda en cada sincronización su dirección en la red del local, y este link lleva ahí. Así,
// aunque el router le cambie la dirección a la caja al reiniciarla, el link guardado sigue andando.

// Solo direcciones de red local (nunca un sitio de internet): http://IP-PRIVADA:PUERTO/admin.
const LAN_URL = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{2,5}\/admin$/;

export function isLanAdminUrl(url: string | null | undefined): url is string {
  return !!url && LAN_URL.test(url);
}

export type CajaTarget = { kind: "redirect"; url: string } | { kind: "local" } | { kind: "unknown" };

export async function cajaTarget(now = Date.now()): Promise<CajaTarget> {
  // En la propia PC (o en una instalación completa), el panel está acá mismo.
  if (!isCloudRole()) return { kind: "local" };
  if (!isDbConfigured()) return { kind: "unknown" };
  // Si la caja no habló hace rato (apagada o sin MaderoSys abierto), la dirección guardada no sirve.
  if (!(await isPcOnline(getPool(), now))) return { kind: "unknown" };
  const { rows } = await getPool().query<{ value: string | null }>("select value from gestion_meta where key = 'caja_lan_url'");
  const url = rows[0]?.value ?? null;
  return isLanAdminUrl(url) ? { kind: "redirect", url } : { kind: "unknown" };
}
