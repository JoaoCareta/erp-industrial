import React from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { expect, it } from "vitest";
import { LaserPlanner } from "../src/engineering/LaserPlanner";

it("arredonda cada peça para cortes inteiros antes de somar os minutos", () => {
  render(<LaserPlanner pieces={[{name:"Casinha",quantity:2,piecesPerCut:98,minutesPerCut:57}]} />);
  fireEvent.change(screen.getByLabelText("Quantidade de kits"), {target:{value:"150"}});
  expect(screen.getByText("228 min · 3 h 48 min")).toBeTruthy();
  expect(screen.getByText("300")).toBeTruthy();
  expect(screen.getByText("4")).toBeTruthy();
});
it("explica parâmetros incompletos e lote inválido", () => {
  const {container}=render(<LaserPlanner pieces={[{name:"Antiga",quantity:1}]} />);
  const text=within(container);
  expect(text.getByText("Parâmetros pendentes")).toBeTruthy();
  fireEvent.change(text.getByLabelText("Quantidade de kits"),{target:{value:"0"}});
  expect(text.getByText("Informe um lote inteiro positivo.")).toBeTruthy();
});
it("contabiliza somente as operações de corte do roteiro",()=>{
  const pieces=[{name:"Corte",quantity:2,piecesPerCut:98,minutesPerCut:57,steps:["Corte Laser"]},
    {name:"Montagem final",quantity:1,steps:["Embalagem"]}];
  const view=render(<LaserPlanner pieces={pieces}/>);
  expect(within(view.container).queryByText("Montagem final")).toBeNull();
  view.rerender(<LaserPlanner pieces={[pieces[1]]}/>);
  expect(within(view.container).getByText("Esta ficha não contém operações de corte.")).toBeTruthy();
});
