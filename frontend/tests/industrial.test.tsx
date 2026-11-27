import React from "react";
import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,expect,test,vi} from "vitest";
import {Purchasing} from "../src/purchasing/Purchasing";
import {Outsourcing} from "../src/outsourcing/Outsourcing";
import {Planning} from "../src/planning/Planning";
import {Costs} from "../src/costs/Costs";
import {Dashboard} from "../src/dashboard/Dashboard";
import {OperationalAccess} from "../src/OperationalAccess";
import {Recounts} from "../src/production/Recounts";
import {Sales} from "../src/sales/Sales";
import {EntryForm} from "../src/EntryForm";
import {ApiError} from "../src/ApiError";
import type {RequestApi} from "../src/Workspace";

afterEach(()=>{cleanup();sessionStorage.clear();});
const key="7f480b4c-bde2-4585-8ad8-369ba08c3300";
const product={productId:"toy",name:"Kit",version:1};
const material={id:"mdf",name:"Placa",unitId:"un",unitCode:"PL",canReceive:true};
const balance={opening:0,produced:30,sold:10,available:20};
function mock(read:(path:string)=>unknown) {
  const fn=vi.fn(async (p:string,m?:string,_?:unknown)=>m==="PUT" ? {} : read(p));
  return {fn,api:fn as RequestApi,scope:"factory.a"};
}
async function field(label:string,value:string) {
  fireEvent.change(await screen.findByLabelText(label,{exact:true}),{target:{value}});
}
async function send(label:string) {
  const button=await screen.findByRole("button",{name:label,hidden:true,exact:true});
  fireEvent.submit(button.closest("form")!);
}
async function sent(fn:ReturnType<typeof vi.fn>,path:string,body:unknown) {
  await waitFor(()=>expect(fn).toHaveBeenCalledWith(expect.stringContaining(path),"PUT",body));
}
test("compras filtram período e fornecedor e estornam pela origem",async()=>{
  const row={id:"p1",materialId:"mdf",date:"2026-11-27",supplier:"Serraria",quantity:"10",amount:"140",reversed:false};
  const m=mock(path=>path==="purchases/materials" ? [material,{...material,id:"inactive",canReceive:false}] :
    path==="purchases" ? [row,{...row,id:"p2",reversed:true}] : {quantity:"10",amount:"140",last:"14",average:"14"});
  render(<Purchasing {...m} canWrite/>);
  await field("Matéria-prima","mdf|un"); await field("Fornecedor","Serraria");await field("Data da compra","2026-11-27");
  await field("Quantidade comprada","10");await field("Valor total (R$)","140");await send("Registrar compra");
  await sent(m.fn,"purchases/",{materialId:"mdf",unitId:"un",supplier:"Serraria",date:"2026-11-27",quantity:"10",amount:"140"});
  await field("Material do resumo","mdf");await field("Pesquisar fornecedor","Serr");await field("Data inicial","2026-11-26");await field("Data final","2026-11-28");
  await screen.findByText(/Custo médio: 14/);
  await send("Confirmar estorno");await waitFor(()=>expect(m.fn).toHaveBeenCalledWith("purchases/p1/reversal","PUT"));
  await field("Pesquisar fornecedor","outra");
  expect(screen.queryByText(/· Serraria/)).toBeNull();
});
test("terceiros exibem remessa parcial e lançam o retorno",async()=>{
  const s={id:"ship",number:7,piece:"Roda",partner:"Oficina",date:"2026-11-27",quantity:100,remaining:40,
    serviceOnReturned:"120",deliveries:[{id:"r",date:"2026-11-27",returned:60,lost:0,note:"Parcial"}]};
  const m=mock(p=>p==="outsourcing/orders" ? [{id:"os",number:7,productName:"Kit",status:"released",pieces:[{name:"Roda"}]}] : [s,{...s,id:"done",remaining:0}]);
  render(<Outsourcing {...m} canWrite/>);
  await field("OS e peça","os|0");await field("Terceiro","Oficina");await field("Data de envio","2026-11-27");
  await field("Quantidade enviada","100");await field("Valor unitário do serviço","2");await send("Registrar remessa");
  await sent(m.fn,"outsourcing/",{orderId:"os",pieceIndex:0,partner:"Oficina",date:"2026-11-27",quantity:100,unitPrice:"2"});
  await field("Data do retorno","2026-11-28");await field("Devolvidas","35");await field("Perda confirmada","5");await field("Observação","Contagem");
  await send("Registrar retorno ou perda");await sent(m.fn,"ship/returns/",{date:"2026-11-28",returned:35,lost:5,note:"Contagem"});
  await field("Pesquisar OS, peça ou terceiro","inexistente");expect(screen.queryByText(/40 pendentes/)).toBeNull();
});
test("planejamento mostra o gargalo, movimenta peças, estorna e simula reposição",async()=>{
  const m=mock(p=>p==="stock/materials" ? [material] : p==="planning/products" ? [product] : p==="planning/movements" ?
    [{id:"m1",partId:"r",kind:"assembly",quantity:2,reason:"Montagem",origin:null},{id:"m2",partId:"r",kind:"reversal",quantity:2,reason:"Ajuste",origin:"else"}] :
    p.includes("capacity") ? {kits:5,parts:[{partId:"r",name:"Roda",perKit:2,ready:10,reserved:0,free:10,kits:5}]} :
    {consumed:"25",physical:"50",available:"20",unit:"PL",reorder:true});
  render(<Planning {...m} canWrite canStock/>);
  await field("Ficha publicada","toy|1");await screen.findByText(/Capacidade de montagem: 5/);
  await field("Peça","r");await field("Operação","assembly");await field("Quantidade de peças","2");await field("Motivo","Lote");
  await send("Movimentar peças");await sent(m.fn,"planning/movements/",{partId:"r",kind:"assembly",quantity:2,reason:"Lote"});
  await field("Motivo do estorno","Conferência");await send("Confirmar estorno");
  await sent(m.fn,"planning/movements/",{partId:"r",kind:"reversal",reason:"Conferência",quantity:2,origin:"m1"});
  await field("Material","mdf");await field("De","2026-11-01");await field("Até","2026-11-27");
  await field("Limite na unidade do material","25");await send("Simular reposição");await screen.findByText(/Consumo no período: 25/);
});
test("custos exigem taxas por etapa e identificam material sem compra",async()=>{
  let fail=true;
  const fn=vi.fn(async (p:string)=>p==="costs/products" ? [product] : p.endsWith("stages") ? ["Corte"] : fail ?
    Promise.reject(Error()) : {channel:"Loja",materials:[{name:"MDF",quantity:"1",unit:"PL",unitCost:null,amount:null}],
      stages:[{name:"Corte",minutes:"6",rate:"60",amount:"6.00"}],external:"0",labor:"6.00",materialTotal:null,direct:null,price:null});
  render(<Costs api={fn as RequestApi}/>);
  await field("Produto e versão","toy|1");await field("Minutos por kit em Corte","6");await field("R$/hora em Corte","60");
  await field("Serviço externo por kit (R$)","0");await field("Canal","Loja");await field("Comissão (%)","10");await field("Imposto (%)","5");await field("Margem (%)","25");
  await send("Calcular preço");await screen.findByRole("alert");fail=false;await send("Calcular preço");
  await screen.findByText(/Preço sugerido: pendente/);
  await field("Custo dos materiais","last");expect(screen.queryByText(/Preço sugerido/)).toBeNull();
});
test("painel filtra datas, abre origem e só exibe áreas autorizadas",async()=>{
  const m=mock(p=>p==="planning/products" ? [product] : p.includes("/capacity") ? {kits:5,parts:[]} : [{kind:"finished",sourceId:"rec",orderId:"os",label:"Kit",date:"2026-11-27",quantity:"30",unit:"kits"}]);
  const open=vi.fn();
  render(<Dashboard api={m.api} actions={["production.read","planning.read"]} open={open}/>);
  await screen.findByText(/Kits conferidos líquidos · 30/);
  fireEvent.click(screen.getByRole("button",{name:"Abrir OS",hidden:true}));expect(open).toHaveBeenCalledWith("Ordens de produção","os");
  fireEvent.click(screen.getByText("Consultar capacidade e reposição atuais"));expect(open).toHaveBeenCalledWith("Planejamento");
  fireEvent.click(screen.getByText("Capacidade e reposição atuais"));
  await field("Ficha publicada","toy|1");
  await screen.findByText(/Capacidade de montagem: 5/);
  expect(screen.queryByText(/Kits vendidos/)).toBeNull();
  await field("Início do período","");await screen.findByText("Confira as datas do período.");
  await field("Início do período","2026-01-01");await field("Fim do período","2026-11-27");await screen.findByText(/Kits conferidos líquidos · 30/);
});
test("acesso individual distingue concessão e revogação",async()=>{
  const m=mock(()=>({actions:["production.release"],accounts:[{id:"lead",name:"Líder",actions:["production.release"]},{id:"two",name:"Outro",actions:[]}]}));
  render(<OperationalAccess {...m}/>);
  for(const decision of ["allow","deny"]) {
    await field("Pessoa","lead");await field("Ação","production.release");await field("Decisão",decision);await field("Justificativa","Turno");
    await send("Atualizar permissão");await sent(m.fn,"operational-access/lead/production.release",{requestId:expect.any(String),enabled:decision==="allow",reason:"Turno"});
  }
});
test("correção informa saldo projetado e envia revisão e justificativa",async()=>{
  const m=mock(p=>p.endsWith("receipt-lines") ? [{id:"rec",quantity:30,effective:30,revision:0}] : p.endsWith("finished-receipts") ? {stock:1} :
    [{id:"a",orderId:"os",prior:30,counted:28,state:"pending",reason:"Recontagem",createdAt:"hoje",actor:"Líder"},
      {id:"b",orderId:"os",prior:10,counted:9,state:"applied",reason:"Outra",createdAt:"hoje",actor:"Líder"}]);
  render(<Recounts {...m} id="os" refresh={()=>{}}/>);
  await field("Conferência original","rec|0");await field("Quantidade recontada","29");await screen.findByText(/Saldo projetado: 0/);
  await field("Quantidade recontada","28");await screen.findByText(/Faltam 1/);await field("Motivo da correção","Recontagem");
  await send("Confirmar correção");await sent(m.fn,"os/corrections/",{receiptId:"rec",revision:0,counted:28,reason:"Recontagem"});
  await field("Movimento que regularizou o saldo","Entrada extra");await send("Conciliar divergência");
  await sent(m.fn,"a/resolution",{reason:"Entrada extra"});
});
test("lançamento retoma a mesma chave após perder resposta e descarta rejeição definitiva",async()=>{
  const submit=vi.fn().mockRejectedValueOnce(Error()).mockRejectedValueOnce(new ApiError(409)).mockResolvedValue({});
  const props={scope:"retry",label:"Registrar",fields:[{name:"value",label:"Valor"}],submit,done:vi.fn()};
  for(const stored of ["{","null",JSON.stringify({id:"bad",values:{}}),JSON.stringify({id:key,values:{value:1}})]){
    sessionStorage.setItem("erp.entry.retry",stored);const view=render(<EntryForm {...props}/>);expect(screen.getByRole("button",{name:"Registrar"})).toBeTruthy();view.unmount();
  }
  const view=render(<EntryForm {...props}/>);await field("Valor","100");await send("Registrar");await screen.findByText(/Resultado pendente/);
  view.unmount();render(<EntryForm {...props}/>);await send("Reenviar registrar");await screen.findByText(/Operação recusada/);
  expect(submit.mock.calls[0]).toEqual(submit.mock.calls[1]);expect(sessionStorage.getItem("erp.entry.retry")).toBeNull();
});
test("vendas abre inventário inicial e filtra o histórico",async()=>{
  const m=mock(p=>p==="sales/products" ? [{...product,balance}] : [{id:key,productId:"toy",date:"2026-11-27",channel:"Loja",quantity:2,total:"10",unitPrice:"5"}]);
  render(<Sales {...m} canSell={false} canOpen/>);
  await field("Produto do inventário","toy");await field("Saldo inicial","12");await send("Registrar inventário");
  await sent(m.fn,"sales/products/toy/opening/",{quantity:12});
  await field("Filtrar por produto, canal ou data","Inexistente");expect(screen.queryByText(/· Loja/)).toBeNull();
});

