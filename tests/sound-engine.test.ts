import { describe, expect, it } from "vitest";
import { BAR_SECONDS, BEAT, HOOK_BARS, PROGRESSION, planBar, seededRandom } from "../lib/sound-engine";

describe("música ambiente del menú online", () => {
  it("planea cada compás con guitarra, órgano, bajo y batería, todo dentro del compás", () => {
    for (let bar = 0; bar < PROGRESSION.length * 2; bar++) {
      const events = planBar(bar, seededRandom(bar + 1));
      const kinds = new Set(events.map((e) => e.kind));
      for (const kind of ["skank", "organ", "bass", "hat", "kick", "rim"] as const) {
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

  it("tiene ritmo reggae: guitarra en el 2 y el 4, órgano a contratiempo y one drop en el 3", () => {
    for (let bar = 0; bar < PROGRESSION.length; bar++) {
      const events = planBar(bar, seededRandom(1));
      expect(events.filter((e) => e.kind === "kick").map((e) => e.at)).toEqual([BEAT * 2]);
      expect(events.some((e) => e.kind === "rim" && e.at === BEAT * 2)).toBe(true);
      const skankBeats = new Set(events.filter((e) => e.kind === "skank").map((e) => Math.round(e.at / BEAT)));
      expect([...skankBeats].sort()).toEqual([1, 3]);
      // Órgano solo en los "y" (corcheas impares).
      const organEighths = new Set(events.filter((e) => e.kind === "organ").map((e) => Math.floor((e.at / BEAT) * 2)));
      expect([...organEighths].sort()).toEqual([1, 3, 5, 7]);
    }
  });

  it("el bajo arranca en el 1 con la fundamental del acorde", () => {
    for (let bar = 0; bar < PROGRESSION.length; bar++) {
      const bass = planBar(bar, seededRandom(1)).filter((e) => e.kind === "bass");
      expect(bass[0].at).toBe(0);
      expect(bass[0].midi! % 12).toBe(PROGRESSION[bar].root % 12);
    }
  });

  it("la melodía principal se repite igual en cada vuelta, en los compases del gancho", () => {
    for (const bar of HOOK_BARS) {
      const a = planBar(bar, seededRandom(1)).filter((e) => e.kind === "melody");
      const b = planBar(bar + PROGRESSION.length, seededRandom(99)).filter((e) => e.kind === "melody");
      expect(a.length).toBeGreaterThan(0);
      expect(a).toEqual(b);
    }
    // Los primeros 4 compases de cada vuelta son solo groove, sin melodía.
    for (let bar = 0; bar < 4; bar++) {
      expect(planBar(bar, seededRandom(bar)).some((e) => e.kind === "melody")).toBe(false);
    }
  });

  it("es determinístico con la misma semilla", () => {
    expect(planBar(3, seededRandom(42))).toEqual(planBar(3, seededRandom(42)));
  });
});
