import { getPool } from "@/lib/admin/db";
import { hashPin, verifyPin, type Role } from "@/lib/admin/auth";

export interface GestionUser {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

function mapUser(row: { id: number; name: string; role: Role; active: boolean; created_at: string }): GestionUser {
  return { id: row.id, name: row.name, role: row.role, active: row.active, createdAt: row.created_at };
}

export async function listUsers(): Promise<GestionUser[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select id, name, role, active, created_at from gestion_users order by created_at asc"
  );
  return rows.map(mapUser);
}

export async function createUser(params: { name: string; pin: string; role: Role }): Promise<GestionUser> {
  const name = params.name.trim();
  if (!name) throw new Error("Falta el nombre");
  if (!/^\d{4,6}$/.test(params.pin)) throw new Error("El PIN debe tener entre 4 y 6 dígitos");

  const pool = getPool();
  const { rows: existing } = await pool.query<{ pin_hash: string }>(
    "select pin_hash from gestion_users where active = true"
  );
  if (existing.some((u) => verifyPin(params.pin, u.pin_hash))) {
    throw new Error("Ese PIN ya lo usa otro usuario activo");
  }

  const { rows } = await pool.query(
    `insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true)
     returning id, name, role, active, created_at`,
    [name, hashPin(params.pin), params.role]
  );
  return mapUser(rows[0]);
}

export async function updateUser(
  id: number,
  patch: { name?: string; role?: Role; active?: boolean; pin?: string }
): Promise<GestionUser> {
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(patch.name.trim());
  }
  if (patch.role !== undefined) {
    sets.push(`role = $${i++}`);
    values.push(patch.role);
  }
  if (patch.active !== undefined) {
    sets.push(`active = $${i++}`);
    values.push(patch.active);
  }
  if (patch.pin !== undefined) {
    if (!/^\d{4,6}$/.test(patch.pin)) throw new Error("El PIN debe tener entre 4 y 6 dígitos");
    sets.push(`pin_hash = $${i++}`);
    values.push(hashPin(patch.pin));
  }
  if (sets.length === 0) {
    const { rows } = await pool.query(
      "select id, name, role, active, created_at from gestion_users where id = $1",
      [id]
    );
    return mapUser(rows[0]);
  }

  const demotesOrDisables =
    patch.active === false || (patch.role !== undefined && patch.role !== "admin");
  if (demotesOrDisables) {
    const { rows: current } = await pool.query<{ role: Role; active: boolean }>(
      "select role, active from gestion_users where id = $1",
      [id]
    );
    if (current[0]?.role === "admin" && current[0]?.active) {
      const { rows: admins } = await pool.query<{ count: string | number }>(
        "select count(*) as count from gestion_users where role = 'admin' and active = true and id <> $1",
        [id]
      );
      if (Number(admins[0].count) === 0) {
        throw new Error("No se puede desactivar/degradar al único administrador activo");
      }
    }
  }

  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query(
    `update gestion_users set ${sets.join(", ")} where id = $${i} returning id, name, role, active, created_at`,
    values
  );
  if (!rows[0]) throw new Error("Usuario no encontrado");
  return mapUser(rows[0]);
}
