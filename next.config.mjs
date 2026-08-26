/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./data/**/*", "./db/**/*"],
    },
  },
};

export default nextConfig;
