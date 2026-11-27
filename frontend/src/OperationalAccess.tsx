import React from "react";
import {EntryForm,type ModuleProps} from "./EntryForm";
import {useRead} from "./useRead";
import {ReadError} from "./production/WorkDetails";
const actionNames:Record<string,string>={"production.read":"Consultar produção","production.create":"Criar OS","production.release":"Liberar OS",
  "production.report":"Apontar produção","production.receive":"Conferir kits","production.correct":"Corrigir conferência","production.close":"Encerrar OS",
  "stock.read":"Consultar estoque","stock.write":"Lançar estoque","sales.read":"Consultar vendas","sales.write":"Registrar vendas",
  "purchases.read":"Consultar compras","purchases.write":"Registrar compras","outsourcing.read":"Consultar remessas","outsourcing.write":"Movimentar remessas",
  "planning.read":"Consultar planejamento","planning.write":"Movimentar peças","costs.read":"Simular custos e preços","dashboard.read":"Ver painel do turno"};
export function OperationalAccess({api,scope}:ModuleProps) {
  const grants=useRead<{actions:string[];accounts:{id:string;name:string;actions:string[]}[]}>(api,"operational-access");
  if(grants.value==="error")return <ReadError retry={grants.reload}/>;
  if(!grants.value)return <p>Consultando permissões…</p>;
  return <><ul>{grants.value.accounts.map(a=><li key={a.id}>{a.name} · {a.actions.map(k=>actionNames[k]).join(", ") || "Sem ações operacionais"}</li>)}</ul>
    <EntryForm scope={scope+".grant"} label="Atualizar permissão" fields={[
      {name:"account",label:"Pessoa",options:grants.value.accounts.map(a=>({label:a.name,value:a.id}))},
      {name:"action",label:"Ação",options:grants.value.actions.map(k=>({label:actionNames[k],value:k}))},
      {name:"decision",label:"Decisão",options:[{label:"Conceder",value:"allow"},{label:"Revogar",value:"deny"}]},
      {name:"reason",label:"Justificativa",maxLength:500}]}
      submit={(requestId,v)=>api("operational-access/"+encodeURIComponent(v.account)+"/"+encodeURIComponent(v.action),"PUT",{requestId,enabled:v.decision==="allow",reason:v.reason})}
      done={grants.reload}/></>;
}
