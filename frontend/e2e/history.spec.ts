import { test, expect } from "@playwright/test";
test("histórico após reiniciar a API", async ({ page }) => {
  await page.goto("/");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("demo-industrial");
  await page.locator("#kc-login").click();
  await page.getByRole("button", { name: "Engenharia" }).click();
  await page
    .getByRole("combobox", { name: "Produto pai" })
    .selectOption({ label: "Kit" });
  for (const [version, line] of [
    [1, "Roda · 2 por kit · corte → pintura"],
    [2, "Roda · 4 por kit · corte → lixamento → pintura"],
  ] as const) {
    await page.getByRole("button", { name: "Consultar V" + version }).click();
    await expect(page.getByText(line, { exact: true })).toBeVisible();
    await expect(
      page.getByText("Base · 1 por kit · montagem", { exact: true }),
    ).toBeVisible();
  }
});
