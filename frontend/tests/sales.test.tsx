import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Sales } from "../src/sales/Sales";

afterEach(() => { cleanup(); sessionStorage.clear(); });

test("registra uma venda e consulta o total no histórico",async () => {
  const balance = {opening:0,produced:30,sold:0,available:30};
  const productId = crypto.randomUUID();
  let rows: object[] = [];
  const api = vi.fn(async (path:string,method?:string,data?:unknown) => {
    if (path === "sales/products") return [{productId,name:"Vila",balance}];
    if (method === "PUT") { rows=[{...(data as object),id:"v1",total:"125.00"}]; return rows[0]; }
    return rows;
  });
  render(<Sales api={api as any} scope="teste" canSell canOpen={false}/>);
  await screen.findByRole("option",{name:"Vila"});
  for(const [label,value] of [["Produto",productId],["Canal","Loja"],["Quantidade","10"],["Preço unitário (R$)","12.50"],["Data","2026-11-27"]]){
    fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});
  }
  fireEvent.click(screen.getByRole("button",{name:"Registrar venda"}));
  await waitFor(()=>expect(rows).toHaveLength(1));
  expect(await screen.findByText("125,00",{exact:false})).toBeTruthy();
});
