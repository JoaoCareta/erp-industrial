import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { addCatalogItem, countingUnit } from "./catalog";

test("inventário inicial preserva 100 placas após perder a resposta e reenviar", async ({ page }, testInfo) => {
  const login = page.waitForRequest(request => request.url().endsWith("/api/me/context"));
  await page.goto("/");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("demo-industrial");
  await page.locator("#kc-login").click();
  const authorization = (await (await login).allHeaders()).authorization;
  const suffix = randomUUID().slice(0, 8);
  const unitCode = "PL";
  const categoryId = await addCatalogItem(page.request, authorization, "category", {
    code: "MAD-" + suffix, name: "Madeira",
  });
  const unitId = await countingUnit(page.request, authorization, unitCode, "Placa");
  const materialId = await addCatalogItem(page.request, authorization, "material", {
    code: "MDF-" + suffix, name: "Placa de MDF", categoryId, unitId,
  });

  const stock = page.getByRole("button", { name: "Estoque", exact: true });
  const material = page.getByRole("combobox", { name: "Material", exact: true });
  const amount = page.getByLabel("Quantidade inicial", { exact: true });
  const history = page.getByRole("table", { name: "Extrato de movimentos" });
  async function expectBalances(physical: number) {
    for (const [label, expected] of [
      ["Físico", physical], ["Reservado", 0], ["Disponível", physical],
    ] as const) {
      await expect(page.locator("dl > div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("dd")).toHaveText(expected + " " + unitCode);
    }
  }
  const materialPath = "/api/units/eduk/stock/materials/" + materialId;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stock.click();
  await expect(page.getByRole("main")).toHaveCSS("animation-name", "none");
  await material.selectOption(materialId);
  await amount.fill("100");

  // Commit the first PUT to the real database, then drop its response before it reaches the app.
  const putPaths: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "PUT" && path.startsWith(materialPath + "/opening/")) putPaths.push(path);
  });
  await page.route("**" + materialPath + "/opening/*", async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  }, { times: 1 });
  await page.getByRole("button", { name: "Registrar inventário" }).click();
  await page.getByRole("button", { name: "Reenviar lançamento" }).click();
  await expect(history.getByRole("cell", { name: "100 " + unitCode, exact: true })).toHaveCount(1);
  await expect(page.locator(".stock-detail")).toHaveCSS("animation-name", "none");
  expect(putPaths).toHaveLength(2);
  expect(putPaths[1]).toBe(putPaths[0]);

  await page.reload();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await stock.click();
  await expect(page.getByRole("main")).not.toHaveCSS("animation-name", "none");
  await material.selectOption(materialId);
  await expect(history.getByRole("row")).toHaveCount(2);
  await expect(history.getByRole("cell", { name: "100 " + unitCode, exact: true })).toBeVisible();
  await expectBalances(100);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".stock-detail")).not.toHaveCSS("animation-name", "none");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: resolve("../reports/estoque-inventario-mobile.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1280, height: 800 });
  const screenshot = resolve("../reports/estoque-inventario-100.png");
  await page.screenshot({ fullPage: true, path: screenshot, animations: "disabled" });
  await testInfo.attach("Inventário após reabrir o estoque", {
    path: screenshot, contentType: "image/png",
  });

  await page.getByLabel("Quantidade de entrada", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expectBalances(112);
  const receiptRow = history.getByRole("row").filter({ has: page.getByRole("cell", { name: "Entrada", exact: true }) });
  await receiptRow.getByRole("button", { name: "Estornar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar estorno" }).click();
  await expect(history.getByRole("row")).toHaveCount(4);
  await expectBalances(100);

  const balance = await page.request.get(materialPath, { headers: { authorization } });
  expect(balance.ok()).toBe(true);
  const result = await balance.json();
  expect(result).toMatchObject({ physical: "100", reserved: "0", available: "100" });
  type Movement = { requestId: string; kind: string; quantity: string; sourceId: string | null };
  const movements: Movement[] = result.movements;
  expect(movements).toHaveLength(3);
  const opening = movements.find(movement => movement.kind === "opening");
  const receipt = movements.find(movement => movement.kind === "receipt");
  const reversal = movements.find(movement => movement.kind === "reversal");
  expect(putPaths[0]).toBe(materialPath + "/opening/" + opening?.requestId);
  expect(receipt?.quantity).toBe("12");
  expect(reversal).toMatchObject({ quantity: "-12", sourceId: receipt?.requestId });
});
