import { describe, expect, it } from "vitest";
import { BAR_SECONDS, BASS_BEATS, BEAT, GUITAR_EIGHTHS, PROGRESSION, planBar, seededRandom } from "../lib/sound-engine";

describe("música ambiente del menú online", () => {
  it("planea cada compás con guitarra, bajo y percusión, todo dentro del compás", () => {
    for (let bar = 0; bar < PROGRESSION.length * 2; bar++) {
      const events = planBar(bar, seededRandom(bar + 1));
      const kinds = new Set(events.map((e) => e.kind));
      for (const kind of ["guitar", "bass", "shaker", "rim", "kick"] as const) {
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

  it("la guitarra sigue la clave de la bossa (3+3+4+3+3 en dos compases)", () => {
    const eighth = BEAT / 2;
    for (let bar = 0; bar < PROGRESSION.length; bar++) {
      const hits = new Set(
        planBar(bar, seededRandom(1))
          .filter((e) => e.kind === "guitar")
          .map((e) => Math.floor(e.at / eighth + 1e-6))
      );
      expect([...hits].sort((x, y) => x - y)).toEqual(GUITAR_EIGHTHS[bar % 2]);
    }
    // Sobre los dos compases: corcheas 0, 3, 6, 10 y 13.
    expect([...GUITAR_EIGHTHS[0], ...GUITAR_EIGHTHS[1].map((n) => n + 8)]).toEqual([0, 3, 6, 10, 13]);
  });

  it("el bajo toca fundamental en el 1 y sigue el ritmo de la bossa", () => {
    for (let bar = 0; bar < PROGRESSION.length; bar++) {
      const bass = planBar(bar, seededRandom(1)).filter((e) => e.kind === "bass");
      expect(bass.map((e) => e.at)).toEqual(BASS_BEATS.map((b) => b * BEAT));
      expect(bass[0].midi! % 12).toBe(PROGRESSION[bar].root % 12);
    }
  });

  it("es determinístico con la misma semilla y repite la progresión", () => {
    expect(planBar(3, seededRandom(42))).toEqual(planBar(3, seededRandom(42)));
    const a = planBar(2, seededRandom(5)).filter((e) => e.kind === "guitar");
    const b = planBar(2 + PROGRESSION.length, seededRandom(5)).filter((e) => e.kind === "guitar");
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
