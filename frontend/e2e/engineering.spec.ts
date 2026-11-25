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
      "Peça do kit",
      "Matéria-prima do produto",
      "Categoria de referência",
      "Unidade de referência",
    ].includes(label)
      ? page.getByRole("combobox", { name: label, exact: true })
      : page.getByLabel(label, { exact: true });
  await click("Engenharia");
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
    await expect(
      page.getByRole("button", { name: code + " · " + name }),
    ).toBeVisible();
  }
  await field("Produto pai").selectOption({ label: "Kit" });
  for (const [name, qty, steps] of [
    ["Roda", "2", "corte,pintura"],
    ["Base", "1", "montagem"],
  ]) {
    await click("Adicionar peça");
    await field("Peça do kit").last().selectOption({ label: name });
    await field("Quantidade por kit").last().fill(qty);
    await field("Etapas em ordem (separadas por vírgula)").last().fill(steps);
  }
  await click("Adicionar material");
  await field("Matéria-prima do produto").selectOption({ label: "Painel" });
  await field("Quantidade por produto").fill("0.5");
  await click("Publicar ficha");
  await click("Consultar V1");
  await expect(
    page.getByText("Roda · 2 por kit · corte → pintura"),
  ).toBeVisible();
  await click("Copiar para rascunho");
  await field("Quantidade por kit").first().fill("4");
  await field("Etapas em ordem (separadas por vírgula)")
    .first()
    .fill("corte,lixamento,pintura");
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
});
