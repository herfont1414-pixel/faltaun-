// Validación y cálculo de pagos, sin base de datos ni React: lo usan tanto el
// servidor (finalizeOrder, que es la autoridad) como la pantalla de cobro
// (para mostrar vuelto y saldo restante con exactamente las mismas cuentas).
import type { OrderPayment, PaymentMethod } from "@/lib/admin/types";

export const PAYMENT_METHODS: PaymentMethod[] = ["efectivo", "transferencia", "cuenta_corriente"];

// Todo se compara en centavos enteros para no depender del redondeo de punto
// flotante (8000.1 + 0.2 no es 8000.3 en JS).
export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

export interface NormalizedPayment {
  method: PaymentMethod;
  // Importe real aplicado a la venta. Es lo único que cuenta la caja.
  amount: number;
  // Solo efectivo: lo que entregó el cliente y el vuelto devuelto. No son venta.
  receivedAmount: number | null;
  changeAmount: number | null;
}

// Vuelto de una línea en efectivo, en centavos: recibido - importe aplicado.
// Devuelve 0 si no se cargó "recibido" o si todavía no alcanza.
export function changeCents(amountCents: number, receivedCents: number | null): number {
  if (receivedCents === null) return 0;
  return Math.max(0, receivedCents - amountCents);
}

// Valida la estructura de los pagos que manda el navegador (que no es de
// fiar) y los devuelve normalizados. Lanza Error con un mensaje en castellano.
export function normalizePayments(payments: unknown): NormalizedPayment[] {
  if (!Array.isArray(payments) || payments.length === 0) {
    throw new Error("Agregá al menos un medio de pago");
  }

  return payments.map((raw) => {
    const p = (raw ?? {}) as Partial<OrderPayment>;

    if (!p.method || !PAYMENT_METHODS.includes(p.method)) {
      throw new Error("Medio de pago inválido");
    }
    if (!isMoney(p.amount)) {
      throw new Error("El importe de un medio de pago no es válido");
    }
    if (p.amount <= 0) {
      throw new Error("Los importes de pago deben ser mayores a cero");
    }

    let receivedAmount: number | null = null;
    let changeAmount: number | null = null;
    if (p.received !== undefined && p.received !== null) {
      if (p.method !== "efectivo") {
        throw new Error("Solo el efectivo admite monto recibido");
      }
      if (!isMoney(p.received)) {
        throw new Error("El monto recibido no es válido");
      }
      if (toCents(p.received) < toCents(p.amount)) {
        throw new Error("El monto recibido en efectivo no puede ser menor al importe a cobrar");
      }
      receivedAmount = p.received;
      changeAmount = fromCents(changeCents(toCents(p.amount), toCents(p.received)));
    }

    return { method: p.method, amount: p.amount, receivedAmount, changeAmount };
  });
}

// La suma de lo aplicado tiene que coincidir exactamente con el total.
export function assertPaymentsCoverTotal(payments: NormalizedPayment[], total: number) {
  const paid = payments.reduce((sum, p) => sum + toCents(p.amount), 0);
  if (paid !== toCents(total)) {
    throw new Error(
      `Los medios de pago suman ${fromCents(paid).toLocaleString("es-AR")} pero el total es ${total.toLocaleString("es-AR")}`
    );
  }
}
