import React,{useState} from "react";
import {EntryForm,type ModuleProps} from "../EntryForm";
import {useRead} from "../useRead";
import {ReadError} from "../production/WorkDetails";
import {orderNumber} from "../production/execution";
type Source={id:string;number:number;productName:string;pieces:{name:string}[]};
type Shipment={id:string;number:number;piece:string;partner:string;date:string;quantity:number;unitPrice:string;remaining:number;
  serviceOnReturned:string;deliveries:{id:string;date:string;returned:number;lost:number;note:string}[]};
export function Outsourcing({api,scope,canWrite}:ModuleProps & {canWrite:boolean}) {
  const orders=useRead<Source[]>(api,canWrite ? "outsourcing/orders" : null);
  const shipments=useRead<Shipment[]>(api,"outsourcing");
  const [query,search]=useState("");
  if(orders.value==="error" || shipments.value==="error") return <ReadError retry={()=>{orders.reload();shipments.reload();}}/>;
  if(!shipments.value) return <p>Consultando remessas…</p>;
  const options=(orders.value || []).flatMap(o=>o.pieces.map((p,i)=>({
    value:o.id+"|"+i,label:orderNumber(o.number)+" · "+o.productName+" · "+p.name})));
  return <>{canWrite && <EntryForm scope={scope+".dispatch"} label="Registrar remessa" fields={[
    {name:"piece",label:"OS e peça",options},{name:"partner",label:"Terceiro",maxLength:160},{name:"date",label:"Data de envio",type:"date"},
    {name:"quantity",label:"Quantidade enviada",type:"number",min:"1",step:"1"},{name:"unitPrice",label:"Valor unitário do serviço",type:"number",min:"0",step:"0.01"}]}
    submit={(id,{piece,quantity,...v})=>{const [orderId,index]=piece.split("|");return api("outsourcing/"+id,"PUT",{...v,orderId,pieceIndex:Number(index),quantity:Number(quantity)});}} done={shipments.reload}/>}
    <label>Pesquisar OS, peça ou terceiro<input value={query} onChange={e=>search(e.target.value)}/></label>
    {shipments.value.filter(s=>[orderNumber(s.number),s.piece,s.partner].join(" ").toLowerCase().includes(query.toLowerCase())).map(s=><section key={s.id}>
      <h2>{orderNumber(s.number)} · {s.piece}</h2><p>{s.partner} · Envio em {s.date} · {s.quantity} enviadas · {s.remaining} pendentes</p>
      <p>Serviço sobre peças devolvidas: R$ {s.serviceOnReturned}</p>
      <ul>{s.deliveries.map(r=><li key={r.id}>{r.date} · {r.returned} devolvidas · {r.lost} perdas · {r.note}</li>)}</ul>
      {canWrite && s.remaining>0 && <EntryForm scope={scope+s.id} label="Registrar retorno ou perda" fields={[
        {name:"date",label:"Data do retorno",type:"date"},{name:"returned",label:"Devolvidas",type:"number",min:"0",step:"1"},
        {name:"lost",label:"Perda confirmada",type:"number",min:"0",step:"1"},{name:"note",label:"Observação",maxLength:500}]}
        submit={(id,v)=>api("outsourcing/"+s.id+"/returns/"+id,"PUT",{...v,returned:Number(v.returned),lost:Number(v.lost)})} done={shipments.reload}/>}
    </section>)}</>;
}
