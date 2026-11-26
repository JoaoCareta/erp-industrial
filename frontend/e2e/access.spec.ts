import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, user: string) {
  await page.goto("/");
  await page.locator("#username").fill(user);
  await page.locator("#password").fill("demo-industrial");
  await page.locator("#kc-login").click();
}
test("setor e suspensão com o mesmo token", async ({ page, browser }) => {
  const req = page.waitForRequest((r) =>
    r.url().endsWith("/api/units/eduk/sectors/corte/team"),
  );
  await login(page, "lider");

  const headers = await (await req).allHeaders();
  await expect(page.getByText("Ana", { exact: true })).toBeVisible();
  await expect(page.getByText("Unidade: Mundo Eduk", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Equipe", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Atualizar equipe" })).toHaveCount(0);
  const member = page.getByRole("listitem").filter({ hasText: "Ana" });
  await expect(member.getByText("A", { exact: true })).toBeVisible();
  await expect(member.getByText("Líder", { exact: true })).toBeVisible();
  const foreign = await page.request.get(
    "/api/units/eduk/sectors/pintura/team",
    {
      headers: { authorization: headers.authorization },
    },
  );
  expect(foreign.status()).toBe(403);
  const admin = await browser.newPage({
    baseURL: process.env.WEB_ORIGIN || "http://localhost:18081",
  });
  await login(admin, "admin");
  const sector = admin.getByRole("combobox", { name: "Setor", exact: true });
  await expect(sector).toHaveCSS("width", "210px");
  await expect(sector).toHaveCSS("height", "42px");
  await sector.selectOption("corte");
  await expect(admin.getByText("Ana", { exact: true })).toBeVisible();
  await expect(admin.getByRole("navigation", {name:"Menu principal"})).toBeVisible();
  await expect(admin.getByRole("button", {name:"Acessos"})).toHaveCount(0);
  const sidebar = await admin.getByRole("navigation").boundingBox();
  const content = await admin.getByRole("main").boundingBox();
  expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(content!.x);
  // Simulate an external account suspension in the disposable verification database.
  const project = process.env.ERP_VERIFY_PROJECT;
  if (!project || !/^erp-check-[a-f0-9]{32}$/.test(project)) throw Error("Use scripts/verify.ps1");
  execFileSync("docker", ["compose","-p",project,"exec","-T","db","psql","-U","erp","-d","erp","-v","ON_ERROR_STOP=1","-c",
    "update account set active=false where subject='00000000-0000-4000-8000-000000000001'"], {cwd:resolve("..")});
  expect(
    (
      await page.request.get("/api/units/eduk/sectors/corte/team", {
        headers: { authorization: headers.authorization },
      })
    ).status(),
  ).toBe(403);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Acesso negado")).toBeVisible();
  await expect(page.getByText("Ana", { exact: true })).toHaveCount(0);
  await admin.close();
});
test("funcionário sem concessão", async ({ page }) => {
  await login(page, "operador");
  await expect(
    page.getByRole("heading", { name: "Nenhuma unidade liberada" }),
  ).toBeVisible();
});

test("regional escolhe e retoma a unidade", async ({ page }) => {
  await login(page, "regional");
  const select = page.getByLabel("Trocar unidade");
  await select.selectOption("birigui");
  await expect(page.getByText("Líder Birigui", { exact: true })).toBeVisible();
  await select.selectOption("aracatuba");
  await expect(
    page.getByText("Líder Araçatuba", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Líder Birigui", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(select).toHaveValue("aracatuba");
  await expect(
    page.getByText("Líder Araçatuba", { exact: true }),
  ).toBeVisible();
});

test("troca de operador no mesmo posto", async ({ page }) => {
  await login(page, "regional");
  await page.getByLabel("Trocar unidade").selectOption("aracatuba");
  const previousMember = page.getByText("Líder Araçatuba", { exact: true });
  await expect(previousMember).toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.locator("#username")).toBeVisible();
  const contextRequest = page.waitForRequest(r => r.url().endsWith("/api/me/context"));
  await page.locator("#username").fill("operador");
  await page.locator("#password").fill("demo-industrial");
  await page.locator("#kc-login").click();
  const operator = await (await contextRequest).allHeaders();
  const blocked = page.getByRole("heading", { name: "Nenhuma unidade liberada" });
  await expect(blocked).toBeVisible();
  await page.goBack();
  await expect(previousMember).toHaveCount(0);
  await page.goto("/");
  await page.reload();
  await expect(blocked).toBeVisible();
  await expect(previousMember).toHaveCount(0);
  const response = await page.request.get("/api/units/aracatuba/sectors/corte/team", {
    headers: { authorization: operator.authorization },
  });
  expect(response.status()).toBe(403);
  expect(await response.text()).not.toContain("Líder Araçatuba");
});
