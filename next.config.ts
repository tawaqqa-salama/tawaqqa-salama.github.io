import type { NextConfig } from "next";

/**
 * GitHub Pages (user site): https://tawaqqa-salama.github.io/
 * Set USER_PAGES=true for static export without basePath.
 * GITHUB_PAGES=true remains for optional project-site builds with basePath.
 */
const isGithubPages = process.env.GITHUB_PAGES === "true";
const isUserPages = process.env.USER_PAGES === "true";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "tawaqqa-salama";

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
};

export default nextConfig;
