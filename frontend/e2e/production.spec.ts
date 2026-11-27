import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { addCatalogItem, countingUnit } from "./catalog";

const productName = "Vila Natalina 1 -Vermelha (Montagem Interna)";
const plant = "/api/units/eduk";

/** Workbook fixture: Estrutura Roteiros rows 7–18, Ficha Tecnica (BOM) row 5, Planejamento Laser PCP C3:C4. */
async function prepareVillage(request: APIRequestContext, authorization: string) {
  const prefix = "VILA-" + randomUUID().slice(0, 8);
  const headers = { authorization };
  const item = (kind: string, code: string, name: string, links: Record<string, string> = {}) =>
    addCatalogItem(request, authorization, kind, { code: prefix + "-" + code, name, ...links });
  const productId = await item("product", "VM", productName);
  const plates = await countingUnit(request, authorization, "PL", "Placa");
  const boxes = await countingUnit(request, authorization, "CX", "Caixa");
  const wood = await item("category", "MDF", "MDF");
  const packaging = await item("category", "EMB", "Embalagem");
  const materials = [];
  const stock = [];
  for (const [code, name, perKit, unitId, categoryId, opening, reserved] of [
    ["BR", "Placa MDF 2,5mm UF Branca", "0.2", plates, wood, "100", "30"],
    ["VM", "Placa MDF 2,5mm UF Vermelha", "0.13333", plates, wood, "100", "19.9995"],
    ["VD", "Placa MDF 2,5mm UF Verde", "0.0164", plates, wood, "100", "2.46"],
    ["CX", "Caixa 29x18x11", "1", boxes, packaging, "150", "150"],
  ] as const) {
    const materialId = await item("material", code, name, { categoryId, unitId });
    const path = plant + "/stock/materials/" + materialId;
    const response = await request.put(path + "/opening/" + randomUUID(), {
      headers, data: { unitId, quantity: opening },
    });
    expect(response.ok()).toBe(true);
    materials.push({ materialId, unitId, quantity: perKit });
    stock.push({ materialId, path, opening, reserved });
  }
  const pieces = [];
  const cutting = ["Corte Laser", "Limpeza", "Emb. Parcial"];
  for (const [name, quantity, piecesPerPlate, minutesPerCut] of [
    ["Casinha Branca", 2, 49, 57], ["Casinha Vermelha", 2, 68, 57],
    ["Moinho Branco", 1, 16, 93], ["Moinho Vermelho", 1, 30, 95],
    ["Igreja Branca", 1, 15, 57], ["Igreja Vermelha", 1, 56, 94],
    ["Chalé A Branca", 1, 33, 60], ["Chalé A Vermelha", 1, 49, 93],
    ["Chalé B Branca", 1, 52, 104], ["Chalé B Vermelha", 1, 70, 80],
    ["Arvore Verde", 2, 61, 54],
  ] as const) {
    const partId = await item("part", String(pieces.length + 1), name);
    pieces.push({ partId, quantity, steps: cutting, thicknessMm: 2.5, piecesPerPlate, piecesPerCut: piecesPerPlate * 2, minutesPerCut });
  }
  const finalAssembly = await item("part", "FINAL", "[MONTAGEM FINAL]");
  pieces.push({ partId: finalAssembly, quantity: 1, steps: ["Checklist", "Embalagem Final", "Etiquetagem"] });
  const drafts = plant + "/products/" + productId + "/drafts";
  const draft = await request.post(drafts, { headers, data: { pieces, materials } });
  expect(draft.ok()).toBe(true);
  const publication = await request.post(drafts + "/" + (await draft.json()).id + "/publication", {
    headers, data: { revision: 1 },
  });
  expect(await publication.json()).toBe(1);
  return { productId, stock };
}

async function loginToVillage(page: Page) {
  const login = page.waitForRequest(request => request.url().endsWith("/api/me/context"));
  await page.goto("/");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("demo-industrial");
  await page.locator("#kc-login").click();
  return (await (await login).allHeaders()).authorization;
}

