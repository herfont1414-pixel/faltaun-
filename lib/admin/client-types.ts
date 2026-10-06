import type { AdminState } from "@/lib/admin/types";

export type AdminStateResponse = AdminState;

export type Section =
  | "mesas"
  | "mostrador"
  | "pedidos-web"
  | "productos"
  | "caja"
  | "reportes"
  | "delivery"
  | "express"
  | "reservas";
