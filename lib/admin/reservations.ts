import { getPool } from "@/lib/admin/db";
import type { Reservation, ReservationStatus } from "@/lib/admin/types";

function mapRow(row: any): Reservation {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    partySize: row.party_size,
    date: row.reservation_date,
    time: row.reservation_time,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

export async function createReservation(input: {
  customerName: string;
  customerPhone: string;
  partySize: number;
  date: string;
  time: string;
  notes: string | null;
}): Promise<Reservation> {
  const pool = getPool();
  const { rows } = await pool.query(
    `insert into gestion_reservations
       (customer_name, customer_phone, party_size, reservation_date, reservation_time, notes)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [input.customerName, input.customerPhone, input.partySize, input.date, input.time, input.notes]
  );
  return mapRow(rows[0]);
}

export async function listReservations(status?: ReservationStatus): Promise<Reservation[]> {
  const pool = getPool();
  const { rows } = status
    ? await pool.query(
        "select * from gestion_reservations where status = $1 order by reservation_date, reservation_time",
        [status]
      )
    : await pool.query("select * from gestion_reservations order by created_at desc limit 30");
  return rows.map(mapRow);
}

export async function respondReservation(id: string, status: ReservationStatus) {
  const pool = getPool();
  await pool.query("update gestion_reservations set status = $2, responded_at = now() where id = $1", [
    id,
    status,
  ]);
}