test("liberar a Vila Natalina reserva 30 de 100 placas brancas e mantém 70 disponíveis", async ({ page }) => {
  test.slow(); // Publish a 12-line sheet and open stock for each material before exercising the UI.
  const authorization = await loginToVillage(page);
  const headers = { authorization };
  const { productId, stock } = await prepareVillage(page.request, authorization);
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await button("Engenharia").click();
  await page.getByRole("combobox",{name:"Produto pai",exact:true}).selectOption(productId);
  await page.getByText("Planejamento laser",{exact:true}).click();
  await page.getByLabel("Quantidade de kits").fill("150");
  const laserRow=page.getByRole("row").filter({has:page.getByText("Casinha Branca",{exact:true})}).filter({has:page.getByRole("cell",{name:"300",exact:true})});
  for(const value of ["4","228"]) await expect(laserRow.getByRole("cell",{name:value,exact:true})).toBeVisible();
  await button("Ordens de produção").click();
  await button("Nova OS").click();
  await page.getByRole("combobox", { name: "Produto", exact: true }).selectOption(productId);
  await page.getByRole("combobox", { name: "Versão da ficha", exact: true }).selectOption("1");
  await page.getByLabel("Quantidade de kits").fill("150");
  const create = page.waitForResponse(res => res.request().method() === "PUT" && res.url().includes("/production-orders/"));
  await button("Criar OS").click();
  const creation = await create;
  expect(creation.ok()).toBe(true);
  const draft = await creation.json();
  expect(draft).toMatchObject({ status: "draft", quantity: 150, version: 1 });
  await expect(page.getByRole("heading", { name: productName, exact: true })).toBeVisible();
  await expect(page.locator(".order-detail")).not.toHaveCSS("animation-name", "none");
  // Publish an unmistakably different recipe, then print the already created order.
  const productPath = plant + "/products/" + productId;
  const first = await (await page.request.get(productPath + "/versions/1", { headers })).json();
  const v2 = await page.request.post(productPath + "/drafts", { headers, data: {
    ...first.sheet, pieces: first.sheet.pieces.map((piece: object) => ({ ...piece, steps: ["Roteiro exclusivo V2"] })),
  } });
  expect(v2.ok()).toBe(true);
  const secondDraft = await v2.json();
  const published = await page.request.post(productPath + "/drafts/" + secondDraft.id + "/publication",
    { headers, data: { revision: secondDraft.revision } });
  expect(await published.json()).toBe(2);
  await page.emulateMedia({media:"print"});
  await expect(page.getByText("Ficha técnica v1",{exact:true})).toBeVisible();
  await expect(page.locator(".print-routing tbody tr").first().getByText(/Corte Laser/)).toBeVisible();
  await expect(page.getByText("Roteiro exclusivo V2")).toHaveCount(0);
  await expect(page.locator(".print-materials")).toContainText("30 PL");
  await expect(button("Imprimir OS")).toBeHidden();
  const pdf = await page.pdf({format:"A4",path:resolve("../reports/os-v1.pdf")});
  expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
  await page.emulateMedia({media:"screen"});
  const whiteBefore = await page.request.get(stock[0].path, { headers });
  expect(await whiteBefore.json()).toMatchObject({ physical: "100", reserved: "0", available: "100" });
  await button("Liberar OS").click();
  await expect(page.locator(".order-confirm")).not.toHaveCSS("animation-name", "none");
  await button("Confirmar liberação").click();
  await expect(page.getByText("Liberada", { exact: true }).first()).toBeVisible();
  const materialsPanel = page.getByRole("region", { name: "Materiais da ordem" });
  for (const amount of ["30 PL", "19,9995 PL", "2,46 PL", "150 CX"]) {
    await expect(materialsPanel.getByText(amount, { exact: true })).toBeVisible();
  }
  const release = await page.request.put(creation.url() + "/release", { headers });
  expect(await release.json()).toMatchObject({ status: "released", id: draft.id, version: 1 });
  for (const material of stock) {
    const balance = await page.request.get(material.path, { headers });
    expect(await balance.json()).toMatchObject({ physical: material.opening, reserved: material.reserved });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: resolve("../reports/os-vila-natalina.png"), fullPage: true, animations: "disabled" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".order-detail")).toHaveCSS("animation-name", "none");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: resolve("../reports/os-vila-natalina-mobile.png"), fullPage: true, animations: "disabled" });
  await button("Estoque").click();
  await page.getByRole("combobox", { name: "Material", exact: true }).selectOption(stock[0].materialId);
  for (const [label, quantity] of [["Físico", "100 PL"], ["Reservado", "30 PL"], ["Disponível", "70 PL"]]) {
    await expect(page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd")).toHaveText(quantity);
  }
});

