import React, { useEffect, useRef, useState } from "react";
import { ApiError } from "../ApiError";
import type { RequestApi } from "../Workspace";
import { useRead } from "../useRead";
import { displayQuantity as display } from "../quantity";

type Material = { id: string; code: string; name: string; unitId: string; unitCode: string; canReceive: boolean };
type Kind = "opening" | "receipt" | "reversal" | "consumption";
type Movement = { requestId: string; kind: Kind; sourceId: string | null; quantity: string; occurredAt: string };
type Balance = { physical: string; reserved: string; available: string; unitCode: string; movements: Movement[] };
type Operation =
  | { kind: "opening" | "receipt"; quantity: string; unitId: string }
  | { kind: "reversal"; sourceId: string };
type Intent = Operation & { requestId: string };

const titles = { opening: "Inventário inicial", receipt: "Entrada", reversal: "Estorno", consumption: "Consumo da produção" };
const routes = { opening: "opening", receipt: "receipts", reversal: "reversals" };
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function ReadError({ retry }: { retry: () => void }) {
  return <div role="alert"><p>Não foi possível consultar o estoque.</p>
    <button type="button" onClick={retry}>Tentar novamente</button></div>;
}

export function Stock({ api, canWrite, accountId, plantId }: {
  api: RequestApi; canWrite: boolean; accountId: string; plantId: string;
}) {
  const materials = useRead<Material[]>(api, "stock/materials");
  const [selected, select] = useState("");
  if (!materials.value) return <p role="status">Carregando materiais…</p>;
  if (materials.value === "error") return <ReadError retry={materials.reload} />;
  if (!materials.value.length) return <p>Nenhum material disponível para esta unidade.</p>;
  const material = materials.value.find(item => item.id === selected);
  return <>
    <label>Material
      <select value={selected} onChange={e => select(e.target.value)}>
        <option value="">Escolha um material</option>
        {materials.value.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
      </select>
    </label>
    {material && <MaterialStock key={material.id} api={api} canWrite={canWrite} material={material}
      storageKey={"erp.stock." + JSON.stringify([accountId, plantId, material.id])} />}
  </>;
}

function QuantityForm({ kind, unit, submit }: {
  kind: "opening" | "receipt"; unit: string; submit: (quantity: string) => void;
}) {
  const [input, change] = useState("");
  const [error, showError] = useState(false);
  const opening = kind === "opening";
  function save(e: React.FormEvent) {
    e.preventDefault();
    const decimal = input.trim().replace(",", ".");
    if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(decimal) || !/[1-9]/.test(decimal)) {
      showError(true);
      return;
    }
    submit(decimal);
  }
  return <form className="stock-form" onSubmit={save}>
    <label>{opening ? "Quantidade inicial" : "Quantidade de entrada"}
      <input type="text" inputMode="decimal" required value={input} aria-invalid={error}
        onChange={e => { change(e.target.value); showError(false); }} />
    </label>
    <span>{unit}</span>
    <button type="submit">{opening ? "Registrar inventário" : "Registrar entrada"}</button>
    {error && <p role="alert">Informe uma quantidade positiva com até 12 dígitos inteiros e 6 casas decimais.</p>}
  </form>;
}

