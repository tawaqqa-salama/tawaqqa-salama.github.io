import type { NextConfig } from "next";

/**
 * GitHub Pages (user site): https://tawaqqa-salama.github.io/
 * Set USER_PAGES=true for static export without basePath.
 * GITHUB_PAGES=true remains for optional project-site builds with basePath.
 */
const isGithubPages = process.env.GITHUB_PAGES === "true";
const isUserPages = process.env.USER_PAGES === "true";
const isStaticExport = isGithubPages || isUserPages;
const isProductionBuild = process.env.NODE_ENV === "production";
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
  // pdfjs-dist is intentionally NOT listed in serverExternalPackages.
  // Externalizing it previously left `legacy/build/pdf.worker.min.mjs` out of
  // Vercel NFT when the worker was loaded via webpackIgnore dynamic import.
  // The Node path now statically imports the worker through
  // `lib/design-intelligence/pdfjs-node-worker.ts` so Next bundles/traces it.
  // Narrow tracing includes as belt-and-suspenders for the reingest function
  // and related server routes that open PDFs — exact worker files only.
  outputFileTracingIncludes: {
    "/api/design/knowledge/reingest": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/package.json",
    ],
    "/api/design/rag": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/package.json",
    ],
  },
  // Production bundles must not include local seed credentials or demo data.
  // Local development keeps the real in-memory implementation for demos/tests.
  turbopack: isProductionBuild
    ? {
        resolveAlias: {
          "@/lib/demo/memory-client": "@/lib/demo/production-disabled",
          "@/lib/tenant/memory": "@/lib/tenant/production-disabled",
        },
      }
    : undefined,
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
