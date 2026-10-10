// Reglas puras de premios por hito (sin base de datos).
// Cada premio tiene un primer hito y se repite cada "step" sellos:
// papas 5, 20, 35, 50… / hamburguesa 15, 30, 45, 60…

export interface RewardRule {
  firstMilestone: number;
  step: number;
}

// ¿Llegar a exactamente "stamps" sellos genera este premio?
// Se evalúa con el sello que se acaba de sumar, así nunca se generan premios
// retroactivos: solo se premia el hito que se cruza en ese momento.
export function hitsAt(rule: RewardRule, stamps: number): boolean {
  return stamps >= rule.firstMilestone && (stamps - rule.firstMilestone) % rule.step === 0;
}

// Todos los hitos de la regla hasta "stamps" sellos (para vistas previas; no crea nada).
export function milestonesUpTo(rule: RewardRule, stamps: number): number[] {
  const out: number[] = [];
  for (let m = rule.firstMilestone; m <= stamps; m += rule.step) out.push(m);
  return out;
}

// Próximo hito de la regla, estrictamente mayor a los sellos actuales.
export function nextMilestone(rule: RewardRule, stamps: number): number {
  if (stamps < rule.firstMilestone) return rule.firstMilestone;
  return rule.firstMilestone + (Math.floor((stamps - rule.firstMilestone) / rule.step) + 1) * rule.step;
}

// Cuántos sellos faltan para el próximo premio de cualquiera de las reglas.
export function stampsToNext<T extends RewardRule>(rules: T[], stamps: number): { rule: T; milestone: number; remaining: number } | null {
  let best: { rule: T; milestone: number; remaining: number } | null = null;
  for (const rule of rules) {
    const milestone = nextMilestone(rule, stamps);
    if (!best || milestone < best.milestone) best = { rule, milestone, remaining: milestone - stamps };
  }
  return best;
}

// Casilleros de la tarjeta: el ciclo se repite cada "cycle" sellos. Con 15 sellos
// la tarjeta está completa; con 16 vuelve a empezar con 1 casillero lleno.
export function cycleFilled(stamps: number, cycle: number): number {
  if (stamps <= 0 || cycle <= 0) return 0;
  const r = stamps % cycle;
  return r === 0 ? cycle : r;
}

// Posición (1..cycle) en la que cae un hito dentro del ciclo de la tarjeta.
export function cyclePosition(milestone: number, cycle: number): number {
  const r = milestone % cycle;
  return r === 0 ? cycle : r;
}
