/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: false, // gli script delle schede vanno eseguiti una sola volta
  webpack: (c) => { c.module.rules.push({ test: /\.html$/, type: "asset/source" }); return c; },
  turbopack: { rules: { "*.html": { loaders: ["raw-loader"], as: "*.js" } } },
};
