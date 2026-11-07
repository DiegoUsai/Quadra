import { defineConfig } from "@playwright/test";
// Il server parte senza DEV_SKIP_AUTH: si prova il vero blocco d'accesso.
export default defineConfig({
  testDir: "tests/e2e",
  webServer: { command: "npx next dev -p 3000", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: "http://localhost:3000" },
});