test("o corte de 60 casinhas consome 12 placas uma única vez e libera a limpeza", async ({ page }) => {
  test.slow();
  const authorization = await loginToVillage(page);
  const headers = { authorization };
  const { productId, stock } = await prepareVillage(page.request, authorization);
  const orderId = randomUUID();
  const orderPath = plant + "/production-orders/" + orderId;
  const create = await page.request.put(orderPath, { headers, data: { productId, version: 1, quantity: 150 } });
  expect(create.ok()).toBe(true);
  const release = await page.request.put(orderPath + "/release", { headers });
  expect(release.ok()).toBe(true);
  const number = "OS-" + String((await release.json()).number).padStart(4, "0");
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const card = (step: string) => page.getByRole("region", { name: step, exact: true })
    .getByRole("button", { name: number + " · Casinha Branca · " + step, exact: true });
  const balance = async () => {
    const response = await page.request.get(stock[0].path, { headers });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  expect(await balance()).toMatchObject({ physical: "100", reserved: "30", available: "70" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await button("Kanban").click();
  await expect(page.getByRole("heading", { level: 1, name: "Kanban de produção" })).toBeVisible();
  await card("Corte Laser").click();
  await expect(page.locator(".work-detail")).not.toHaveCSS("animation-name", "none");
  await page.getByLabel("Quantidade de peças", { exact: true }).fill("60");
  await page.getByRole("combobox", { name: "Material consumido", exact: true }).selectOption(stock[0].materialId);
  await page.getByLabel("Quantidade consumida", { exact: true }).fill("12");

  // Commit the report, then lose its first response. A retry must reuse the same request ID.
  const puts: string[] = [];
  const reportsPath = orderPath + "/reports/";
  page.on("request", req => {
    const path = new URL(req.url()).pathname;
    if (req.method() === "PUT" && path.startsWith(reportsPath)) puts.push(path);
  });
  await page.route("**" + reportsPath + "*", async route => {
    const committed = await route.fetch();
    expect(committed.ok()).toBe(true);
    await route.abort("failed");
  }, { times: 1 });
  await button("Registrar apontamento").click();
  await button("Reenviar apontamento").click();
  await expect(page.getByText("Apontamento registrado.", { exact: true })).toBeVisible();
  expect(puts).toHaveLength(2);
  expect(puts[0]).toBe(puts[1]);
  const after = await balance();
  expect(after).toMatchObject({ physical: "88", reserved: "18", available: "70" });
  expect(after.movements.filter((m: { kind: string }) => m.kind === "consumption")).toEqual([
    expect.objectContaining({ quantity: "-12", orderId, reportId: puts[0].split("/").at(-1) }),
  ]);
  const execution = await page.request.get(orderPath + "/execution", { headers });
  expect(execution.ok()).toBe(true);
  const saved = await execution.json();
  expect(saved.reports).toHaveLength(1);
  expect(saved.pieces[0].steps.slice(0, 2)).toMatchObject([
    { name: "Corte Laser", available: "240", completed: "60" },
    { name: "Limpeza", available: "60", completed: "0" },
  ]);
  for (const material of stock.slice(1)) {
    const response = await page.request.get(material.path, { headers });
    expect(await response.json()).toMatchObject({ physical: material.opening, reserved: material.reserved });
  }
  await button("Voltar ao Kanban").click();
  await expect(card("Corte Laser")).toBeVisible();
  await expect(card("Limpeza")).toBeVisible();
  await page.reload();
  await button("Kanban").click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await card("Limpeza").click();
  await expect(page.locator(".work-detail")).toHaveCSS("animation-name", "none");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await button("Abrir OS").click();
  await expect(page.getByRole("heading", { name: productName, exact: true })).toBeVisible();
  await button("Acompanhar etapas").click();
  await expect(card("Limpeza")).toBeVisible();
  await button("Estoque").click();
  await page.getByRole("combobox", { name: "Material", exact: true }).selectOption(stock[0].materialId);
  for (const [label, quantity] of [["Físico", "88 PL"], ["Reservado", "18 PL"], ["Disponível", "70 PL"]]) {
    await expect(page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd")).toHaveText(quantity);
  }
});

test("conferir 30 kits da Vila dá entrada parcial e mantém a OS aberta", async ({page}) => {
  const headers = {authorization: await loginToVillage(page)};
  const {productId} = await prepareVillage(page.request,headers.authorization);
  const path = plant + "/production-orders/" + randomUUID();
  expect((await page.request.put(path,{headers,data:{productId,quantity:150,version:1}})).ok()).toBe(true);
  const order = await (await page.request.put(path + "/release",{headers})).json();
  await page.getByRole("button",{name:"Ordens de produção",exact:true}).click();
  await page.getByRole("button",{name:new RegExp("OS-" + String(order.number).padStart(4,"0"))}).click();
  await page.getByRole("button",{name:"Conferir kits"}).click();
  await expect(page.locator("form.order-confirm")).not.toHaveCSS("animation-name","none");
  await page.getByRole("spinbutton",{name:"Kits conferidos",exact:true}).fill("30");
  await page.getByRole("button",{name:"Confirmar entrada"}).click();
  await expect(page.getByRole("status")).toContainText("Entrada confirmada de 30 kits");
  await expect(page.getByText("Liberada",{exact:true})).toBeVisible();
  expect(await (await page.request.get(path + "/finished-receipts",{headers})).json()).toEqual({received:30,remaining:120,stock:30});
  const button=(name:string)=>page.getByRole("button",{name,exact:true});
  await button("Vendas").click();
  await page.getByRole("combobox",{name:"Produto",exact:true}).selectOption(productId);
  await page.getByLabel("Data",{exact:true}).fill("2026-11-27");
  await page.getByLabel("Canal",{exact:true}).fill("Loja");
  await page.getByLabel("Quantidade",{exact:true}).fill("10");
  await page.getByLabel("Preço unitário (R$)",{exact:true}).fill("12.50");
  await button("Registrar venda").click();
  await expect(page.getByRole("listitem").filter({hasText:"Loja"}).last()).toContainText("125,00");
  await button("Ordens de produção").click();
  await page.getByRole("button",{name:new RegExp("OS-" + String(order.number).padStart(4,"0"))}).click();
  await page.getByText("Corrigir conferência",{exact:true}).click();
  await page.getByRole("combobox",{name:"Conferência original",exact:true}).selectOption({index:1});
  await page.getByLabel("Quantidade recontada").fill("28");
  await page.getByLabel("Motivo da correção").fill("Conferência física");
  await expect(page.getByText(/Saldo projetado: 18/)).toBeVisible();
  await button("Confirmar correção").click();
  await expect(page.getByText("18 kits",{exact:true})).toBeVisible();
  await page.getByText("Encerrar OS",{exact:true}).click();
  await page.getByLabel("Motivo do encerramento").fill("Fim do lote");
  await button("Confirmar encerramento").click();
  await expect(page.getByText("Encerrada",{exact:true}).first()).toBeVisible();
  expect(await (await page.request.get(path+"/finished-receipts",{headers})).json()).toEqual({received:28,remaining:122,stock:18});

});
