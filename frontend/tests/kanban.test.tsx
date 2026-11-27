import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Workspace } from "../src/Workspace";

const plant = { id: "eduk", name: "Fábrica", groupName: "Grupo", sectors: [] };
const initial = {
  orderId: "vila", number: 1, productName: "Vila Natalina", version: 1, quantity: 150,
  pieces: [{ pieceIndex: 0, name: "Casinha Branca", total: "300", steps: [
    { stepIndex: 0, name: "Corte Laser", available: "300", completed: "0" },
    { stepIndex: 1, name: "Limpeza", available: "0", completed: "0" },
  ] }],
  materials: [{ materialId: "branca", name: "Placa branca", unitCode: "PL", initial: "30", consumed: "0", remaining: "30" }],
  reports: [],
};
const report = {
  requestId: "saved", pieceIndex: 0, stepIndex: 0, quantity: 60, actor: "Ana",
  occurredAt: "2026-11-27T13:00:00Z", consumption: { materialId: "branca", quantity: "12" },
};
const afterCut = {
  ...initial, materials: [{ ...initial.materials[0], consumed: "12", remaining: "18" }], reports: [report],
  pieces: [{ ...initial.pieces[0], steps: [
    { ...initial.pieces[0].steps[0], available: "240", completed: "60" },
    { ...initial.pieces[0].steps[1], available: "60" },
  ] }],
};
const board = "production-orders/kanban", execution = "production-orders/vila/execution";
type Handler = (path: string, method: string, body?: string) => unknown;
function portal(handler: Handler, actions = ["production.read", "production.report"]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const result = url === "/api/me/context" ? { accountId: "ana", units: [{...plant, actions}] }
      : await handler(url.replace("/api/units/eduk/", ""), init.method!, init.body as string);
    return result instanceof Response ? result : new Response(JSON.stringify(result));
  }));
  return render(<Workspace token={async () => "token"} logout={() => {}} />);
}
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
const click = async (name: string | RegExp) => fireEvent.click(await screen.findByRole("button", { name, exact: true }));
const change = async (label: string, value: string) => fireEvent.change(await screen.findByLabelText(label), {target: {value}});
const cut = "OS-0001 · Casinha Branca · Corte Laser";

