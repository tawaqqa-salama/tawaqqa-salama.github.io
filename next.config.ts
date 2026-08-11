import type { NextConfig } from "next";

/**
 * GitHub Pages (user site): https://tawaqqa-salama.github.io/
 * Set USER_PAGES=true for static export without basePath.
 * GITHUB_PAGES=true remains for optional project-site builds with basePath.
 */
const isGithubPages = process.env.GITHUB_PAGES === "true";
const isUserPages = process.env.USER_PAGES === "true";
const isStaticExport = isGithubPages || isUserPages;
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "tawaqqa-salama";

/**
 * Security headers for Node/Vercel hosts.
 * CSP is intentionally permissive enough for Supabase, PDF (blob/data), OAuth, and Next.
 * Static export ignores headers() — Pages builds are unaffected.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: data:",
      "worker-src 'self' blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://graph.facebook.com https://api.instagram.com https://www.googleapis.com https://oauth2.googleapis.com https://api.linkedin.com https://api.twitter.com https://api.x.com https://open.tiktokapis.com https://gw-fatoora.zatca.gov.sa https://*.zatca.gov.sa",
      "frame-src 'self' blob: data: https://accounts.google.com https://www.facebook.com https://www.linkedin.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  ...(isUserPages
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : isGithubPages
      ? {
          output: "export" as const,
          basePath: `/${repoName}`,
          assetPrefix: `/${repoName}/`,
          trailingSlash: true,
          images: { unoptimized: true },
        }
      : {}),
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.loca.lt",
    "localhost",
    "127.0.0.1",
  ],
  async headers() {
    if (isStaticExport) return [];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
