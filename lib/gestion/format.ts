export function money(amount: number) {
  return `$${amount.toLocaleString("es-AR")}`;
}
