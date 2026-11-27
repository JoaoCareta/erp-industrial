import React, { useRef, useState } from "react";
import type { RequestApi } from "../Workspace";
import { ApiError } from "../ApiError";
import { useRead } from "../useRead";
import { displayQuantity } from "../quantity";
import { type Execution, type ReportData, type MaterialUse, dateFormat, executionPath, orderNumber, quantityFormat } from "./execution";
import type { ReportIntent, WorkTarget } from "./Kanban";
import { MaterialTotals, ReadError } from "./WorkDetails";

type Props = {
  api: RequestApi; target: WorkTarget; canReport: boolean; back: () => void; openOrder: (id: string) => void;
  pending: ReportIntent | null; remember: (intent: ReportIntent) => void; forget: (intent: ReportIntent) => void; resume: () => void;
};
function consumptionLabel(materials: MaterialUse[], consumed: NonNullable<ReportData["consumption"]>) {
  const material = materials.find(item => item.materialId === consumed.materialId)!;
  return material.name + " · " + displayQuantity(consumed.quantity, material.unitCode);
}

export function WorkDetail({ api, target, canReport, back, openOrder, pending, remember, forget, resume }: Props) {
  const read = useRead<Execution>(api, executionPath(target.orderId));
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, notify] = useState("");
  const [error, warn] = useState("");
  const work = read.value;
  async function send(intent: ReportIntent) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    warn(""); notify("");
    remember(intent);
    try {
      const result = await api<Execution>("production-orders/" + encodeURIComponent(intent.orderId)
        + "/reports/" + intent.requestId, "PUT", intent.data);
      read.setValue(result);
      forget(intent);
      notify("Apontamento registrado.");
    } catch (reason) {
      if (reason instanceof ApiError && [400, 404, 409, 422].includes(reason.status)) {
        forget(intent);
        read.reload();
        warn("Apontamento recusado. Confira a quantidade disponível na etapa e a reserva do material.");
      } else {
        warn("A confirmação não chegou. Reenvie o apontamento para verificar o resultado.");
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const returnButton = <button type="button" className="order-back" onClick={back}><span aria-hidden="true">‹</span>Voltar ao Kanban</button>;
  if (work === null) return <>{returnButton}<p role="status">Consultando etapa…</p></>;
  if (work === "error") return <>{returnButton}<ReadError retry={read.reload} /></>;
  const piece = work.pieces.find(p => p.pieceIndex === target.pieceIndex)!;
  const step = piece.steps.find(s => s.stepIndex === target.stepIndex)!;
  const reports = work.reports.filter(r => r.pieceIndex === piece.pieceIndex && r.stepIndex === step.stepIndex);
  const belongsHere = pending && pending.orderId === target.orderId && pending.data.pieceIndex === piece.pieceIndex
    && pending.data.stepIndex === step.stepIndex;
  return <div className="work-detail">{returnButton}
    <div className="order-summary"><div><h1>{piece.name}</h1>
      <div className="order-subtitle"><button type="button" className="work-order-link" aria-label="Abrir OS"
        onClick={() => openOrder(work.orderId)}>{orderNumber(work.number)} ›</button>
        <span>{work.productName}</span><span>Ficha técnica v{work.version}</span></div></div>
      <div className="order-lot"><span className="order-label">Quantidade da peça no lote</span>
        <strong>{quantityFormat.format(BigInt(piece.total))} peças</strong></div>
    </div>
    <div className="order-columns">
      <section className="order-stage" aria-label="Etapa da peça">
        <span className="order-label">{target.finished ? "Última etapa" : "Etapa selecionada"}</span><h2>{step.name}</h2>
        <dl className="work-totals"><div><dt>Disponíveis para esta etapa</dt><dd>{quantityFormat.format(BigInt(step.available))}</dd></div>
          <div><dt>Apontadas nesta etapa</dt><dd>{quantityFormat.format(BigInt(step.completed))}</dd></div></dl>
        {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
        {canReport && (belongsHere ? <div className="work-pending">
          <strong>{quantityFormat.format(pending.data.quantity)} peças</strong>
          {pending.data.consumption && <span>{consumptionLabel(work.materials, pending.data.consumption)}</span>}
          <button className="order-action" disabled={busy} onClick={() => void send(pending)}>
            {busy ? "Enviando…" : "Reenviar apontamento"}</button></div> :
          pending ? <button onClick={resume}>Retomar apontamento</button> :
          !target.finished && step.available !== "0" && <ReportForm materials={work.materials} available={step.available}
            save={(quantity, consumption) => void send({ orderId: work.orderId, requestId: crypto.randomUUID(),
              data: {pieceIndex: piece.pieceIndex, stepIndex: step.stepIndex, quantity, consumption} })} />)}
      </section>
      <section className="order-materials" aria-label="Materiais da etapa"><h2 className="order-label">Materiais da ordem</h2>
        {work.materials.map(m => <MaterialTotals key={m.materialId} material={m} />)}
        {!work.materials.length && <p>Esta ficha não exige reserva de material.</p>}
      </section>
      <section className="order-pieces work-history" aria-label="Apontamentos da etapa"><h2>Apontamentos da etapa</h2>
        {!reports.length && <p>Nenhum apontamento nesta etapa.</p>}
        {reports.map(r => <div className="work-event" key={r.requestId}><time dateTime={r.occurredAt}>{dateFormat.format(new Date(r.occurredAt))}</time>
          <strong>{quantityFormat.format(r.quantity)} peças</strong><span>{r.actor}</span>
          {r.consumption && <small>{consumptionLabel(work.materials, r.consumption)}</small>}
        </div>)}
      </section>
    </div>
  </div>;
}

function ReportForm({ materials, available, save }: {
  materials: MaterialUse[]; available: string; save: (quantity: number, consumption: ReportData["consumption"]) => void;
}) {
  const [pieces, setPieces] = useState("");
  const [materialId, setMaterial] = useState("");
  const [amount, setAmount] = useState("");
  const [error, warn] = useState("");
  const material = materials.find(m => m.materialId === materialId);
  const max = Math.min(Number(available), 2147483647);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(pieces);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) {
      warn("Informe uma quantidade inteira dentro do saldo da etapa."); return;
    }
    const decimal = amount.trim().replace(",", ".");
    if (material && (!/^\d{1,12}(?:\.\d{1,6})?$/.test(decimal) || !/[1-9]/.test(decimal))) {
      warn("Informe um consumo positivo com até seis casas decimais."); return;
    }
    save(quantity, material ? { materialId, quantity: decimal } : null);
  }
  return <form className="report-form" onSubmit={submit}>
    <label>Quantidade de peças<input type="number" required min="1" step="1" max={max} value={pieces}
      onChange={e => setPieces(e.target.value)} /></label>
    {materials.length > 0 && <label>Material consumido<select value={materialId} onChange={e => { setMaterial(e.target.value); setAmount(""); }}>
      <option value="">Sem consumo de material</option>{materials.filter(m => m.remaining !== "0").map(m =>
        <option key={m.materialId} value={m.materialId}>{m.name}</option>)}
    </select></label>}
    {material && <label className="work-amount">Quantidade consumida<span><input type="text" inputMode="decimal" required
      value={amount} onChange={e => setAmount(e.target.value)} aria-label="Quantidade consumida" /> {material.unitCode}</span></label>}
    {error && <p role="alert">{error}</p>}
    <button type="submit">Registrar apontamento</button>
  </form>;
}
