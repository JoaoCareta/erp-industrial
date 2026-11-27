import React,{useState} from "react";
import {EntryForm,type ModuleProps} from "../EntryForm";
import {useRead} from "../useRead";
import {ReadError} from "../production/WorkDetails";

type Material={id:string;name:string;unitId:string;unitCode:string;canReceive:boolean};
type Purchase={id:string;materialId:string;date:string;supplier:string;quantity:string;amount:string;reversed:boolean};
type Summary={quantity:string;amount:string;last:string|null;average:string|null};

export function Purchasing({api,scope,canWrite}:ModuleProps & {canWrite:boolean}) {
  const materials=useRead<Material[]>(api,"purchases/materials");
  const history=useRead<Purchase[]>(api,"purchases");
  const [material,select]=useState("");
  const [supplier,setSupplier]=useState("");
  const [from,setFrom]=useState("");
  const [until,setUntil]=useState("");
  const params=new URLSearchParams({materialId:material,supplier});
  if(from) params.set("from",from);
  if(until) params.set("until",until);
  const summary=useRead<Summary>(api,material ? "purchases/summary?"+params : null);
  const reload=()=>{history.reload();summary.reload();};
  if(materials.value==="error" || history.value==="error") return <ReadError retry={()=>{materials.reload();reload();}}/>;
  if(!materials.value || !history.value) return <p>Consultando compras…</p>;
  const all=materials.value;
  const options=all.filter(m=>m.canReceive).map(m=>({value:m.id+"|"+m.unitId,label:m.name+" ("+m.unitCode+")"}));
  const rows=history.value.filter(p=>(!material || p.materialId===material) && p.supplier.toLowerCase().includes(supplier.toLowerCase())
    && (!from || p.date>=from) && (!until || p.date<=until));
  return <>{canWrite && <EntryForm scope={scope+".purchase"} label="Registrar compra" fields={[{name:"material",label:"Matéria-prima",options},
    {name:"supplier",label:"Fornecedor",maxLength:160},{name:"date",label:"Data da compra",type:"date"},
    {name:"quantity",label:"Quantidade comprada",type:"number",min:"0.000001",step:"0.000001"},
    {name:"amount",label:"Valor total (R$)",type:"number",min:"0",step:"0.01"}]}
    submit={(id,{material,...values})=>{const [materialId,unitId]=material.split("|");return api("purchases/"+id,"PUT",{materialId,unitId,...values});}} done={reload}/>}
    <h2>Histórico de compras</h2><label>Material do resumo<select value={material} onChange={e=>select(e.target.value)}>
      <option value="">Todos</option>{all.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>Pesquisar fornecedor<input value={supplier} onChange={e=>setSupplier(e.target.value)}/></label>
    <label>Data inicial<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>Data final<input type="date" value={until} onChange={e=>setUntil(e.target.value)}/></label>
    {material && (summary.value==="error" ? <ReadError retry={summary.reload}/> : summary.value && <p>
      Quantidade: {summary.value.quantity} · Gasto: R$ {summary.value.amount} · Último preço: {summary.value.last ?? "—"} · Custo médio: {summary.value.average ?? "—"}</p>)}
    <ul>{rows.map(p=><li key={p.id}>{p.date} · {p.supplier} · {all.find(m=>m.id===p.materialId)?.name} · {p.quantity} · R$ {p.amount}
      {p.reversed ? " · Estornada" : canWrite && <details><summary>Estornar compra</summary><EntryForm label="Confirmar estorno" scope={scope+p.id}
        fields={[]} submit={()=>api("purchases/"+p.id+"/reversal","PUT")} done={reload}/></details>}</li>)}</ul></>;
}
