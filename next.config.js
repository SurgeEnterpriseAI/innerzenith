/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The /api/chat route reads these prompt files at runtime via fs. Next.js
  // does not trace fs.readFileSync paths automatically, so without this they
  // are NOT bundled into the serverless function on Vercel and the route
  // silently falls back to a 1-line default prompt. Force them to ship.
  experimental: {
    outputFileTracingIncludes: {
      "/api/chat": ["./system-prompt.md", "./ask-now-prompt.md", "./rag/embeddings.json"],
      "/api/rag-test": ["./rag/embeddings.json"],
    },
  },
};

module.exports = nextConfig;
