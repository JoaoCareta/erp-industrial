import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Workspace } from "../src/Workspace";

const material = { id: "mdf", code: "MDF", name: "Placa MDF", unitId: "placa", unitCode: "PL", canReceive: true };
const empty = { physical: "0", reserved: "0", available: "0", unitCode: "PL", movements: [] };
const balance = { ...empty, physical: "100.000000", available: "100.000000", movements: [
  { requestId: "request", kind: "opening", sourceId: null, quantity: "100.000000", occurredAt: "2026-11-27T14:00:00Z" },
] };

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

function enter(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}

test("consumo no corte mostra a baixa e protege o vínculo com a OS", async () => {
  const consumption = { requestId: "consumption-id", kind: "consumption", sourceId: null,
    orderId: "order-id", reportId: "report-id", quantity: "-12", occurredAt: "2026-11-27T14:05:00Z" };
  portal(path => path === "stock/materials" ? [material] : {
    ...balance, physical: "88", reserved: "18", available: "70", movements: [...balance.movements, consumption],
  });
  await openStock();
  const row = (await screen.findByRole("cell", { name: "-12 PL" })).closest("tr")!;
  expect(within(row).getByText("Consumo da produção")).toBeTruthy();
  expect(within(row).queryByRole("button", { name: "Estornar" })).toBeNull();
  expect(screen.getByText("88 PL")).toBeTruthy();
  expect(screen.getByText("18 PL")).toBeTruthy();
  expect(screen.getByText("70 PL")).toBeTruthy();
});

test("entrada decimal e estorno confirmado conservam valor e origem", async () => {
  const addition = { requestId: "addition", kind: "receipt", sourceId: null, quantity: "0.123456", occurredAt: "2026-11-27T14:01:00Z" };
  const after = { ...balance, physical: "100.123456", available: "100.123456", movements: [...balance.movements, addition] };
  portal((path, init) => {
    if (path === "stock/materials") return [material];
    if (init.method !== "PUT") return balance;
    const data = JSON.parse(String(init.body));
    if (path.includes("/receipts/")) {
      expect(data).toEqual({ quantity: "0.123456", unitId: "placa" });
      return after;
    }
    expect(path).toContain("/reversals/");
    expect(data).toEqual({ sourceId: "addition" });
    return { ...balance, movements: [...after.movements, { ...addition, requestId: "reversed",
      quantity: "-0.123456", kind: "reversal", sourceId: "addition" }] };
  });
  await openStock();
  await screen.findByLabelText("Quantidade de entrada");
  for (const invalid of ["0", "-1", "1000000000000", "0,1234567"]) {
    enter("Quantidade de entrada", invalid);
    click("Registrar entrada");
    expect(screen.getByRole("alert").textContent).toContain("quantidade positiva");
  }
  enter("Quantidade de entrada", "0,123456");
  click("Registrar entrada");
  const entry = (await screen.findByRole("cell", { name: "Entrada", exact: true })).closest("tr")!;
  fireEvent.click(within(entry).getByRole("button", { name: "Estornar" }));
  click("Cancelar");
  fireEvent.click(within(entry).getByRole("button", { name: "Estornar" }));
  click("Confirmar estorno");
  expect(await screen.findByText("-0,123456 PL")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Origem: Entrada/ }).getAttribute("href")).toBe("#movement-addition");
  expect(within(entry).queryByRole("button")).toBeNull();
});

test("uma resposta perdida conserva a intenção após recarregar, incluindo o estorno", async () => {
  const attempts: string[] = [];
  let count = 0;
  function handler(path: string, init: RequestInit) {
    if (path === "stock/materials") return [material];
    if (init.method !== "PUT") return balance;
    attempts.push(path);
    if (++count === 1) throw new Error("rede");
    return { ...empty, movements: [...balance.movements, { ...balance.movements[0],
      kind: "reversal", quantity: "-100", sourceId: "request", requestId: path.split("/").pop() }] };
  }
  const app = portal(handler);
  await openStock();
  fireEvent.click(await screen.findByRole("button", { name: "Estornar" }));
  click("Confirmar estorno");
  await screen.findByText(/Não foi possível confirmar/);
  app.unmount();
  portal(handler);
  await openStock();
  fireEvent.click(await screen.findByRole("button", { name: "Reenviar lançamento" }));
  await screen.findByText("-100 PL");
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toBe(attempts[0]);
  expect(sessionStorage.length).toBe(0);
});

