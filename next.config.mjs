/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./data/**/*", "./db/**/*"],
    },
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
