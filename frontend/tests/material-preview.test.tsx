import { expect, test, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MaterialPreview, compareFile } from "../src/engineering/MaterialPreview";
import React from "react";

const unit = (id: string, code: string) => ({ id, value: { code, name: code, active: true } });
const units = [unit("1", "PL"), unit("2", "KG")];
const materials = ["MAD-01", "MAD-02"].map(code => ({
  id: code, value: { code, name: "Madeira", active: true, unitId: "1" },
}));
const header = "código,descrição,unidade";
test("prévia de materiais por linha", () => {
  const csv = [header,'MAD-01,Madeira,PL','EVA-02,"azul, claro",PL','EVA-02,EVA,PL',
    'TIN,Tinta,LT','EVA-04,EVA,PL','MAD-02,Madeira,KG',',Madeira,PL','X,,PL','Y,Y,',''].join("\r\n");
  const rows = compareFile(csv, materials, units);
  expect(rows.map(r => r.result)).toEqual(["Confere","Código repetido nas linhas 3, 4","Código repetido nas linhas 3, 4",
    "Unidade desconhecida","Material novo","Unidade divergente","Descrição ambígua. Informe o código","Informe a descrição","Informe a unidade"]);
  expect(compareFile(csv, materials, units)).toEqual(rows);
  expect(compareFile(header+"\nMAD-01,Nova descrição,PL", materials, units)[0].result).toBe("Descrição divergente");
  expect(compareFile(header+'\n,"nome ""A""\nB",PL', [], units)[0].result).toBe("Informe o código");
  expect(compareFile(header+"\nMAD-01,x,PL", [], units)[0].result).toBe("Material novo");
  expect(compareFile(header+"\nMAD-01,x,PL",materials,[{...units[0],value:{...units[0].value,active:false}}])[0].result).toBe("Unidade inativa");
  expect(compareFile(header+"\nMAD-01,x,PL",[{...materials[0],value:{...materials[0].value,active:false}}],units)[0].result).toBe("Material inativo");
  for (const input of ["", "code,name",header+"\nx,y", header+'\n"abc',header+'\nx,"a"x,PL',header+'\nx,a"b,PL']) {
    expect(() => compareFile(input,materials,units)).toThrow();
  }
});

test("abre e corrige o arquivo de prévia", async () => {
  const run = vi.fn(async (action: () => Promise<void>) => { await action(); });
  const view = render(<MaterialPreview catalogs={async () => [materials,units]} run={run} />);
  const input = view.getByLabelText(/Arquivo CSV/);
  fireEvent.change(input, { target: { files: [] } });
  fireEvent.change(input, { target: { files: [{text: async () => header+"\nMAD-01,Madeira,PL"}] } });
  await waitFor(() => expect(view.getByText("Confere")).toBeTruthy());
});
