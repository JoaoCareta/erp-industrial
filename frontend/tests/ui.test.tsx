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
const useFetch = (handler: (p: string, m: string, v: any) => unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      const result = handler(
        path.slice(5),
        init.method!,
        init.body ? JSON.parse(String(init.body)) : undefined,
      );
      return result instanceof Response
        ? result
        : new Response(JSON.stringify(result));
    }),
  );
test("UI-A1 consulta, negativa, lista vazia, suspensão e saída", async () => {
  let status = 200;
  useFetch((p) =>
    status !== 200
      ? new Response("{}", { status })
      : p.includes("suspension")
        ? undefined
        : p.includes("vazio")
          ? []
          : [{ name: "Ana" }],
  );
  const logout = vi.fn(),
    token = vi.fn(async () => "jwt");
  render(<Workspace token={token} logout={logout} />);
  await click("Consultar equipe");
  expect(screen.getByText("Ana")).toBeTruthy();
  field("Setor", "vazio");
  await click("Consultar equipe");
  expect(screen.getByText("Equipe vazia")).toBeTruthy();
  status = 403;
  await click("Consultar equipe");
  expect(screen.getByText("Acesso negado")).toBeTruthy();
  status = 401;
  await click("Consultar equipe");
  expect(screen.getByText("Operação indisponível")).toBeTruthy();
  status = 500;
  useFetch(() => new Response("invalid", { status }));
  await click("Consultar equipe");
  token.mockRejectedValueOnce(Error());
  await click("Consultar equipe");
  expect(screen.getByText("Entre novamente")).toBeTruthy();
  await click("Acessos");
  field("Identificador da conta", "1");
  field("Motivo", "teste");
  useFetch(() => undefined);
  await click("Suspender conta");
  expect(screen.getByText("Conta suspensa")).toBeTruthy();
  await click("Sair");
  expect(logout).toHaveBeenCalled();
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
    if (bits[0] === "catalog") return method === "GET" ? rows[bits[1]] : body;
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
  await click("Engenharia");
  await click("Carregar cadastros");
  await click("category · category");
  field("Descrição", "Madeira");
  await click("Salvar cadastro");
  await click("Novo");
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
  await click("Adicionar peça");
  await click("Remover peça");
  await click("Adicionar peça");
  field("Peça do kit", "part");
  field("Quantidade por kit", "2");
  field("Etapas em ordem (separadas por vírgula)", "corte,pintura");
  for (const k of [
    "Espessura (mm)",
    "Peças por placa",
    "Peças por corte",
    "Minutos por corte",
  ])
    field(k, "2");
  field("Espessura (mm)", "");
  await click("Adicionar material");
  await click("Remover material");
  await click("Adicionar material");
  field("Matéria-prima do produto", "material");
  field("Quantidade por produto", "0.5");
  await click("Salvar rascunho");
  field("Quantidade por kit", "3");
  field("Quantidade por kit", "2");
  await click("Salvar rascunho");
  await click("Publicar ficha");
  await click("Consultar V1");
  expect(screen.getByText("product · V1")).toBeTruthy();
  await click("Copiar para rascunho");
  expect(
    (screen.getByLabelText("Quantidade por kit") as HTMLInputElement).value,
  ).toBe("2");
  field("Matéria-prima do produto", "");
  await act(async () => {
    field("Produto pai", "");
  });
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
  await click("Consultar equipe");
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
