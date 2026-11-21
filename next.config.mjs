// Header di sicurezza per tutte le risposte. La CSP blocca l'inclusione in frame e gli oggetti incorporati;
// non restringe ancora script e stili, perché Next.js e le schede usano codice inline (servirebbero i nonce).
const sicurezza = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: false, // gli script delle schede vanno eseguiti una sola volta
  poweredByHeader: false,
  headers: async () => [{ source: "/:path*", headers: sicurezza }],
  webpack: (c) => { c.module.rules.push({ test: /\.html$/, type: "asset/source" }); return c; },
  turbopack: { rules: { "*.html": { loaders: ["raw-loader"], as: "*.js" } } },
};
