import React, { useRef, useState } from "react";
import type { RequestApi } from "./Workspace";
import { ApiError } from "./ApiError";

export type EntryField = {name:string; label:string; type?: "text"|"number"|"date"; min?:string; max?:string; step?:string;
  options?: {value:string;label:string}[]; maxLength?:number};
type Intent = {id:string; values:Record<string,string>};

/** Retain the submitted fields and command identity across reloads until the server confirms the outcome. */
export function EntryForm({scope, label, fields, submit, done, preview}: {
  scope:string; label:string; fields:EntryField[];
  preview?:(values:Record<string,string>)=>string;
  submit:(id:string,values:Record<string,string>)=>Promise<unknown>; done:()=>void;
}) {
  const key = "erp.entry."+scope;
  const [pending,setPending] = useState<Intent|null>(() => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(key) || "null");
      return raw && /^[a-f0-9-]{36}$/i.test(raw.id) && fields.every(f => typeof raw.values[f.name] === "string") ? raw : null;
    } catch { return null; }
  });
  const [message,setMessage] = useState("");
  const [values,setValues]=useState<Record<string,string>>(pending?.values ?? {});
  const [busy,setBusy] = useState(false);
  const lock = useRef(false);
  return <form onChange={e=>setValues(Object.fromEntries(fields.map(f=>[f.name,String(new FormData(e.currentTarget).get(f.name) ?? "")])))} onSubmit={async e=>{
    e.preventDefault();
    if(lock.current) return;
    const form=e.currentTarget;
    const data=new FormData(form);
    const intent=pending ?? {id:crypto.randomUUID(),values:Object.fromEntries(fields.map(f=>[f.name,String(data.get(f.name) ?? "")]))};
    lock.current=true; setBusy(true);
    try {
      sessionStorage.setItem(key,JSON.stringify(intent));
      setPending(intent);
      await submit(intent.id,intent.values);
      sessionStorage.removeItem(key); setPending(null); form.reset(); setValues({}); done(); setMessage("Registro confirmado.");
    } catch(error) {
      if(error instanceof ApiError && [400,403,404,409].includes(error.status)) {
        sessionStorage.removeItem(key); setPending(null); setMessage("Operação recusada. Confira os dados, o saldo e a permissão."); done();
      } else setMessage("Resultado pendente. Reenvie para consultar a mesma operação.");
    } finally {lock.current=false;setBusy(false);}
  }}>
    <fieldset disabled={!!pending || busy}><legend>{label}</legend>
      {fields.map(f=><label key={f.name}>{f.label}{f.options ? <select aria-label={f.label} required name={f.name} defaultValue={pending?.values[f.name] ?? ""}>
        <option value="">Selecione</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select> :
        <input required name={f.name} type={f.type ?? "text"} step={f.step} min={f.min} max={f.max} maxLength={f.maxLength}
          defaultValue={pending?.values[f.name] ?? ""}/>}</label>)}</fieldset>
    {preview && <output>{preview(values)}</output>}
    <button type="submit" disabled={busy}>{pending ? "Reenviar "+label.toLowerCase() : label}</button>
    {message && <p role="status">{message}</p>}</form>;
}

export const scoped = (...parts:string[]) => JSON.stringify(parts);
export type ModuleProps = {api:RequestApi;scope:string};
