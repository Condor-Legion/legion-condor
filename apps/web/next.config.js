const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emite un bundle autocontenido en .next/standalone con solo las deps que el
  // server usa realmente (sin @next/swc, sin devDependencies).
  output: "standalone",
  // Sin esto Next infiere la raiz de tracing en apps/web y no encuentra las
  // deps, que en pnpm viven en <raiz>/node_modules/.pnpm.
  outputFileTracingRoot: path.join(__dirname, "../../")
};

module.exports = nextConfig;
