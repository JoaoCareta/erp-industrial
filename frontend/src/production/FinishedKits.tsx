import { encodePending, savePending, readPending } from "./pending";
import React, { useRef, useState } from "react";
import type { RequestApi } from "../Workspace";
import { ApiError } from "../ApiError";
import { useRead } from "../useRead";
import { ReadError } from "./WorkDetails";

type Balance = { received: number; remaining: number; stock: number };
type Batch = { id: string; quantity: number };

export function FinishedKits({ api, path, storageKey, canReceive }: {
  api: RequestApi; path: string; storageKey: string; canReceive: boolean;
}) {
  const url = path + "/finished-receipts";
  const balance = useRead<Balance>(api, url);
  const [batch, setBatch] = useState<Batch | null>(() => readPending<Batch>(storageKey));
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, announce] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  async function receive() {
    if (sending.current) return;
    const intent = batch || { id: crypto.randomUUID(), quantity: Number(amount) };
    savePending(storageKey, encodePending(intent));
    setBatch(intent);
    sending.current = true;
    setBusy(true);
    try {
      balance.setValue(await api<Balance>(url + "/" + intent.id, "PUT", { quantity: intent.quantity }));
      sessionStorage.removeItem(storageKey);
      setBatch(null);
      setAmount("");
      setEditing(false);
      announce("Entrada confirmada de " + intent.quantity + " kits.");
    } catch (e) {
      if (e instanceof ApiError && [400, 403, 404, 409].includes(e.status)) {
        sessionStorage.removeItem(storageKey);
        setBatch(null);
        balance.reload();
        announce("Entrada recusada. Confira o saldo e a permissão de conferência.");
      } else announce("Reenvie a mesma conferência para confirmar a entrada.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const totals = balance.value;
  return <section className="order-stage finished-kits" aria-label="Conferência de acabados"><span className="order-label">Estoque de acabados</span>
    <h2>Conferência de kits</h2>
    {totals === "error" ? <ReadError retry={balance.reload} /> : totals && <>
      <progress aria-label="Kits conferidos no lote" value={totals.received} max={totals.received + totals.remaining} />
      <dl className="order-log"><div><dt>Recebidos desta OS</dt><dd>{totals.received}</dd></div>
        <div><dt>Por conferir</dt><dd>{totals.remaining}</dd></div>
        <div><dt>Saldo do produto na fábrica</dt><dd>{totals.stock} kits</dd></div></dl>
      {canReceive && (batch || totals.remaining > 0) && (editing || batch ?
        <form className="order-confirm order-form" onSubmit={e => { e.preventDefault(); void receive(); }}>
          <label>Kits conferidos<input autoFocus required type="number" min="1" max={totals.remaining} step="1"
            value={batch?.quantity ?? amount} disabled={!!batch} onChange={e => setAmount(e.target.value)} /></label>
          <button type="submit" disabled={busy}>{batch ? "Reenviar conferência" : "Confirmar entrada"}</button>
          {!batch && <button type="button" onClick={() => setEditing(false)}>Cancelar</button>}
        </form> : <button className="order-action" onClick={() => setEditing(true)}>Conferir kits</button>)}
    </>}
    {message && <p className="order-confirm" role="status">{message}</p>}
  </section>;
}
