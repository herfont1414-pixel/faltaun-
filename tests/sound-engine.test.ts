import { describe, expect, it } from "vitest";
import { BAR_SECONDS, BEAT, PROGRESSION, planBar, seededRandom } from "../lib/sound-engine";

describe("música ambiente del menú online", () => {
  it("planea cada compás con teclas, bajo y escobillas, todo dentro del compás", () => {
    for (let bar = 0; bar < PROGRESSION.length * 2; bar++) {
      const events = planBar(bar, seededRandom(bar + 1));
      const kinds = new Set(events.map((e) => e.kind));
      expect(kinds.has("keys")).toBe(true);
      expect(kinds.has("bass")).toBe(true);
      expect(kinds.has("brush")).toBe(true);
      for (const e of events) {
        expect(e.at).toBeGreaterThanOrEqual(0);
        expect(e.at).toBeLessThan(BAR_SECONDS);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        if (e.midi !== undefined) {
          expect(e.midi).toBeGreaterThanOrEqual(36);
          expect(e.midi).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  it("el bajo camina cuatro tiempos y cierra con una nota cromática hacia el próximo acorde", () => {
    for (let bar = 0; bar < PROGRESSION.length; bar++) {
      const bass = planBar(bar, seededRandom(1)).filter((e) => e.kind === "bass");
      expect(bass).toHaveLength(4);
      expect(bass.map((e) => e.at)).toEqual([0, BEAT, BEAT * 2, BEAT * 3]);
      const nextBass = planBar(bar + 1, seededRandom(1)).filter((e) => e.kind === "bass")[0].midi!;
      const approach = bass[3].midi!;
      expect(Math.abs(approach - nextBass) % 12).toBe(1);
    }
  });

  it("es determinístico con la misma semilla y repite la progresión", () => {
    expect(planBar(3, seededRandom(42))).toEqual(planBar(3, seededRandom(42)));
    const a = planBar(2, seededRandom(5)).filter((e) => e.kind === "keys");
    const b = planBar(2 + PROGRESSION.length, seededRandom(5)).filter((e) => e.kind === "keys");
    expect(a).toEqual(b);
  });

  it("la melodía es esporádica: algunos compases la llevan y otros no", () => {
    const withMelody = Array.from({ length: 40 }, (_, i) =>
      planBar(i, seededRandom(i * 7 + 3)).some((e) => e.kind === "melody")
    );
    expect(withMelody.some(Boolean)).toBe(true);
    expect(withMelody.some((v) => !v)).toBe(true);
  });
});
