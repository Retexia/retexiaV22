import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

// Only this site and the admin (page editor preview) may show pages in a frame.
const adminOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_ADMIN_URL ? new URL(process.env.NEXT_PUBLIC_ADMIN_URL).origin : "";
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  // Next.js 16 caching model: "use cache" + cacheTag/cacheLife (see lib/content.ts).
  cacheComponents: true,
  transpilePackages: ["@retexia/ui", "@retexia/supabase", "@retexia/content", "@retexia/forms"],
  poweredByHeader: false,
  // Payment proofs are uploaded through a server action (checked there, max 5 MB).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      ...(supabaseHost
        ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: `frame-ancestors 'self'${adminOrigin ? ` ${adminOrigin}` : ""}` },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
