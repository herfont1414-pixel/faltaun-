import { getPool } from "@/lib/admin/db";

export interface AuditEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export async function listAuditLog(limit = 200): Promise<AuditEntry[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    user_id: number | null;
    user_name: string | null;
    action: string;
    entity: string | null;
    entity_id: string | null;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
  }>(
    `select a.id, a.user_id, u.name as user_name, a.action, a.entity, a.entity_id,
            a.old_value, a.new_value, a.created_at
     from gestion_audit_log a
     left join gestion_users u on u.id = a.user_id
     order by a.created_at desc
     limit $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    oldValue: r.old_value,
    newValue: r.new_value,
    createdAt: r.created_at,
  }));
}
