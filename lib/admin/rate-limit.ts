import type { NextRequest } from "next/server";
import { getPool } from "@/lib/admin/db";

// Límite de intentos guardado en la base (no en memoria): en Vercel cada pedido
// puede caer en un servidor distinto, así que un contador en memoria no frena a
// nadie. Sirve igual con Postgres y con SQLite.
//
// Cada intento se registra ANTES de contar: si llegan muchos a la vez, el que
// quedó sexto en la base ve 6 y se rechaza, así que mandar intentos en paralelo
// tampoco sirve para pasar el tope.

export interface RateLimitResult {
  ok: boolean;
  /** Segundos hasta que se libere un lugar (solo cuando ok = false). */
  retryAfterSec: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** IP del cliente. En Vercel la pone la plataforma; en la PC del local no hay, y es "local". */
export function clientIp(request: NextRequest): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}

export async function rateLimit(bucket: string, subject: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const pool = getPool();
  const now = Date.now();
  // Limpieza de lo viejo de este tipo de límite (la tabla queda siempre chica).
  await pool.query("delete from gestion_rate_limits where bucket = $1 and created_ms < $2", [bucket, now - DAY_MS]);
  await pool.query("insert into gestion_rate_limits (bucket, subject, created_ms) values ($1, $2, $3)", [
    bucket,
    subject,
    now,
  ]);
  const { rows } = await pool.query<{ n: string | number; oldest: string | number | null }>(
    `select count(*) as n, min(created_ms) as oldest
     from gestion_rate_limits
     where bucket = $1 and subject = $2 and created_ms > $3`,
    [bucket, subject, now - windowMs]
  );
  const count = Number(rows[0]?.n ?? 0);
  if (count <= max) return { ok: true, retryAfterSec: 0 };
  const oldest = Number(rows[0]?.oldest ?? now);
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
}

/**
 * Igual que rateLimit, pero cuenta ELEMENTOS DISTINTOS (por ejemplo, teléfonos distintos
 * consultados desde una conexión): repetir la misma consulta (la pantalla que se refresca
 * sola) no suma. Sirve para frenar el barrido de números sin molestar al cliente real.
 */
export async function rateLimitDistinct(
  bucket: string,
  subject: string,
  item: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const pool = getPool();
  const now = Date.now();
  const seenBucket = `${bucket}:seen`;
  // "|" no aparece en IPs ni teléfonos (Postgres no admite el carácter nulo en textos).
  const seenSubject = `${subject}|${item}`;
  const { rows } = await pool.query(
    "select 1 as found from gestion_rate_limits where bucket = $1 and subject = $2 and created_ms > $3 limit 1",
    [seenBucket, seenSubject, now - windowMs]
  );
  if (rows[0]) return { ok: true, retryAfterSec: 0 };
  const result = await rateLimit(bucket, subject, max, windowMs);
  // Solo se recuerda como "ya consultado" si se permitió (si no, la próxima vez vuelve a contar).
  if (result.ok) {
    await pool.query("delete from gestion_rate_limits where bucket = $1 and created_ms < $2", [seenBucket, now - DAY_MS]);
    await pool.query("insert into gestion_rate_limits (bucket, subject, created_ms) values ($1, $2, $3)", [
      seenBucket,
      seenSubject,
      now,
    ]);
  }
  return result;
}

/** Borra los intentos registrados (por ejemplo, después de un login correcto). */
export async function clearRateLimit(bucket: string, subject: string) {
  await getPool().query("delete from gestion_rate_limits where bucket = $1 and subject = $2", [bucket, subject]);
}

export function tooManyMessage(retryAfterSec: number, what = "intentos") {
  const minutes = Math.ceil(retryAfterSec / 60);
  return `Demasiados ${what}. Probá de nuevo en ${minutes} minuto${minutes === 1 ? "" : "s"}.`;
}

// Topes usados en el sistema (en un solo lugar para poder ajustarlos).
export const LIMITS = {
  // 5 PIN incorrectos seguidos desde la misma conexión bloquean el login 15 minutos.
  login: { max: 5, windowMs: 15 * 60 * 1000 },
  // Pedidos desde el menú online. Holgado porque muchos celulares comparten IP
  // (las compañías móviles agrupan clientes detrás de una misma dirección).
  webOrder: { max: 10, windowMs: 10 * 60 * 1000 },
  reservation: { max: 10, windowMs: 10 * 60 * 1000 },
  // Teléfonos DISTINTOS consultados desde una conexión (tarjeta de fidelidad, mis pedidos):
  // frena el barrido de números; refrescar el propio número no cuenta.
  customerLookup: { max: 30, windowMs: 10 * 60 * 1000 },
} as const;
