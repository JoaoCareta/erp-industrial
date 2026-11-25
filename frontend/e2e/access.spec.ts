import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, user: string) {
  await page.goto("/");
  await page.locator("#username").fill(user);
  await page.locator("#password").fill("demo-industrial");
  await page.locator("#kc-login").click();
  await expect(page.getByRole("heading", { name: "Equipe" })).toBeVisible();
}
test("setor e suspensão com o mesmo token", async ({ page, browser }) => {
  await login(page, "lider");
  const team = page.getByRole("button", { name: "Consultar equipe" });
  const req = page.waitForRequest((r) =>
    r.url().endsWith("/api/sectors/corte/team"),
  );
  await team.click();
  const headers = await (await req).allHeaders();
  await expect(page.getByText("Ana", { exact: true })).toBeVisible();
  const foreign = await page.request.get("/api/sectors/pintura/team", {
    headers: { authorization: headers.authorization },
  });
  expect(foreign.status()).toBe(403);
  const admin = await browser.newPage({
    baseURL: process.env.WEB_ORIGIN || "http://localhost:18081",
  });
  await login(admin, "admin");
  await admin.getByRole("button", { name: "Acessos" }).click();
  await admin
    .getByLabel("Identificador da conta")
    .fill("00000000-0000-4000-8000-000000000001");
  await admin.getByLabel("Motivo").fill("Teste do acesso por setor");
  await admin.getByRole("button", { name: "Suspender conta" }).click();
  await expect(admin.getByText("Conta suspensa")).toBeVisible();
  expect(
    (
      await page.request.get("/api/sectors/corte/team", {
        headers: { authorization: headers.authorization },
      })
    ).status(),
  ).toBe(403);
  await team.click();
  await expect(page.getByText("Acesso negado")).toBeVisible();
  await expect(page.getByText("Ana", { exact: true })).toHaveCount(0);
  await admin.close();
});
test("funcionário sem concessão", async ({ page }) => {
  await login(page, "operador");
  await page.getByText("Consultar equipe").click();
  await expect(page.getByText("Acesso negado")).toBeVisible();
});
