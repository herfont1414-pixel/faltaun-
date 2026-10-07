import type { AdminState } from "@/lib/admin/types";

export type AdminStateResponse = AdminState;

export type Section =
  | "inicio"
  | "mesas"
  | "mostrador"
  | "pedidos-web"
  | "productos"
  | "caja"
  | "reportes"
  | "gastos"
  | "delivery"
  | "express"
  | "reservas";
