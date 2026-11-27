import React,{useState} from "react";
import type {ModuleProps} from "../EntryForm";
import {EntryForm} from "../EntryForm";
import {useRead} from "../useRead";
import {ReadError} from "../production/WorkDetails";

type Product={productId:string;version:number;name:string};
type Part={partId:string;name:string;perKit:number;ready:number;reserved:number;free:number;kits:number};
type Move={id:string;partId:string;kind:string;quantity:number;reason:string;origin:string|null};
const kinds:Record<string,string>={opening:"Inventário inicial",reserve:"Reserva",release:"Liberar reserva",assembly:"Montagem",
  assembleReserved:"Montar peças reservadas",loss:"Perda confirmada",reversal:"Estorno"};
export function Planning({api,scope,canWrite,canStock,summaryOnly=false}:ModuleProps & {canWrite:boolean;canStock:boolean;summaryOnly?:boolean}) {
  const products=useRead<Product[]>(api,"planning/products");
  const [version,select]=useState("");
  const [product,rev]=version.split("|");
  const capacity=useRead<{kits:number;parts:Part[]}>(api,version ? "planning/products/"+product+"/versions/"+rev+"/capacity" : null);
  const moves=useRead<Move[]>(api,summaryOnly ? null : "planning/movements");
  const reload=()=>{capacity.reload();moves.reload();};
  const available=capacity.value && capacity.value!=="error" ? capacity.value : null;
  return <>{products.value==="error" ? <ReadError retry={products.reload}/> : <label>Ficha publicada<select value={version} onChange={e=>select(e.target.value)}>
    <option value="">Selecione</option>{products.value?.map(p=><option key={p.productId+p.version} value={p.productId+"|"+p.version}>{p.name} · V{p.version}</option>)}</select></label>}
    {capacity.value==="error" && <ReadError retry={capacity.reload}/>}
    {version && available && <section><h2>Capacidade de montagem: {available.kits} kits</h2>
      <ul>{available.parts.map(p=><li key={p.partId}>{p.name} · {p.perKit} por kit · {p.ready} prontas · {p.reserved} reservadas · {p.free} livres · {p.kits} kits</li>)}</ul>
      {canWrite && <EntryForm scope={scope+".pieces"} label="Movimentar peças" fields={[
        {name:"partId",label:"Peça",options:available.parts.map(p=>({value:p.partId,label:p.name}))},
        {name:"kind",label:"Operação",options:Object.entries(kinds).filter(([k])=>k!=="reversal").map(([value,label])=>({value,label}))},
        {name:"quantity",label:"Quantidade de peças",type:"number",min:"1",step:"1"},{name:"reason",label:"Motivo",maxLength:500}]}
        submit={(id,v)=>api("planning/movements/"+id,"PUT",{...v,quantity:Number(v.quantity)})} done={reload}/>}</section>}
    {moves.value==="error" ? <ReadError retry={moves.reload}/> : moves.value && <ul>{moves.value.map(m=><li key={m.id}>{kinds[m.kind]} · {m.quantity} · {m.reason}
      {canWrite && m.kind!=="reversal" && !(moves.value as Move[]).some(row=>row.origin===m.id) && <details><summary>Estornar movimento</summary>
        <EntryForm scope={scope+m.id} label="Confirmar estorno" fields={[{name:"reason",label:"Motivo do estorno",maxLength:500}]}
          submit={(id,v)=>api("planning/movements/"+id,"PUT",{...v,partId:m.partId,kind:"reversal",quantity:m.quantity,origin:m.id})} done={reload}/></details>}</li>)}</ul>}
    {canStock && <Replenishment api={api}/>}</>;
}
function Replenishment({api}:Pick<ModuleProps,"api">) {
  const materials=useRead<{id:string;name:string}[]>(api,"stock/materials");
  const [path,setPath]=useState<string|null>(null);
  const result=useRead<{consumed:string;physical:string;available:string;unit:string;reorder:boolean}>(api,path);
  return <section><h2>Reposição de matéria-prima</h2><form onSubmit={e=>{e.preventDefault();
    setPath("planning/replenishment?"+new URLSearchParams(Array.from(new FormData(e.currentTarget),([k,v])=>[k,String(v)])));}}>
    <label>Material<select name="material" required><option value="">Selecione</option>{materials.value && materials.value!=="error" &&
      materials.value.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>De<input name="from" type="date" required/></label><label>Até<input name="until" type="date" required/></label>
    <label>Saldo de referência<select name="basis"><option value="available">Disponível</option><option value="physical">Físico</option></select></label>
    <label>Limite na unidade do material<input name="threshold" type="number" step="any" min="0" required/></label><button>Simular reposição</button></form>
    {materials.value==="error" && <ReadError retry={materials.reload}/>}
    {result.value==="error" ? <ReadError retry={result.reload}/> : result.value && <p>Consumo no período: {result.value.consumed} {result.value.unit} · Físico: {result.value.physical} · Disponível: {result.value.available} · {result.value.reorder ? "Repor" : "Acima ou no limite"}</p>}</section>;
}