test("UI-KAN corte da Casinha Branca consome 12 placas e libera peças para limpeza", async () => {
  let saved = false;
  portal((path, method, body) => {
    if (path === board) return [saved ? afterCut : initial];
    if (path === execution) return saved ? afterCut : initial;
    expect(method).toBe("PUT");
    expect(path).toMatch(/^production-orders\/vila\/reports\//);
    expect(JSON.parse(body!)).toEqual({pieceIndex: 0, stepIndex: 0, quantity: 60,
      consumption: {materialId: "branca", quantity: "12"}});
    saved = true;
    return afterCut;
  });
  await click("Kanban");
  await click(cut);
  await change("Quantidade de peças", "60");
  await change("Material consumido", "branca");
  await change("Quantidade consumida", "12");
  await click("Registrar apontamento");
  expect(await screen.findByText("Apontamento registrado.")).toBeTruthy();
  const materials = screen.getByRole("region", {name: "Materiais da etapa"});
  expect(within(materials).getByText("12 PL")).toBeTruthy();
  expect(within(materials).getByText("18 PL")).toBeTruthy();
  expect(screen.getByText("Ana")).toBeTruthy();
  await click("Voltar ao Kanban");
  await click("OS-0001 · Casinha Branca · Limpeza");
  expect(await screen.findByRole("heading", {name: "Limpeza"})).toBeTruthy();
});

test("uma confirmação perdida pode ser recuperada após recarregar e reenviar a mesma chave", async () => {
  const attempts: string[] = [];
  const handler: Handler = (path, method, body) => {
    if (path === board) return [initial];
    if (path === execution) return initial;
    expect(method).toBe("PUT");
    attempts.push(path + body);
    if (attempts.length === 1) throw Error("rede");
    return afterCut;
  };
  const first = portal(handler);
  await click("Kanban"); await click(cut);
  await change("Quantidade de peças", "60");
  await click("Registrar apontamento");
  await screen.findByRole("button", {name: "Reenviar apontamento"});
  first.unmount();
  portal(handler);
  await click("Kanban"); await click("Retomar apontamento"); await click("Reenviar apontamento");
  await screen.findByText("Apontamento registrado.");
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(sessionStorage.length).toBe(0);
});

test("consulta permite filtrar o quadro e abrir o histórico das peças concluídas", async () => {
  const done = {...afterCut, pieces: [{...initial.pieces[0], steps: [
    { ...initial.pieces[0].steps[0], available: "0", completed: "300" },
    { ...initial.pieces[0].steps[1], available: "0", completed: "300" },
  ]}]};
  portal(path => path === board ? [done] : done, ["production.read"]);
  await click("Kanban");
  await change("Filtrar por OS", "vila");
  await change("Filtrar por etapa", "Limpeza");
  expect(screen.queryByRole("region", {name: "Corte Laser"})).toBeNull();
  await change("Filtrar por etapa", "");
  await click("OS-0001 · Casinha Branca · Concluído");
  await screen.findByRole("region", {name: "Materiais da etapa"});
  expect(screen.queryByRole("button", {name: "Registrar apontamento"})).toBeNull();
  await click("Voltar ao Kanban");
  await screen.findByRole("region", {name: "Concluído"});
});

test("ausência de ordem liberada e falha da consulta permitem atualizar o quadro", async () => {
  let reads = 0;
  portal(() => ++reads === 1 ? new Response("", {status: 503}) : []);
  await click("Kanban");
  await click("Tentar novamente");
  await screen.findByText("Nenhuma OS liberada nesta unidade.");
  await click("Atualizar quadro");
  await screen.findByText("Nenhuma OS liberada nesta unidade.");
  expect(reads).toBe(3);
});

test("valida quantidade e consumo, atualiza saldos recusados e registra uma etapa sem material", async () => {
  let put = 0, reads = 0;
  const noMaterial = { ...initial, materials: [], reports: [{...report, consumption: null}] };
  portal((path, method) => {
    if (path === board) return [initial];
    if (path === execution) {
      reads++;
      if (reads === 1) return new Response("", {status: 503});
      return reads === 2 ? initial : noMaterial;
    }
    expect(method).toBe("PUT");
    return ++put === 1 ? new Response("", {status: 409}) : noMaterial;
  });
  await click("Kanban"); await click(cut); await click("Tentar novamente");
  const form = (await screen.findByRole("button", {name: "Registrar apontamento"})).closest("form")!;
  await change("Quantidade de peças", "301"); fireEvent.submit(form);
  expect((await screen.findByRole("alert")).textContent).toMatch(/inteira/);
  await change("Quantidade de peças", "1"); await change("Material consumido", "branca");
  await change("Quantidade consumida", "0"); fireEvent.submit(form);
  expect((await screen.findByRole("alert")).textContent).toMatch(/consumo positivo/);
  await change("Quantidade consumida", "0,0000007"); fireEvent.submit(form);
  expect(put).toBe(0);
  await change("Quantidade consumida", "1,25"); await click("Registrar apontamento");
  expect((await screen.findByRole("alert")).textContent).toMatch(/recusado/i);
  expect(sessionStorage.length).toBe(0);
  await screen.findByText("Esta ficha não exige reserva de material.");
  expect(screen.queryByRole("combobox",{name: "Material consumido"})).toBeNull();
  await change("Quantidade de peças", "1"); await click("Registrar apontamento");
  await screen.findByText("Apontamento registrado.");
});

test("ligação entre OS e quadro preserva a seleção e mostra as reservas após consumo", async () => {
  const order = {id: initial.orderId, number: 1, productCode: "VL", productName: initial.productName, status: "released",
    quantity: 150, version: 1, createdAt: report.occurredAt, releasedAt: report.occurredAt,
    pieces: [{name: "Casinha Branca", perKit: 2, steps: ["Corte Laser","Limpeza"]}],
    materials: [{ ...initial.materials[0], perKit: "0.2", required: "30" }]};
  let reads = 0;
  portal(path => {
    if (path === board) return [afterCut, {...initial, orderId:"other", number:2}];
    if (path === "production-orders") return [order];
    if (path === execution) return ++reads === 1 ? new Response("",{status:503}) : afterCut;
    return order;
  });
  await click("Ordens de produção"); await click(/OS-0001/); await click("Tentar novamente");
  await screen.findByRole("heading", {name: "Em andamento"});
  expect(screen.getByText("Liberada", {exact:true})).toBeTruthy();
  expect(screen.getByText("18 PL", {exact:true})).toBeTruthy();
  await click("Acompanhar etapas");
  expect(await screen.findByRole("button", {name:cut})).toBeTruthy();
  expect(screen.queryByRole("button", {name:/OS-0002/})).toBeNull();
  await click(cut); await click("Abrir OS");
  expect(await screen.findByRole("heading",{name:"Vila Natalina"})).toBeTruthy();
});

test("bloqueia clique duplo e conserva um apontamento posterior no armazenamento", async () => {
  let finish!: (result: unknown) => void;
  let calls = 0;
  portal((path, method) => {
    if (path === board) return [initial];
    if (path === execution) return initial;
    expect(method).toBe("PUT"); calls++;
    return new Promise(resolve => { finish = resolve; });
  });
  await click("Kanban"); await click(cut); await change("Quantidade de peças","2");
  const form = screen.getByRole("button", {name:"Registrar apontamento"}).closest("form")!;
  await act(async () => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(calls).toBe(1);
  const key = sessionStorage.key(0)!;
  sessionStorage.setItem(key, JSON.stringify({requestId:"outra"}));
  await act(async () => finish(initial));
  expect(sessionStorage.getItem(key)).toContain("outra");
});

test("duas peças no mesmo corte compartilham a coluna e um envio pendente identifica a etapa original", async () => {
  const second = {...initial.pieces[0], pieceIndex: 1, name: "Moinho Branco"};
  const twoPieces = {...initial, pieces:[initial.pieces[0], second]};
  portal((path, method) => {
    if (path === board) return [twoPieces];
    if (path === execution) return twoPieces;
    expect(method).toBe("PUT"); throw Error("rede");
  });
  await click("Kanban");
  const col = await screen.findByRole("region",{name:"Corte Laser"});
  expect(within(col).getAllByRole("button")).toHaveLength(2);
  await click(cut);
  await change("Quantidade de peças","3"); await click("Registrar apontamento");
  await screen.findByRole("button",{name:"Reenviar apontamento"});
  await click("Voltar ao Kanban");
  await click("OS-0001 · Moinho Branco · Corte Laser");
  expect(screen.queryByRole("button",{name:"Registrar apontamento"})).toBeNull();
  await click("Retomar apontamento");
  await screen.findByRole("heading",{name:"Casinha Branca"});
  expect(await screen.findByRole("button",{name:"Reenviar apontamento"})).toBeTruthy();
});
