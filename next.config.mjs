import { existsSync, readFileSync } from "node:fs";

// Versión visible en el panel (abajo del menú lateral): así se ve de un vistazo si la PC
// del local quedó con la misma versión que la página. En Vercel es el commit publicado;
// en la PC, el que bajó el actualizador (.maderosys-version).
function appVersion() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    if (existsSync(".maderosys-version")) return readFileSync(".maderosys-version", "utf8").trim().slice(0, 7) || "local";
  } catch {
    // sin archivo de versión: instalación de desarrollo
  }
  return "local";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./data/**/*", "./db/**/*"],
    },
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  // SQLite solo se usa en la PC del local (modo sin internet). El servidor Docker no lo instala:
  // se deja como módulo externo para que la compilación no lo busque (si no está instalado,
  // solo falla al intentar abrir una base SQLite, que ahí nunca ocurre).
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean);
      config.externals = [...externals, { "better-sqlite3": "commonjs better-sqlite3" }];
    }
    return config;
  },
};

export default nextConfig;
