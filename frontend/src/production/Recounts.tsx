import React from "react";
import {EntryForm,type ModuleProps} from "../EntryForm";
import {useRead} from "../useRead";
import {ReadError} from "./WorkDetails";

type Line={id:string;quantity:number;effective:number;revision:number};
type Adjustment={id:string;orderId:string;prior:number;counted:number;state:string;reason:string;actor:string;createdAt:string;resolution:string|null};

export function Recounts({api,scope,id,refresh}:ModuleProps & {id:string;refresh:()=>void}) {
  const path="production-orders/"+encodeURIComponent(id);
  const lines=useRead<Line[]>(api,path+"/receipt-lines");
  const history=useRead<Adjustment[]>(api,"production-orders/corrections");
  const balance=useRead<{stock:number}>(api,path+"/finished-receipts");
  const reload=()=>{lines.reload();history.reload();balance.reload();refresh();};
  if(lines.value==="error" || history.value==="error" || balance.value==="error") return <ReadError retry={reload}/>;
  if(!lines.value || !history.value || !balance.value) return <p>Consultando conferências…</p>;
  const options=lines.value.map(l=>({value:l.id+"|"+l.revision,label:l.id+" · "+l.effective+" kits"}));
  const receipts=lines.value;
  const available=balance.value.stock;
  return <details className="no-print"><summary>Corrigir conferência</summary>
    <EntryForm scope={scope+".recount"} label="Confirmar correção" fields={[{name:"receipt",label:"Conferência original",options},
      {name:"counted",label:"Quantidade recontada",type:"number",min:"0",step:"1"},{name:"reason",label:"Motivo da correção",maxLength:500}]}
      preview={v=>{
        const line=receipts.find(r=>v.receipt===r.id+"|"+r.revision);
        if(!line || !v.counted) return "";
        const delta=Number(v.counted)-line.effective;
        return "Ajuste de "+delta+" kits. "+(available+delta<0 ? "Faltam "+-(available+delta)+" para conciliar." : "Saldo projetado: "+(available+delta)+".");
      }}
      submit={(key,v)=>{const [receiptId,revision]=v.receipt.split("|");
        return api(path+"/corrections/"+key,"PUT",{receiptId,revision:Number(revision),counted:Number(v.counted),reason:v.reason});}} done={reload}/>
    <ul>{history.value.filter(a=>a.orderId===id).map(a=><li key={a.id}>{a.prior} → {a.counted} · {a.reason} · {a.createdAt} · {a.actor}
      {a.state==="pending" ? <><strong> Divergência aberta</strong><EntryForm scope={scope+"."+a.id} label="Conciliar divergência"
        fields={[{name:"reason",label:"Movimento que regularizou o saldo",maxLength:500}]}
        submit={(_,body)=>api(path+"/corrections/"+a.id+"/resolution","PUT",body)} done={reload}/></> : " · Aplicada"}</li>)}</ul>
  </details>;
}
