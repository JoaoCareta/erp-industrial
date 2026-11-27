import React, {useState} from "react";
import {EntryForm,type ModuleProps} from "../EntryForm";
import {formatCents,minorUnits} from "../quantity";
import {useRead} from "../useRead";
import {ReadError} from "../production/WorkDetails";
type Product = {productId:string; name:string; balance:{opening:number;produced:number;sold:number;available:number}};
type Sale = {id:string;productId:string;date:string;channel:string;quantity:number;unitPrice:string;total:string};
const money = (value:string) => "R$ "+formatCents(minorUnits(value));

export function Sales({api,scope,canSell,canOpen}:ModuleProps & {canSell:boolean;canOpen:boolean}) {
  const products = useRead<Product[]>(api,"sales/products");
  const sales = useRead<Sale[]>(api,"sales");
  const [query,filter] = useState("");
  const refresh=()=>{products.reload();sales.reload();};
  if(products.value==="error" || sales.value==="error") return <ReadError retry={refresh}/>;
  if(!products.value || !sales.value) return <p>Consultando vendas…</p>;
  const options=products.value.map(p=>({value:p.productId,label:p.name}));
  const product={name:"productId",label:"Produto",options};
  const names=new Map(products.value.map(p=>[p.productId,p.name]));
  return <><div className="industrial-table"><table><caption>Estoque de acabados</caption><thead><tr>
    {["Produto","Inicial","Produzido líquido","Vendido","Disponível"].map(h=><th key={h}>{h}</th>)}</tr></thead>
    <tbody>{products.value.map(p=><tr key={p.productId}><th>{p.name}</th><td>{p.balance.opening}</td><td>{p.balance.produced}</td>
      <td>{p.balance.sold}</td><td>{p.balance.available}</td></tr>)}</tbody></table></div>
    {canSell && <EntryForm scope={scope+".sale"} label="Registrar venda" fields={[product,{name:"date",label:"Data",type:"date"},
      {name:"channel",label:"Canal",maxLength:120},{name:"quantity",label:"Quantidade",type:"number",min:"1",step:"1"},
      {name:"unitPrice",label:"Preço unitário (R$)",type:"number",min:"0",step:"0.01"}]}
      submit={(id,v)=>api("sales/"+id,"PUT",{...v,quantity:Number(v.quantity)})} done={refresh}/>}
    {canOpen && <details><summary>Inventário inicial de acabados</summary><EntryForm scope={scope+".opening"} label="Registrar inventário"
      fields={[{...product,label:"Produto do inventário"},{name:"quantity",label:"Saldo inicial",type:"number",min:"0",step:"1"}]}
      submit={(id,v)=>api("sales/products/"+encodeURIComponent(v.productId)+"/opening/"+id,"PUT",{quantity:Number(v.quantity)})} done={refresh}/></details>}
    <h2>Histórico de vendas</h2><label>Filtrar por produto, canal ou data<input value={query} onChange={e=>filter(e.target.value)}/></label>
    <ul>{sales.value.filter(s=>[names.get(s.productId),s.date,s.channel].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(s=>
      <li key={s.id}>{s.date} · {names.get(s.productId)} · {s.channel} · {s.quantity} × {money(s.unitPrice)} = {money(s.total)}</li>)}</ul></>;
}
