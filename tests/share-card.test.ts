import { describe, expect, it } from "vitest";
import { itemLines } from "@/lib/share-card";

describe("imagen para compartir el pedido", () => {
  it("lista hasta N productos con cantidad y resume el resto", () => {
    expect(itemLines([{ name: "Burger Spider", qty: 1 }, { name: "Papas Cheddar", qty: 2 }])).toEqual(["1x Burger Spider", "2x Papas Cheddar"]);
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, qty: 1 }));
    expect(itemLines(many, 6)).toEqual(["1x P0", "1x P1", "1x P2", "1x P3", "1x P4", "1x P5", "y 2 productos más"]);
    expect(itemLines(many.slice(0, 7), 6).at(-1)).toBe("y 1 producto más");
  });
});
