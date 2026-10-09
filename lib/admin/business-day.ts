// El local está en Argentina: UTC-3 todo el año (no hay horario de verano).
// El servidor de Vercel corre en UTC y la PC del local en hora local, así que
// "hoy" no se puede calcular con setHours() del servidor: entre las 21:00 y las
// 24:00 del local ya es "mañana" para Vercel y el día arrancaba a las 21:00.
const BUSINESS_UTC_OFFSET_HOURS = -3;
const HOUR_MS = 3_600_000;

// Instante en que empezó el día (00:00 hora del local) que contiene a `now`.
export function startOfBusinessDay(now: Date = new Date()): Date {
  const wallClock = new Date(now.getTime() + BUSINESS_UTC_OFFSET_HOURS * HOUR_MS);
  wallClock.setUTCHours(0, 0, 0, 0);
  return new Date(wallClock.getTime() - BUSINESS_UTC_OFFSET_HOURS * HOUR_MS);
}
