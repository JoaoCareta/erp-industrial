import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Workspace } from "../src/Workspace";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetModules();
});
const button = (name: string) =>
  screen.getByRole("button", { name, exact: true });
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(button(name));
  });
};
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), {
    target: { value },
  });
const plant = {
  id: "eduk",
  name: "Fábrica",
  groupName: "Mundo Eduk",
  actions: [
    "engineering.edit",
    "engineering.read",
    "engineering.publish",
    "account.suspend",
  ],
  sectors: [{ id: "corte", name: "Corte" }],
};
const defaultContext = { accountId: "teste", units: [plant] };
const useFetch = (handler: (p: string, m: string, v: any) => unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      const result =
        path === "/api/me/context"
          ? defaultContext
          : await handler(
              path.replace(/^\/api\/units\/[^/]+\//, ""),
              init.method!,
              init.body ? JSON.parse(String(init.body)) : undefined,
            );
      return result instanceof Response
        ? result
        : new Response(JSON.stringify(result));
    }),
  );
test("UI-A1 carregamento, equipe, lista vazia, erro e saída", async () => {
  const logout = vi.fn(),
    token = vi.fn(async () => "jwt");
  let finish!: (rows: unknown[]) => void;
  useFetch(() => new Promise<unknown[]>(resolve => { finish = resolve }));
  render(<Workspace token={token} logout={logout} />);
  await screen.findByText("Carregando equipe…");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button",{name:"Acessos"})).toBeNull();
  await act(async () => finish([
    { id: "1", name: "Ana", role: "Líder de equipe" },
    { id: "2", name: "João Otávio Silva", role: null },
    { id: "3", name: "Antonio da Silva", role: "Operador" },
  ]));
  await screen.findByText("Ana");
  for (const label of ["A", "JO", "AS", "Líder de equipe", "Função não informada", "3 pessoas"])
    expect(screen.getByText(label)).toBeTruthy();
  expect(screen.queryByLabelText("Trocar unidade")).toBeNull();
  useFetch(() => []);
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(screen.getByText("Equipe vazia")).toBeTruthy();
  useFetch(() => new Response("{}", { status: 500 }));
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(screen.getByRole("alert").textContent).toContain("Não foi possível carregar a equipe.");
  useFetch(() => []);
  await click("Tentar novamente");
  expect(screen.getByText("Equipe vazia")).toBeTruthy();
  await click("Sair");
  expect(logout).toHaveBeenCalled();
});
test("seleção de unidade, setores e revogação", async () => {
  localStorage.clear();
  const u = {
    ...plant,
    actions: ["team.read"],
    sectors: [
      { id: "corte", name: "Corte" },
      { id: "pintura", name: "Pintura" },
    ],
  };
  let units = [u, { ...u, id: "outra", name: "Outra" }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (p: string) =>
      p.endsWith("context")
        ? new Response(JSON.stringify({ accountId: "duas", units }))
        : units.length
          ? new Response('[{"id":"1","name":"Ana","role":null}]')
          : new Response("", { status: 403 }),
    ),
  );
  render(<Workspace token={async () => "jwt"} logout={() => {}} />);
  await screen.findByLabelText("Trocar unidade");
  field("Trocar unidade", "outra");
  field("Setor", "corte");
  await screen.findByText("Ana");
  units = [];
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await screen.findByText("Nenhuma unidade liberada");
  expect(screen.queryByText("Ana")).toBeNull();
});
test("entrada indisponível e conta suspensa", async () => {
  const token = vi.fn(async () => "jwt");
  token.mockRejectedValueOnce(Error());
  const app = render(<Workspace token={token} logout={() => {}} />);
  await screen.findByText("Entre novamente");
  app.unmount();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 403 })),
  );
  render(<Workspace token={token} logout={() => {}} />);
  await screen.findByText("Acesso negado");
});
test("UI-E2 cadastros, rascunho e histórico consultável", async () => {
  const kinds = ["category", "unit", "material", "product", "part"];
  const rows: any = Object.fromEntries(
    kinds.map((k) => [
      k,
      [
        {
          kind: k,
          id: k,
          value: {
            name: k,
            code: k,
            dimension: "",
            active: true,
            unitId: k === "material" ? "unit" : undefined,
          },
        },
      ],
    ]),
  );
  let sheet: any;
  let versions: number[] = [];
  useFetch((path, method, body) => {
    const bits = path.split("/");
    if (bits[0] === "catalog") return method === "GET" ? rows[bits[1]] : {id:bits[1],kind:bits[1],value:body};
    if (path.endsWith("publication")) {
      versions = [1];
      return 1;
    }
    if (path.endsWith("versions")) return versions;
    if (path.endsWith("versions/1"))
      return {
        product: rows.product[0],
        version: 1,
        sheet,
        parts: rows.part,
        materials: [{ material: rows.material[0], unit: rows.unit[0] }],
      };
    sheet = body.sheet || body;
    return { id: "draft", revision: 1 };
  });
  render(<Workspace token={async () => "jwt"} logout={() => {}} />);
  await screen.findByRole("button", { name: "Engenharia" });
  await click("Engenharia");
  await click("Novo");
  field("Tipo","category");
  await click("category · category");
  field("Descrição", "Madeira");
  await click("Salvar cadastro");
  await click("Limpar campos");
  field("Tipo", "unit");
  field("Código", "kg");
  field("Descrição", "Quilo");
  field("Dimensão", "massa");
  fireEvent.click(screen.getByLabelText("Ativo"));
  await click("Salvar cadastro");
  field("Tipo", "material");
  field("Código", "m");
  field("Descrição", "md");
  field("Categoria de referência", "category");
  field("Unidade de referência", "unit");
  await click("Salvar cadastro");
  field("Pesquisar", "sem resultados");
  expect(screen.queryByText("material · material")).toBeNull();
  await act(async () => {
    field("Produto pai", "product");
  });
  await click("Fechar cadastros");
  await click("Remover peça");
  await click("Adicionar item");
  field("Peça do kit", "part");
  await click("part · part");
  await click("Cadastrar peça");
  await click("Fechar cadastros");
  field("Quantidade por kit", "2");
  const toggle = (step:string) => fireEvent.click(screen.getByRole("checkbox",{name:step}));
  toggle("pintura");toggle("corte");toggle("montagem");toggle("montagem");
  const paint=button("pintura"),cut=button("corte");
  fireEvent.dragStart(paint,{dataTransfer:{setData:vi.fn()}});
  fireEvent.dragOver(cut);fireEvent.drop(cut);fireEvent.dragEnd(paint);
  fireEvent.keyDown(paint,{key:"ArrowRight"});
  fireEvent.keyDown(cut,{key:"ArrowLeft"});
  expect(document.querySelector(".route-preview")?.textContent).toBe("cortepintura");
  for (const k of [
    "Espessura (mm)",
    "Peças por placa",
    "Peças por corte",
    "Minutos por corte",
  ])
    field(k, "2");
  field("Espessura (mm)", "");
  await click("Adicionar item");
  fireEvent.change(screen.getAllByLabelText("Tipo de item").at(-1)!,{target:{value:"material"}});
  await click("Remover material");
  await click("Adicionar item");
  fireEvent.change(screen.getAllByLabelText("Tipo de item").at(-1)!,{target:{value:"material"}});
  field("Matéria-prima do produto", "ausente");
  expect(screen.getByText("Nenhum item encontrado")).toBeTruthy();
  field("Matéria-prima do produto", "material");
  await click("material · material");
  await click("Cadastrar matéria-prima");
  await click("Fechar cadastros");
  field("Quantidade por produto", "0.5");
  await click("Salvar rascunho");
  field("Quantidade por kit", "3");
  field("Quantidade por kit", "2");
  await click("Salvar rascunho");
  await click("Publicar ficha");
  await click("Consultar V1");
  expect(screen.getByText("product · V1")).toBeTruthy();
  await click("Editar composição");
  expect(
    (screen.getByLabelText("Quantidade por kit") as HTMLInputElement).value,
  ).toBe("2");
  field("Matéria-prima do produto", "");
  await act(async () => {
    field("Produto pai", "");
  });
  await act(async () => {field("Produto pai","product")});
  expect(screen.getByText("product · V1")).toBeTruthy();
  await click("Novo");
  field("Código","P2");
  field("Descrição","Kit novo");
  await click("Salvar cadastro");
  expect(screen.getByLabelText("Peça do kit")).toBeTruthy();
});
test("inicialização OIDC, renovação e saída", async () => {
  const init = vi.fn().mockResolvedValue(true),
    updateToken = vi.fn(),
    logout = vi.fn();
  vi.doMock("keycloak-js", () => ({
    default: class {
      init = init;
      updateToken = updateToken;
      logout = logout;
      token = "ok";
    },
  }));
  document.body.innerHTML = '<div id="root"></div>';
  useFetch(() => []);
  await act(async () => {
    await import("../src/main");
  });
  await screen.findByText("Equipe vazia");
  await click("Sair");
  expect(updateToken).toHaveBeenCalledWith(15);
  expect(logout).toHaveBeenCalled();
});
test("login indisponível", async () => {
  vi.doMock("keycloak-js", () => ({
    default: class {
      async init() {
        throw Error();
      }
    },
  }));
  document.body.innerHTML = '<div id="root"></div>';
  await act(async () => {
    await import("../src/main");
  });
  await waitFor(() =>
    expect(screen.getByText(/Login indisponível/)).toBeTruthy(),
  );
});
