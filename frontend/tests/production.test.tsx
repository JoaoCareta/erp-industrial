import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Workspace } from "../src/Workspace";

const grants = ["production.read", "production.create", "production.release"];
const product = { productId: "toy", code: "CAR", name: "Carrinho de madeira", version: 1 };
const draft = {
  id: "order-one", number: 19, productId: "toy", productCode: "CAR", productName: product.name,
  quantity: 100, version: 1, status: "draft", createdAt: "2026-11-27T12:30:00Z", releasedAt: null,
  materials: [{ materialId: "mdf", name: "Placa de MDF", unitCode: "PL", perKit: "0.30", required: "30" }],
  pieces: [{ name: "Roda", perKit: 4, steps: ["Corte", "Pintura"] }],
};
const released = { ...draft, status: "released", releasedAt: "2026-11-27T14:00:00Z" };
const base = "production-orders";
const catalog = base + "/products";
type Handler = (path: string, init: RequestInit) => unknown;

afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });

function portal(handler: Handler, actions = grants) {
  const units = [{ id: "eduk", groupName: "Grupo", name: "Fábrica", sectors: [], actions }];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (!actions.includes("production.receive") && url.endsWith("/finished-receipts")) return new Response(JSON.stringify({received:0, remaining:100, stock:0}));
    if (url.endsWith("/execution")) return new Response(JSON.stringify({ reports: [], materials: [{
      materialId: "mdf", name: "Placa de MDF", unitCode: "PL", initial: "30", consumed: "0", remaining: "30",
    }] }));
    const result = url === "/api/me/context" ? { accountId: "operator", units }
      : await handler(url.replace("/api/units/eduk/", ""), init);
    return result instanceof Response ? result : new Response(JSON.stringify(result));
  }));
  return render(<Workspace token={async () => "token"} logout={() => {}} />);
}
async function click(label: string | RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: label, exact: true }));
}
async function enter(label: string, value: string) {
  fireEvent.change(await screen.findByLabelText(label), { target: { value } });
}
async function open() { await click("Ordens de produção"); }
async function newOrder() {
  await open();
  await click("Nova OS");
  await screen.findByRole("option", { name: /Carrinho de madeira/ });
  await enter("Produto", product.productId);
  await enter("Versão da ficha", "1");
  await enter("Quantidade de kits", "100");
}

test("a fila de divergências abre a OS correspondente", async () => {
  portal(path => path === base + "/corrections" ? [{id:"question",orderId:draft.id,state:"pending",reason:"Conferir expedição"}] :
    path === base ? [draft] : draft, [...grants,"production.correct"]);
  await open();
  await screen.findByText("Conferir expedição");
  await click("Conferir divergência");
  await screen.findByRole("heading",{name:product.name});
});

