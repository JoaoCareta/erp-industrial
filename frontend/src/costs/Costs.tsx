import React,{useRef,useState} from "react";
import type {RequestApi} from "../Workspace";
import {useRead} from "../useRead";
import {ReadError} from "../production/WorkDetails";

type Quote={materials:{name:string;quantity:string;unit:string;unitCost:string|null;amount:string|null}[];stages:{name:string;minutes:string;rate:string;amount:string}[];
  method:string;channel:string;external:string;materialTotal:string|null;labor:string;direct:string|null;price:string|null};
export function Costs({api}:{api:RequestApi}) {
  const products=useRead<{productId:string;name:string;version:number}[]>(api,"costs/products");
  const [selection,setSelection]=useState("");
  const [product,version]=selection.split("|");
  return <>{products.value==="error" ? <ReadError retry={products.reload}/> : <label>Produto e versão<select value={selection} onChange={e=>setSelection(e.target.value)}>
    <option value="">Selecione</option>{products.value?.map(p=><option key={p.productId+p.version} value={p.productId+"|"+p.version}>{p.name} · V{p.version}</option>)}</select></label>}
    {selection && <Simulation key={selection} api={api} base={"costs/products/"+product+"/versions/"+version}/>}</>;
}
function Simulation({api,base}:{api:RequestApi;base:string}) {
  const stages=useRead<string[]>(api,base+"/stages");
  const [quote,setQuote]=useState<Quote|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const revision=useRef(0);
  const numeric=(name:string,label:string)=><label>{label}<input name={name} type="number" required min="0" step="0.000001"/></label>;
  if(stages.value==="error") return <ReadError retry={stages.reload}/>;
  if(!stages.value) return <p>Consultando roteiro…</p>;
  const steps=stages.value;
  return <><form onChange={()=>{revision.current++;setQuote(null);setError("");}} onSubmit={async e=>{
    e.preventDefault();const data=new FormData(e.currentTarget);
    const v=(k:string)=>String(data.get(k));
    setBusy(true);setError("");setQuote(null);const current=revision.current;
    try {const result=await api<Quote>(base+"/simulation","POST",{method:v("method"),channel:v("channel"),commission:v("commission"),
      tax:v("tax"),margin:v("margin"),external:v("external"),stages:steps.map((name,i)=>({name,minutes:v("m"+i),rate:v("r"+i)}))});
      if(current===revision.current)setQuote(result);
    } catch {setError("Confira os parâmetros e as deduções do canal.");} finally {setBusy(false);}
  }}><fieldset disabled={busy}><legend>Simulação por kit</legend><label>Custo dos materiais<select name="method"><option value="average">Média ponderada</option><option value="last">Última compra</option></select></label>
    {steps.map((name,i)=><fieldset key={name}><legend>{name}</legend>{numeric("m"+i,"Minutos por kit em "+name)}{numeric("r"+i,"R$/hora em "+name)}</fieldset>)}
    {numeric("external","Serviço externo por kit (R$)")}<label>Canal<input required maxLength={120} name="channel"/></label>
    {numeric("commission","Comissão (%)")}{numeric("tax","Imposto (%)")}{numeric("margin","Margem (%)")}<button>Calcular preço</button></fieldset></form>
    {error && <p role="alert">{error}</p>}{quote && <section><h2>Memória de cálculo · {quote.channel}</h2><ul>
      {quote.materials.map((m,i)=><li key={i}>{m.name} · {m.quantity} {m.unit} × {m.unitCost ?? "sem compra"} = {m.amount ?? "pendente"}</li>)}
      {quote.stages.map(s=><li key={s.name}>{s.name} · {s.minutes} min × R$ {s.rate}/h ÷ 60 = R$ {s.amount}</li>)}</ul>
      <p>Materiais: {quote.materialTotal ?? "pendente"} · Mão de obra: {quote.labor} · Serviço externo: {quote.external}</p>
      <p>Custo direto: {quote.direct ?? "pendente"} · Preço sugerido: {quote.price ?? "pendente"}</p></section>}</>;
}