test("recuperação por extrato reconhece entrada já registrada pelo servidor", async () => {
  let applied = "";
  function handler(path: string, init: RequestInit) {
    if (path === "stock/materials") return [material];
    if (init.method === "PUT") { applied = path.split("/").pop()!; throw new Error("rede"); }
    return applied ? { ...balance, movements: [{ ...balance.movements[0], requestId: applied, kind: "receipt" }] } : empty;
  }
  const app = portal(handler);
  await openStock();
  await screen.findByText("Começar por uma entrada");
  fireEvent.click(screen.getByText("Começar por uma entrada"));
  enter("Quantidade de entrada", "100");
  click("Registrar entrada");
  await screen.findByText(/Não foi possível confirmar/);
  expect(screen.getByRole("button", { name: "Reenviar lançamento" })).toBeTruthy();
  app.unmount();
  portal(handler);
  await openStock();
  await screen.findByText("Entrada", { exact: true });
  expect(screen.queryByText("Reenviar lançamento")).toBeNull();
  expect(sessionStorage.length).toBe(0);
});

test("conflito descarta a tentativa recusada e consulta o saldo atualizado", async () => {
  let reads = 0;
  portal((path, init) => {
    if (path === "stock/materials") return [material];
    if (init.method === "PUT") return new Response("", { status: 409 });
    return ++reads === 1 ? empty : balance;
  });
  await openStock();
  await screen.findByLabelText("Quantidade inicial");
  enter("Quantidade inicial", "40");
  click("Registrar inventário");
  await screen.findByText(/estoque mudou/);
  expect(reads).toBe(2);
  expect(screen.getAllByText("100 PL")).toHaveLength(3);
});

test("consulta sem concessão de escrita preserva casas decimais e ignora leitura atrasada", async () => {
  let release!: (value: unknown) => void;
  const previous = new Promise(resolve => { release = resolve; });
  portal(path => {
    if (path === "stock/materials") return [material, { ...material, id: "outro", code: "ABC", name: "Outro" }];
    if (path.endsWith("mdf")) return previous;
    return { ...balance, physical: "999999999999.999999", available: "1000000000000.000001" };
  }, ["stock.read"]);
  await openStock();
  enter("Material", "outro");
  await screen.findByText("999.999.999.999,999999 PL");
  await act(async () => release(empty));
  expect(screen.getByText("999.999.999.999,999999 PL")).toBeTruthy();
  expect(screen.getByText("1.000.000.000.000,000001 PL")).toBeTruthy();
  expect(screen.queryByText("Registrar inventário")).toBeNull();
  expect(screen.queryByRole("button", { name: "Estornar" })).toBeNull();
});

