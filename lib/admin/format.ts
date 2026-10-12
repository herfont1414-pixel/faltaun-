export function money(amount: number) {
  return `$${amount.toLocaleString("es-AR")}`;
}

// Hora de apertura y tiempo transcurrido de una mesa: "20:15 (35 min)" o "18:40 (1 h 20 min)".
export function openedSince(iso: string, now: number = Date.now()) {
  const opened = new Date(iso);
  if (Number.isNaN(opened.getTime())) return "";
  const hour = opened.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const mins = Math.max(0, Math.floor((now - opened.getTime()) / 60000));
  const elapsed = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}`;
  return `${hour} (${elapsed})`;
}
