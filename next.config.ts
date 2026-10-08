import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@dzapio/sdk"],
  images: {
    domains: [
      "udebjfrhnwqoawziuhgu.supabase.co", // Supabase storage domain
      "tower-exchange.vercel.app", // Production domain
      "localhost",
      "127.0.0.1",
    ],
  },
  async headers() {
    return [
      {
        source: "/",
        headers: SECURITY_HEADERS,
      },
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/mcp",
        destination: "https://169-58-244-12.sslip.io/mcp",
      },
      {
        source: "/v1/human-proof/:path*",
        destination: "https://169-58-244-12.sslip.io/v1/human-proof/:path*",
      },
    ];
  },
};

export default nextConfig;
