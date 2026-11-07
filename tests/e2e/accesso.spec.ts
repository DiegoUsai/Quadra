import { test, expect } from "@playwright/test";

test("senza login le schede rimandano alla pagina di accesso", async ({ page }) => {
  await page.goto("/schede");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: /Accedi con Google/ })).toBeVisible();
});

test("senza login i dati non sono leggibili", async ({ request }) => {
  const r = await request.get("/api/dati/sintesi", { maxRedirects: 0 });
  expect(r.status()).toBe(401);
  expect(await r.text()).not.toContain("consuntivo");
});
