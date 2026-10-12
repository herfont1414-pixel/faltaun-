import { describe, expect, it } from "vitest";
import { BAR_SECONDS, BEAT, PROGRESSION, planBar, seededRandom } from "../lib/sound-engine";

describe("música ambiente del menú online", () => {
  it("planea cada compás con piano, skank, bajo y batería, todo dentro del compás", () => {
    for (let bar = 0; bar < PROGRESSION.length * 2; bar++) {
      const events = planBar(bar, seededRandom(bar + 1));
      const kinds = new Set(events.map((e) => e.kind));
      for (const kind of ["keys", "skank", "bass", "hat", "kick", "rim"] as const) {
        expect(kinds.has(kind)).toBe(true);
      }
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

  it("tiene ritmo reggae: skank a contratiempo y bombo/aro \"one drop\" en el 3", () => {
    for (let bar = 0; bar < PROGRESSION.length; bar++) {
      const events = planBar(bar, seededRandom(1));
      const kicks = events.filter((e) => e.kind === "kick");
      expect(kicks.map((e) => e.at)).toEqual([BEAT * 2]);
      expect(events.some((e) => e.kind === "rim" && e.at === BEAT * 2)).toBe(true);
      const skankBeats = new Set(events.filter((e) => e.kind === "skank").map((e) => Math.floor((e.at / BEAT) * 2)));
      // Solo en los "y" (corcheas impares): 1, 3, 5, 7.
      expect([...skankBeats].sort()).toEqual([1, 3, 5, 7]);
    }
  });

  it("el bajo arranca en el 1 y cierra con una nota cromática hacia el próximo acorde", () => {
    for (let bar = 0; bar < PROGRESSION.length; bar++) {
      const bass = planBar(bar, seededRandom(1)).filter((e) => e.kind === "bass");
      expect(bass[0].at).toBe(0);
      const nextBass = planBar(bar + 1, seededRandom(1)).filter((e) => e.kind === "bass")[0].midi!;
      const approach = bass[bass.length - 1].midi!;
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
