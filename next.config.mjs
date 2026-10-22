/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
    outputFileTracingIncludes: {
      "/api/invoices/*/pdf": ["./public/is-painting-logo2.png"],
    },
  },
};

export default nextConfig;
