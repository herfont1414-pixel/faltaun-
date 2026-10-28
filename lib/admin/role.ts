// Dos formas de correr el mismo sistema:
//  - "local" (por defecto): el sistema completo. Es la PC del local, donde se trabaja todo el
//    día (mesas, caja, pedidos, impresión…) con su propia base.
//  - "nube" (MADERO_ROL=nube): solo la parte pública (menú online, reservas, pedidos web y
//    tarjeta de fidelidad). No tiene panel: recibe de la PC una copia del menú y le deja los
//    pedidos y reservas que entran (ver lib/admin/sync.ts).
export function isCloudRole() {
  return (process.env.MADERO_ROL ?? "").trim().toLowerCase() === "nube";
}

// La nube da por "local abierto" a la PC mientras haya hablado con ella hace menos que esto.
export const PC_ONLINE_WINDOW_MS = 120_000;
