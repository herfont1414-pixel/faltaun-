import { describe, expect, it } from "vitest";
import { itemLines, pickHeadline } from "@/lib/share-card";

describe("imagen para compartir el pedido", () => {
  it("lista hasta 5 productos con cantidad y resume el resto", () => {
    expect(itemLines([{ name: "Burger Spider", qty: 1 }, { name: "Papas Cheddar", qty: 2 }])).toEqual(["Burger Spider", "2x Papas Cheddar"]);
    const many = Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, qty: 1 }));
    expect(itemLines(many)).toEqual(["P0", "P1", "P2", "P3", "P4", "y 2 productos más"]);
    expect(itemLines(many.slice(0, 6))).toEqual(["P0", "P1", "P2", "P3", "P4", "y 1 producto más"]);
  });

  it("el mismo pedido siempre lleva el mismo título", () => {
    expect(pickHeadline("pedido-1")).toBe(pickHeadline("pedido-1"));
    const titles = new Set(Array.from({ length: 40 }, (_, i) => pickHeadline(`id-${i}`)));
    expect(titles.size).toBeGreaterThan(1);
  });
});
