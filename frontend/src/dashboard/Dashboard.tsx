import React,{useState} from "react";
import type {RequestApi} from "../Workspace";
import {formatCents,minorUnits} from "../quantity";
import {useRead} from "../useRead";
import {Planning} from "../planning/Planning";
import {ReadError} from "../production/WorkDetails";

type Event={kind:string;sourceId:string;orderId:string|null;label:string;date:string;quantity:string;unit:string};
const labels:Record<string,string>={order:"Ordens criadas",stage:"Peças apontadas nas etapas",finished:"Kits conferidos líquidos",sale:"Kits vendidos",purchase:"Compras líquidas (R$)"};
const grants:Record<string,string>={order:"production.read",stage:"production.read",finished:"production.read",sale:"sales.read",purchase:"purchases.read"};
export function Dashboard({api,actions,open}: {api:RequestApi;actions:string[];open:(page:string,id?:string)=>void}) {
  const now=new Date();
  const local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const [showPlanning,setShowPlanning]=useState(false);
  const [from,setFrom]=useState(local);
  const [until,setUntil]=useState(local);
  const valid=!!from && !!until && from<=until;
  const result=useRead<Event[]>(api,valid ? "dashboard?"+new URLSearchParams({from,until,offset:String(-now.getTimezoneOffset())}) : null);
  return <><label>Início do período<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>Fim do período<input type="date" value={until} onChange={e=>setUntil(e.target.value)}/></label>
    {!valid ? <p>Confira as datas do período.</p> : result.value==="error" ? <ReadError retry={result.reload}/> : !result.value ?
      <p>Consultando indicadores…</p> : Object.entries(labels).filter(([key])=>actions.includes(grants[key])).map(([kind,label])=>{
      const rows=(result.value as Event[]).filter(e=>e.kind===kind);
      const cents=rows.reduce((sum,e)=>sum+minorUnits(e.quantity),0n);
      return <details key={kind}><summary>{label} · {kind==="purchase" ? formatCents(cents) : (cents/100n).toLocaleString("pt-BR")}</summary>
        {rows.length ? <ul>{rows.map(e=><li key={e.sourceId}>{e.date} · {e.label} · {e.quantity} {e.unit} · {e.sourceId}
          {e.orderId && <button onClick={()=>open("Ordens de produção",e.orderId!)}>Abrir OS</button>}</li>)}</ul> : <p>Sem movimentos no período.</p>}</details>;
    })}
    {actions.includes("planning.read") && <details onToggle={e=>setShowPlanning(e.currentTarget.open)}><summary>Capacidade e reposição atuais</summary>
      {showPlanning && <Planning api={api} scope="painel" canStock={actions.includes("stock.read")} canWrite={false} summaryOnly/>}
    </details>}
    {actions.includes("planning.read") && <button onClick={()=>open("Planejamento")}>Consultar capacidade e reposição atuais</button>}</>;
}