test.each(["Vendas","Compras","Terceiros","Planejamento","Custos","Permissões","Painel","Correções"])(
  "%s permite repetir uma consulta indisponível",async name=>{
    const fn=vi.fn(async()=>{throw Error("conexão");});const api=fn as RequestApi;const props={api,scope:"s"};
    const components:Record<string,React.ReactNode>={
      Vendas:<Sales {...props} canSell={false} canOpen={false}/>,Compras:<Purchasing {...props} canWrite={false}/>,
      Terceiros:<Outsourcing {...props} canWrite={false}/>,Planejamento:<Planning {...props} canWrite={false} canStock/>,
      Custos:<Costs api={api}/>,Permissões:<OperationalAccess {...props}/>,Painel:<Dashboard api={api} actions={[]} open={()=>{}}/>,
      Correções:<Recounts {...props} id="os" refresh={()=>{}}/>
    };
    render(components[name]);const retry=(await screen.findAllByRole("button",{name:"Tentar novamente"}))[0];
    const calls=fn.mock.calls.length;fireEvent.click(retry);await waitFor(()=>expect(fn.mock.calls.length).toBeGreaterThan(calls));
  });
test("mostra módulos liberados no menu do posto",async()=>{
  const {Workspace}=await import("../src/Workspace");
  const actions=["access.operations","dashboard.read","costs.read","planning.read","outsourcing.read","purchases.read","sales.read"];
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith("me/context") ?
    {accountId:"a",units:[{id:"f",name:"Fábrica",groupName:"Grupo",actions,sectors:[]}]} :
    url.endsWith("operational-access") ? {accounts:[],actions:[]} : []))));
  try{
    render(<Workspace token={async()=>"token"} logout={()=>{}}/>);
    for(const page of ["Permissões","Painel do turno","Custos e preços","Planejamento","Terceiros","Compras","Vendas"]){
      fireEvent.click(await screen.findByRole("button",{name:page,exact:true}));
      await screen.findByRole("heading",{name:page,exact:true,level:1});
    }
  }finally{vi.unstubAllGlobals();}
});
