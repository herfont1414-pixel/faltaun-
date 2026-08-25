import type { GestionState, OrderWithTotal } from "@/lib/gestion/types";

export interface GestionStateResponse extends GestionState {
  openOrders: OrderWithTotal[];
  closedOrders: OrderWithTotal[];
}

export type Section = "mesas" | "mostrador" | "delivery" | "express" | "reservas";
