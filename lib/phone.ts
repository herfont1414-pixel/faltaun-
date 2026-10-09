// Número listo para wa.me (solo dígitos, con código de país). La gente carga
// los teléfonos como los escribe a diario: "03755589363", "3755 58-9363",
// "0375515589363" (con el 15), "+54 9 3755 589363"… WhatsApp solo entiende
// "5493755589363". Se usa únicamente para armar links: el teléfono guardado
// no se modifica (las búsquedas por teléfono dependen de cómo se cargó).
export function whatsappDigits(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);

  // Ya trae el código de Argentina. Un móvil lleva el 9 después del 54.
  if (d.startsWith("54")) {
    return d.length === 12 && d[2] !== "9" ? `549${d.slice(2)}` : d;
  }

  if (d.startsWith("0")) d = d.slice(1);
  // Código de área + "15" + número (12 dígitos): el 15 se quita.
  if (d.length === 12) {
    for (const i of [2, 3, 4]) {
      if (d.slice(i, i + 2) === "15") {
        d = d.slice(0, i) + d.slice(i + 2);
        break;
      }
    }
  }
  if (d.length === 10) return `549${d}`;
  if (d.length === 11 && d.startsWith("9")) return `54${d}`;
  // Otro país u otro formato: se deja tal cual.
  return d;
}
