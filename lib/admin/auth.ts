import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/admin/db";
import type { DbClient } from "@/lib/admin/db";

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Role = "admin" | "encargado" | "mozo" | "cocina";
export const ROLES: Role[] = ["admin", "encargado", "mozo", "cocina"];

export interface AuthUser {
  id: number;
  name: string;
  role: Role;
}

// El PIN nunca se guarda ni se compara en texto plano, y nunca se usa como
// valor de cookie/sesión. Se hashea con scrypt (salt al azar por usuario) y
// se compara con comparación de tiempo constante.
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: number): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const pool = getPool();
  await pool.query(
    "insert into gestion_sessions (token, user_id, expires_at) values ($1, $2, $3)",
    [token, userId, expiresAt]
  );
  return token;
}

export async function destroySession(token: string): Promise<void> {
  const pool = getPool();
  await pool.query("delete from gestion_sessions where token = $1", [token]);
}

export async function findUserByPin(pin: string): Promise<AuthUser | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: number; name: string; role: Role; pin_hash: string }>(
    "select id, name, role, pin_hash from gestion_users where active = true"
  );
  const match = rows.find((u) => verifyPin(pin, u.pin_hash));
  if (!match) return null;
  return { id: match.id, name: match.name, role: match.role };
}

export async function getSessionUser(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const pool = getPool();
  const { rows } = await pool.query<{ id: number; name: string; role: Role }>(
    `select u.id, u.name, u.role
     from gestion_sessions s
     join gestion_users u on u.id = s.user_id
     where s.token = $1 and s.expires_at > now() and u.active = true`,
    [token]
  );
  return rows[0] ?? null;
}

// Para usar en route handlers (Node runtime, con acceso a la base). El
// middleware en Edge Runtime no puede abrir una conexión pg/sqlite, así que
// solo hace una verificación barata de presencia de cookie para redirigir
// más rápido en las páginas; la autorización real para cada operación
// sensible se valida acá, en el handler de cada ruta.
export async function requireUser(request: NextRequest, roles?: Role[]): Promise<AuthUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(token);
  if (!user) return null;
  if (roles && !roles.includes(user.role)) return null;
  return user;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

export async function recordAudit(params: {
  userId: number | null;
  action: string;
  entity?: string;
  entityId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
  // Para registrar la auditoría dentro de la misma transacción de la operación.
  client?: DbClient;
}) {
  const pool = params.client ?? getPool();
  await pool.query(
    `insert into gestion_audit_log (user_id, action, entity, entity_id, old_value, new_value)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      params.userId,
      params.action,
      params.entity ?? null,
      params.entityId != null ? String(params.entityId) : null,
      params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
      params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
    ]
  );
}
