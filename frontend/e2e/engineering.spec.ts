import { test, expect } from "@playwright/test";
test("publica V1 e V2 e preserva a composição e o roteiro", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("demo-industrial");
  await page.locator("#kc-login").click();
  const click = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  const field = (label: string) =>
    [
      "Tipo",
      "Produto pai",
      "Categoria de referência",
      "Unidade de referência",
    ].includes(label)
      ? page.getByRole("combobox", { name: label, exact: true })
      : page.getByLabel(label, { exact: true });
  for (const reducedMotion of ["reduce", "no-preference"] as const) {
    await page.emulateMedia({ reducedMotion });
    await click("Engenharia");
    const module = page.getByRole("main");
    await expect(module.getByRole("heading", { name: "Engenharia", level: 1 })).toBeVisible();
    await click("Novo");
    const catalog = page.locator(".catalog-panel");
    await expect(catalog.getByLabel("Código", { exact: true })).toBeVisible();
    for (const surface of [module, catalog]) {
      if (reducedMotion === "reduce") {
        await expect(surface).toHaveCSS("animation-name", "none");
      } else {
        await expect(surface).not.toHaveCSS("animation-name", "none");
      }
    }
    if (reducedMotion === "reduce") {
      await click("Fechar cadastros");
      await click("Equipe");
    }
  }
  for (const [kind, code, name] of [
    ["category", "MAD", "Madeira"],
    ["unit", "PL", "Placa"],
    ["material", "MDF", "Painel"],
    ["part", "RO", "Roda"],
    ["part", "BA", "Base"],
    ["product", "K1", "Kit"],
  ]) {
    await field("Tipo").selectOption(kind);
    await field("Código").fill(code);
    await field("Descrição").fill(name);
    if (kind === "unit") await field("Dimensão").fill("contagem");
    if (kind === "material") {
      await field("Categoria de referência").selectOption({ label: "Madeira" });
      await field("Unidade de referência").selectOption({ label: "Placa" });
    }
    await click("Salvar cadastro");
    if(kind !== "product") await expect(
      page.getByRole("button", { name: code + " · " + name }),
    ).toBeVisible();
  }
  await field("Produto pai").selectOption({ label: "Kit" });
  for (const [name, qty, steps] of [
    ["Roda", "2", "corte,pintura"],
    ["Base", "1", "montagem"],
  ]) {
    if (name !== "Roda") await click("Adicionar item");
    await field("Peça do kit").last().fill(name);
    await click(name === "Roda" ? "RO · Roda" : "BA · Base");
    await field("Quantidade por kit").last().fill(qty);
    for (const step of steps.split(",")) await page.getByRole("checkbox", {name: new RegExp("^"+step+"$","i")}).last().check();
  }
  await click("Adicionar item");
  await page.getByLabel("Tipo de item").last().selectOption("material");
  await field("Matéria-prima do produto").fill("MDF");
  await click("MDF · Painel");
  await field("Quantidade por produto").fill("0.5");
  await click("Publicar ficha");
  await click("Consultar V1");
  await expect(
    page.getByText("Roda · 2 por kit · corte → pintura"),
  ).toBeVisible();
  await click("Editar composição");
  await field("Quantidade por kit").first().fill("4");
  await page.getByRole("checkbox", {name:/^lixamento$/i}).first().check();
  const route = page.getByRole("list",{name:"Prévia do roteiro"}).first();
  const chip = (name:string) => route.getByRole("button",{name,exact:true});
  await chip("pintura").dragTo(chip("lixamento"));
  await expect(route.getByRole("button")).toHaveText(["corte","pintura","lixamento"]);
  await chip("lixamento").dragTo(chip("pintura"));
  await expect(route.getByRole("button")).toHaveText(["corte","lixamento","pintura"]);
  await field("Quantidade por produto").fill("0.75");
  await click("Publicar ficha");
  await click("Consultar V2");
  await expect(
    page.getByText("Roda · 4 por kit · corte → lixamento → pintura"),
  ).toBeVisible();
  await expect(page.getByText("Painel · 0.75 PL")).toBeVisible();
  await click("Consultar V1");
  await expect(page.getByText("Painel · 0.5 PL")).toBeVisible();
  await expect(page.getByText("Base · 1 por kit · montagem")).toBeVisible();
  await page.getByText("Prévia de materiais", { exact: true }).click();
  const csv = { name: "materiais.csv", mimeType: "text/csv",
    buffer: Buffer.from("código,descrição,unidade\nMDF,Painel,PL\nNOVA,Nova,PL") };
  const writes: string[] = [];
  page.on("request", req => {
    if (req.url().includes("/api/") && req.method() !== "GET") writes.push(req.method());
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const reads = page.waitForResponse(res => res.url().endsWith("/catalog/material") && res.ok());
    await page.getByLabel(/Arquivo CSV/).setInputFiles(csv);
    await reads;
    await expect(page.getByRole("row", { name: "2 MDF Painel PL Confere" })).toBeVisible();
    await expect(page.getByRole("row", { name: "3 NOVA Nova PL Material novo" })).toBeVisible();
  }
  expect(writes).toEqual([]);
});
