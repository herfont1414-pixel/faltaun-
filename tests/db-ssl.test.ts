import { describe, expect, it } from "vitest";
import { sslOptionFor } from "@/lib/admin/db";

describe("conexión a la base: cifrado según dónde esté", () => {
  it("base en la nube: con SSL", () => {
    expect(sslOptionFor("postgres://u:p@pooled.db.prisma.io:5432/postgres", undefined)).toEqual({ rejectUnauthorized: false });
    expect(sslOptionFor("postgres://u:p@ep-x.neon.tech/db?sslmode=require", undefined)).toEqual({ rejectUnauthorized: false });
  });
  it("base en el mismo servidor (Docker 'db', localhost): sin SSL", () => {
    expect(sslOptionFor("postgres://u:p@db:5432/maderosys", undefined)).toBe(false);
    expect(sslOptionFor("postgres://u:p@localhost:5432/x", undefined)).toBe(false);
    expect(sslOptionFor("postgres://u:p@127.0.0.1:5432/x", undefined)).toBe(false);
  });
  it("DATABASE_SSL lo fuerza", () => {
    expect(sslOptionFor("postgres://u:p@192.168.1.20:5432/x", "off")).toBe(false);
    expect(sslOptionFor("postgres://u:p@db:5432/x", "on")).toEqual({ rejectUnauthorized: false });
    expect(sslOptionFor("postgres://u:p@192.168.1.20:5432/x", undefined)).toEqual({ rejectUnauthorized: false });
  });
  it("una dirección rara no rompe", () => {
    expect(sslOptionFor("no es una url", undefined)).toEqual({ rejectUnauthorized: false });
  });
});

import { getDbMode } from "@/lib/admin/db";

describe("qué base usa la PC", () => {
  const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
    const saved = { ...process.env };
    for (const [k, v] of Object.entries(env)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
    try {
      fn();
    } finally {
      process.env = saved;
    }
  };
  it("con una dirección de base en la nube guardada usa esa", () => {
    withEnv({ DATABASE_URL: "postgres://u:p@h/db", MADERO_FORCE_LOCAL: undefined, VERCEL: undefined }, () => expect(getDbMode()).toBe("postgres"));
  });
  it("el acceso SIN INTERNET (MADERO_FORCE_LOCAL=1) usa la base de la PC aunque la dirección esté guardada", () => {
    withEnv({ DATABASE_URL: "postgres://u:p@h/db", MADERO_FORCE_LOCAL: "1", VERCEL: undefined }, () => expect(getDbMode()).toBe("sqlite"));
  });
  it("en Vercel nunca se fuerza la base local", () => {
    withEnv({ DATABASE_URL: "postgres://u:p@h/db", MADERO_FORCE_LOCAL: "1", VERCEL: "1" }, () => expect(getDbMode()).toBe("postgres"));
  });
});