function MaterialStock({ api, canWrite, material, storageKey }: {
  api: RequestApi; canWrite: boolean; material: Material; storageKey: string;
}) {
  const path = "stock/materials/" + encodeURIComponent(material.id);
  const stock = useRead<Balance>(api, path);
  const [pending, setPending] = useState<Intent | null>(() => JSON.parse(sessionStorage.getItem(storageKey) || "null"));
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const [notice, notify] = useState("");
  const [source, confirm] = useState<Movement | null>(null);
  const confirmed = pending && stock.value && stock.value !== "error" &&
    stock.value.movements.some(movement => movement.requestId === pending.requestId);
  function forget(intent: Intent) {
    if (sessionStorage.getItem(storageKey) === JSON.stringify(intent)) sessionStorage.removeItem(storageKey);
    setPending(null);
  }
  useEffect(() => {
    if (pending && confirmed) forget(pending);
  }, [confirmed, pending, storageKey]);

  async function send(operation: Operation) {
    if (busy.current) return;
    const intent = pending ?? { ...operation, requestId: crypto.randomUUID() };
    busy.current = true;
    setSending(true);
    notify("");
    try {
      // Retain the exact payload and key across reloads if a response is lost at this terminal.
      sessionStorage.setItem(storageKey, JSON.stringify(intent));
      setPending(intent);
      const body = intent.kind === "reversal" ? { sourceId: intent.sourceId } :
        { quantity: intent.quantity, unitId: intent.unitId };
      const next = await api<Balance>(path + "/" + routes[intent.kind] + "/" + intent.requestId, "PUT", body);
      stock.setValue(next);
      forget(intent);
      confirm(null);
      notify("Movimento registrado.");
    } catch (error) {
      if (error instanceof ApiError && [400, 404, 409, 422].includes(error.status)) {
        forget(intent);
        confirm(null);
        stock.reload();
        notify("O estoque mudou ou o lançamento foi recusado. Confira o extrato atualizado.");
      } else {
        notify("Não foi possível confirmar o lançamento. Reenvie para verificar o resultado.");
      }
    } finally {
      busy.current = false;
      setSending(false);
    }
  }
  if (!stock.value) return <p role="status">Consultando saldo…</p>;
  if (stock.value === "error") return <ReadError retry={stock.reload} />;
  const { physical, reserved, available, movements, unitCode } = stock.value;
  const reversed = new Set(movements.map(m => m.sourceId));
  const originLabels = new Map(movements.map(m => [m.requestId, titles[m.kind] + " · " + dateFormat.format(new Date(m.occurredAt))]));
  const receive = (kind: "opening" | "receipt", quantity: string) => void send({ kind, quantity, unitId: material.unitId });
  return <div className="stock-detail">
    <dl className="stock-balances" aria-label="Saldos do material">
      <div><dt>Físico</dt><dd>{display(physical, unitCode)}</dd></div>
      <div><dt>Reservado</dt><dd>{display(reserved, unitCode)}</dd></div>
      <div><dt>Disponível</dt><dd>{display(available, unitCode)}</dd></div>
    </dl>
    {notice && <p role="status">{notice}</p>}
    {canWrite && <section key={pending?.requestId ?? source?.requestId ?? "entry"} aria-label="Lançamentos de estoque">
      {pending && !confirmed ? <>
        <h2>{titles[pending.kind]}</h2>
        <p>{pending.kind === "reversal" ? originLabels.get(pending.sourceId) : display(pending.quantity, unitCode)}</p>
        <button type="button" disabled={sending} onClick={() => void send(pending)}>
          {sending ? "Enviando…" : "Reenviar lançamento"}
        </button>
      </> : source ? <>
        <h2>Estornar {display(source.quantity, unitCode)}?</h2>
        <p>{titles[source.kind]} · {dateFormat.format(new Date(source.occurredAt))}</p>
        <div className="row">
          <button type="button" onClick={() => void send({ kind: "reversal", sourceId: source.requestId })}>Confirmar estorno</button>
          <button type="button" autoFocus onClick={() => confirm(null)}>Cancelar</button>
        </div>
      </> : material.canReceive ? <>
        <h2>{movements.length ? "Entrada de material" : "Inventário inicial"}</h2>
        {movements.length ? <QuantityForm key={movements.length} kind="receipt" unit={unitCode} submit={q => receive("receipt", q)} /> : <>
          <QuantityForm kind="opening" unit={unitCode} submit={q => receive("opening", q)} />
          <details><summary>Começar por uma entrada</summary>
            <QuantityForm kind="receipt" unit={unitCode} submit={q => receive("receipt", q)} />
          </details>
        </>}
      </> : <p>Novas entradas indisponíveis para este material.</p>}
    </section>}
    {movements.length ? <div className="stock-ledger">
      <table><caption>Extrato de movimentos</caption><thead><tr>
        <th>Data e hora</th><th>Movimento</th><th>Quantidade</th>{canWrite && <th>Ação</th>}
      </tr></thead><tbody>{movements.map(m => <tr key={m.requestId} id={"movement-" + m.requestId}>
        <td><time dateTime={m.occurredAt}>{dateFormat.format(new Date(m.occurredAt))}</time></td>
        <td>{titles[m.kind]}{m.sourceId && <small><a href={"#movement-" + m.sourceId}>Origem: {originLabels.get(m.sourceId)}</a></small>}</td>
        <td>{display(m.quantity, unitCode)}</td>
        {canWrite && <td>{(m.kind === "opening" || m.kind === "receipt") && !reversed.has(m.requestId) &&
          <button type="button" disabled={!!pending} onClick={() => confirm(m)}>Estornar</button>}</td>}
      </tr>)}</tbody></table>
    </div> : <p>Sem movimentos para este material.</p>}
  </div>;
}