test("uma resposta antiga de abertura preserva o reenvio pendente de uma entrada posterior", async () => {
  let finish!: (result: unknown) => void;
  let failRead!: () => void;
  let applied = "";
  const opening = new Promise(resolve => { finish = resolve; });
  const lateRead = new Promise((_, reject) => { failRead = () => reject(Error("rede")); });
  const receiptKeys: string[] = [];
  let openingCalls = 0;
  portal((path, init) => {
    if (path === "stock/materials") return [material, { ...material, id: "outro", name: "Outro" }];
    if (path.endsWith("outro")) return lateRead;
    const saved = { ...balance, movements: [{ ...balance.movements[0], requestId: applied }] };
    if (init.method !== "PUT") return applied ? saved : empty;
    if (path.includes("/opening/")) {
      applied = path.split("/").pop()!;
      openingCalls++;
      return opening;
    }
    receiptKeys.push(path);
    if (receiptKeys.length === 1) throw Error("rede");
    return { ...saved, physical: "112", available: "112", movements: [
      ...saved.movements, { ...saved.movements[0], kind: "receipt", quantity: "12", requestId: path.split("/").pop()! },
    ] };
  });
  await openStock();
  const field = await screen.findByLabelText("Quantidade inicial");
  enter("Quantidade inicial", "100");
  const form = field.closest("form")!;
  await act(async () => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(openingCalls).toBe(1);
  enter("Material", "outro");
  enter("Material", material.id);
  await screen.findByLabelText("Quantidade de entrada");
  await act(async () => failRead());
  enter("Quantidade de entrada", "12");
  click("Registrar entrada");
  await screen.findByText(/Não foi possível confirmar/);
  await act(async () => finish(balance));
  expect(sessionStorage.length).toBe(1);
  click("Reenviar lançamento");
  await screen.findByText("12 PL");
  expect(receiptKeys).toHaveLength(2);
  expect(receiptKeys[1]).toBe(receiptKeys[0]);
  expect(sessionStorage.length).toBe(0);
});

test("erro de consulta permite nova tentativa e trata lista vazia ou material inativo", async () => {
  let catalogReads = 0;
  let balanceReads = 0;
  const app = portal(path => {
    if (path === "stock/materials") return ++catalogReads === 1 ? new Response("", { status: 500 }) : [{ ...material, canReceive: false }];
    return ++balanceReads === 1 ? new Response("", { status: 500 }) : balance;
  });
  fireEvent.click(await screen.findByRole("button", { name: "Estoque" }));
  fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));
  await screen.findByRole("option", { name: "MDF · Placa MDF" });
  enter("Material", material.id);
  fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));
  await screen.findByText("Novas entradas indisponíveis para este material.");
  expect(screen.getByRole("button", { name: "Estornar" })).toBeTruthy();
  app.unmount();
  portal(() => []);
  fireEvent.click(await screen.findByRole("button", { name: "Estoque" }));
  await waitFor(() => expect(screen.getByText(/Nenhum material disponível/)).toBeTruthy());
});

function portal(handler: (path: string, init: RequestInit) => unknown, actions = ["stock.read", "stock.write"]) {
  const units = [{ id: "eduk", groupName: "Grupo", name: "Fábrica", sectors: [], actions }];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    const result = path === "/api/me/context" ? { accountId: "test", units }
      : await handler(path.replace("/api/units/eduk/", ""), init);
    return result instanceof Response ? result : new Response(JSON.stringify(result));
  }));
  return render(<Workspace token={async () => "jwt"} logout={() => {}} />);
}

async function openStock() {
  fireEvent.click(await screen.findByRole("button", { name: "Estoque" }));
  await screen.findByRole("option", { name: "MDF · Placa MDF" });
  fireEvent.change(screen.getByLabelText("Material"), { target: { value: material.id } });
}

test("UI-EST abrir 100 placas atualiza os saldos e o extrato do material", async () => {
  const put = vi.fn(() => balance);
  portal((path, init) => {
    if (path === "stock/materials") return [material];
    if (init.method === "PUT") {
      expect(path).toMatch(/^stock\/materials\/mdf\/opening\/[\da-f-]{36}$/i);
      expect(JSON.parse(String(init.body))).toEqual({ quantity: "100", unitId: "placa" });
      return put();
    }
    return empty;
  });
  await openStock();
  fireEvent.change(await screen.findByLabelText("Quantidade inicial"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar inventário" }));
  const ledger = await screen.findByRole("table", { name: "Extrato de movimentos" });
  expect(within(ledger).getAllByRole("row")).toHaveLength(2);
  expect(within(ledger).getByText("100 PL")).toBeTruthy();
  expect(screen.getAllByText("100 PL")).toHaveLength(3);
  expect(screen.getByText("0 PL")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Registrar inventário" })).toBeNull();
  expect(put).toHaveBeenCalledTimes(1);
});
