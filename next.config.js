/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The /api/chat route reads these prompt files at runtime via fs. Next.js
  // does not trace fs.readFileSync paths automatically, so without this they
  // are NOT bundled into the serverless function on Vercel and the route
  // silently falls back to a 1-line default prompt. Force them to ship.
  experimental: {
    outputFileTracingIncludes: {
      "/api/chat": ["./system-prompt.md", "./ask-now-prompt.md", "./rag/embeddings.json", "./rag/knowledge.json"],
      "/api/rag-test": ["./rag/embeddings.json", "./rag/knowledge.json"],
    },
  },
  async headers() {
    return [
      {
        // The app-shell HTML must never be served stale. dotit runs inside an
        // Android WebView (Capacitor) that loads the live URL; its HTTP cache —
        // and the CDN edge — could otherwise keep serving an OLD document that
        // references an OLD chunk graph after a deploy, so the user sees a
        // previous version of the home (e.g. the old constellation Surprise Me
        // dot instead of the founder artwork). `no-store` forces a fresh shell
        // on every load. The content-hashed `/_next/static/*` chunks and the
        // `/figures/*` art are immutable and stay fully cached (excluded here),
        // so this costs only the tiny HTML document, not the assets.
        source: "/((?!_next/static|_next/image|figures|icons|api|favicon.ico|manifest.webmanifest|sw.js).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        // Hashed build assets are safe to cache forever.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

module.exports = nextConfig;