test("UI-OS criar e liberar a ordem de 100 kits confirma a reserva de 30 placas", async () => {
  let saved: typeof draft | undefined;
  let releaseCount = 0;
  portal((path, init) => {
    if (path === base) return saved ? [saved] : [];
    if (path === catalog) return [{ ...product, version: 2 }, product];
    if (init.method === "PUT" && !path.endsWith("/release")) {
      expect(JSON.parse(String(init.body))).toEqual({ productId: "toy", version: 1, quantity: 100 });
      saved = { ...draft, id: path.split("/").pop()! };
    }
    if (path.endsWith("/release")) {
      expect(path).toBe(base + "/" + saved!.id + "/release");
      releaseCount++;
      return { ...saved!, status: "released", releasedAt: released.releasedAt };
    }
    return saved;
  });
  await newOrder();
  await click("Criar OS");
  expect(await screen.findByRole("heading", { name: product.name, level: 1 })).toBeTruthy();
  expect(screen.getByText("Rascunho", { exact: true })).toBeTruthy();
  const print = vi.spyOn(window,"print").mockImplementation(() => {});
  await click("Imprimir OS");
  expect(print).toHaveBeenCalledOnce();
  print.mockRestore();
  const materials = screen.getByRole("region", { name: "Materiais da ordem" });
  expect(within(materials).getByText("0,3 PL")).toBeTruthy();
  expect(within(materials).getByText("30 PL")).toBeTruthy();
  expect(screen.getByText("Pintura")).toBeTruthy();
  expect(screen.getByText("400 no lote")).toBeTruthy();
  await click("Liberar OS");
  await click("Cancelar");
  expect(screen.queryByRole("button", { name: "Confirmar liberação" })).toBeNull();
  await click("Liberar OS");
  await click("Confirmar liberação");
  expect(await screen.findByText("Liberada", { exact: true })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Liberar OS" })).toBeNull();
  expect(releaseCount).toBe(1);
});

test("recupera a criação após perda de resposta usando a mesma chave e os mesmos dados", async () => {
  const attempts: Array<[string, string]> = [];
  const handler: Handler = (path, init) => {
    if (path === base) return [];
    if (path === catalog) return [product];
    if (init.method === "PUT") {
      attempts.push([path, String(init.body)]);
      if (attempts.length === 1) throw Error("conexão perdida");
    }
    return draft;
  };
  const first = portal(handler);
  await newOrder();
  await click("Criar OS");
  await screen.findByRole("button", { name: "Reenviar criação" });
  first.unmount();
  portal(handler);
  await open();
  await click("Retomar criação da OS");
  await click("Reenviar criação");
  expect(await screen.findByRole("heading", { name: product.name, level: 1 })).toBeTruthy();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(sessionStorage.length).toBe(0);
});

test("ordem consultada usa a ficha da criação e separa consulta, criação e liberação", async () => {
  const app = portal(path => path === base ? [released] : released, ["production.read"]);
  await open();
  await click(/OS-0019/);
  expect(await screen.findByRole("heading", { name: product.name, level: 1 })).toBeTruthy();
  expect(screen.getByText("Ficha técnica v1")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Liberar OS" })).toBeNull();
  await click("Voltar para ordens");
  expect(await screen.findByRole("button", { name: /OS-0019/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Nova OS" })).toBeNull();
  app.unmount();
  portal(path => path === base ? [draft] : draft, ["production.read", "production.create"]);
  await open();
  expect(await screen.findByRole("button", { name: "Nova OS" })).toBeTruthy();
  await click(/OS-0019/);
  await screen.findByText("Rascunho", { exact: true });
  expect(screen.queryByRole("button", { name: "Liberar OS" })).toBeNull();
});

test("liberação recusada preserva o rascunho e a mesma OS pode ser reenviada após falha de rede", async () => {
  const releases: string[] = [];
  portal((path, init) => {
    if (path === base) return [draft];
    if (init.method !== "PUT") return draft;
    releases.push(path);
    if (releases.length === 1) return new Response("", { status: 409 });
    if (releases.length === 2) throw Error("rede");
    return released;
  }, ["production.read", "production.release"]);
  await open();
  await click(/OS-0019/);
  await click("Liberar OS");
  await click("Confirmar liberação");
  expect((await screen.findByRole("alert")).textContent).toMatch(/saldo/i);
  expect(screen.getByText("Rascunho", { exact: true })).toBeTruthy();
  await click("Confirmar liberação");
  expect((await screen.findByRole("alert")).textContent).toMatch(/confirmar/i);
  await click("Confirmar liberação");
  expect(await screen.findByText("Liberada", { exact: true })).toBeTruthy();
  expect(releases).toEqual(Array(3).fill(base + "/" + draft.id + "/release"));
});

test("listas e detalhe permitem tentar novamente, incluindo uma unidade sem fichas", async () => {
  const reads = new Map<string, number>();
  portal(path => {
    const count = (reads.get(path) ?? 0) + 1;
    reads.set(path, count);
    if (count === 1) return new Response("", { status: 503 });
    if (path === base) return [draft];
    if (path === catalog) return [];
    return draft;
  });
  await open();
  await click("Tentar novamente");
  await click(/OS-0019/);
  await click("Tentar novamente");
  await screen.findByRole("heading", { name: product.name, level: 1 });
  await click("Voltar para ordens");
  await click("Nova OS");
  await click("Tentar novamente");
  await screen.findByText(/Nenhuma ficha publicada/);
  await click("Voltar para ordens");
  expect(await screen.findByRole("button", { name: /OS-0019/ })).toBeTruthy();
});

test("criação rejeitada libera a correção dos dados para uma nova tentativa", async () => {
  const attempts: string[] = [];
  portal((path, init) => {
    if (path === base) return [];
    if (path === catalog) return [product, { ...product, productId: "barco", name: "Barco" }];
    if (init.method === "PUT") {
      attempts.push(path);
      if (attempts.length === 1) return new Response("", { status: 422 });
    }
    return draft;
  });
  await newOrder();
  await click("Criar OS");
  expect((await screen.findByRole("alert")).textContent).toMatch(/ficha/i);
  expect(sessionStorage.length).toBe(0);
  await enter("Produto", "barco");
  await enter("Versão da ficha", "1");
  await enter("Quantidade de kits", "20");
  await click("Criar OS");
  expect(await screen.findByRole("heading", { name: product.name, level: 1 })).toBeTruthy();
  expect(attempts[1]).not.toBe(attempts[0]);
});

test("ordem sem matéria-prima informa que a ficha dispensa reserva", async () => {
  const noMaterials = { ...draft, materials: [] };
  portal((path, init) => {
    if (path === base) return [noMaterials];
    return init.method === "PUT" ? { ...released, materials: [] } : noMaterials;
  });
  await open();
  await click(/OS-0019/);
  await screen.findByText("Esta ficha não exige reserva de material.");
  await click("Liberar OS");
  await click("Confirmar liberação");
  expect(await screen.findByText("OS liberada", { exact: true })).toBeTruthy();
  expect(screen.queryByText("Reserva confirmada")).toBeNull();
});

test("dois acionamentos antes da resposta enviam uma só criação e liberação", async () => {
  let finishCreate!: (value: unknown) => void;
  let finishRelease!: (value: unknown) => void;
  const puts: string[] = [];
  portal((path, init) => {
    if (path === base) return [];
    if (path === catalog) return [product];
    if (init.method !== "PUT") return draft;
    puts.push(path);
    if (path.endsWith("/release")) return new Promise(resolve => { finishRelease = resolve; });
    return new Promise(resolve => { finishCreate = resolve; });
  });
  await newOrder();
  const form = screen.getByRole("button", { name: "Criar OS" }).closest("form")!;
  await act(async () => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(puts).toHaveLength(1);
  // A delayed reply must leave a newer intent belonging to this same tab intact.
  const key = sessionStorage.key(0)!;
  sessionStorage.setItem(key, JSON.stringify({ id: "subsequent" }));
  await act(async () => finishCreate(draft));
  expect(sessionStorage.getItem(key)).toContain("subsequent");
  await click("Liberar OS");
  const submit = screen.getByRole("button", { name: "Confirmar liberação" });
  await act(async () => { fireEvent.click(submit); fireEvent.click(submit); });
  expect(puts).toHaveLength(2);
  await act(async () => finishRelease(released));
  await screen.findByText("Liberada", { exact: true });
});

test("UI-OS conferir 30 kits e retomar a entrada após perder a resposta", async () => {
  let saves = 0;
  let key = "";
  let received = 0;
  portal((path, init) => {
    if (path === base) return [released];
    if (path === base + "/" + released.id) return released;
    if (init.method === "PUT") {
      expect(JSON.parse(String(init.body))).toEqual({quantity: 30});
      if (++saves === 1) { key = path; received = 30; throw new Error("offline"); }
      expect(path).toBe(key);
    }
    return {received, remaining: 100 - received, stock: received};
  }, [...grants, "production.receive"]);
  await open();
  await click(/OS-0019/);
  await click("Conferir kits");
  await click("Cancelar");
  await click("Conferir kits");
  await enter("Kits conferidos", "30");
  await click("Confirmar entrada");
  await screen.findByText("Reenvie a mesma conferência para confirmar a entrada.");
  await click("Reenviar conferência");
  expect(await screen.findByText("Entrada confirmada de 30 kits.")).toBeTruthy();
  expect(screen.getByText("30 kits")).toBeTruthy();
  expect(screen.getByText("Liberada")).toBeTruthy();
});

test("UI-OS recupera a consulta e atualiza o saldo após recusar um lote", async () => {
  let reads = 0;
  portal((path, init) => {
    if (path === base) return [released];
    if (path === base + "/" + released.id) return released;
    if (init.method === "PUT") return new Response("", {status:409});
    if (++reads === 1) return new Response("", {status:500});
    return {received:0, remaining:100, stock:0};
  }, [...grants, "production.receive"]);
  await open();
  await click(/OS-0019/);
  const panel = await screen.findByRole("region",{name:"Conferência de acabados"});
  fireEvent.click(await within(panel).findByRole("button"));
  await click("Conferir kits");
  await enter("Kits conferidos","30");
  await click("Confirmar entrada");
  await screen.findByText(/Entrada recusada/);
  expect(sessionStorage.length).toBeLessThan(3);
});

test("encerramento preserva recebimentos e permite consultar o motivo", async () => {
  let closed=false;
  portal((path,init)=>{
    if(path===base)return [released];
    if(path.endsWith("/closure")){closed=true;return {...released,status:"closed",closureReason:"Fim do turno"};}
    if(path.endsWith("/receipt-lines") || path.endsWith("/corrections"))return [];
    return {...released,...(closed ? {status:"closed",closureReason:"Fim do turno"} : {})};
  },[...grants,"production.close","production.correct"]);
  await open();await click(/OS-0019/);
  fireEvent.click(await screen.findByText("Encerrar OS"));
  await enter("Motivo do encerramento","Fim do turno");await click("Confirmar encerramento");
  expect(await screen.findByText("Encerrada",{exact:true})).toBeTruthy();
  expect(await screen.findByText("Fim do turno")).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Confirmar encerramento"})).toBeNull();
});
