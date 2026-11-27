import { encodePending, readPending, scopeId } from "./pending";
import React, { useState } from "react";
import type { RequestApi } from "../Workspace";
import { useRead } from "../useRead";
import { type Execution, type PieceProgress, type StepProgress, type ReportData, orderNumber, quantityFormat } from "./execution";
import { WorkDetail } from "./WorkDetail";
import { ReadError } from "./WorkDetails";
import "./kanban.css";

export type WorkTarget = { orderId: string; pieceIndex: number; stepIndex: number; finished?: boolean };
export type ReportIntent = { orderId: string; requestId: string; data: ReportData };
type Card = { order: Execution; piece: PieceProgress; step: StepProgress; finished: boolean };
type Lane = { name: string; cards: Card[]; finished: boolean };
const finishedLabel = "Concluído";

/** A partial batch can occupy several route steps at once. Only pieces actually available appear in each lane. */
function lanesFor(orders: Execution[]): Lane[] {
  const routes = new Map<string, Lane>();
  const finished: Lane = { name: finishedLabel, cards: [], finished: true };
  for (const order of orders) {
    for (const piece of order.pieces) {
      for (const step of piece.steps) {
        let lane = routes.get(step.name);
        if (!lane) {
          lane = { name: step.name, cards: [], finished: false };
          routes.set(step.name, lane);
        }
        if (step.available !== "0") lane.cards.push({ order, piece, step, finished: false });
      }
      const last = piece.steps[piece.steps.length - 1];
      if (last.completed !== "0") finished.cards.push({ order, piece, step: last, finished: true });
    }
  }
  return [...routes.values(), finished];
}

export function Kanban({ api, accountId, plantId, canReport, initialOrder, openOrder }: {
  api: RequestApi; accountId: string; plantId: string; canReport: boolean; initialOrder: string; openOrder: (id: string) => void;
}) {
  const key = "erp.stage-report." + JSON.stringify([scopeId(accountId), scopeId(plantId)]);
  const [target, select] = useState<WorkTarget | null>(null);
  const [orderId, filterOrder] = useState(initialOrder);
  const [stage, filterStage] = useState("");
  const [pending, setPending] = useState<ReportIntent | null>(() => readPending<ReportIntent>(key));
  function remember(intent: ReportIntent) {
    sessionStorage.setItem(key, encodePending(intent));
    setPending(intent);
  }
  function forget(intent: ReportIntent) {
    // A reply from an old screen may arrive while a new command is pending on this terminal.
    if (JSON.stringify(readPending(key)) === JSON.stringify(intent)) {
      sessionStorage.removeItem(key);
      setPending(null);
    }
  }
  function resume() {
    if (pending) select({ orderId: pending.orderId, pieceIndex: pending.data.pieceIndex, stepIndex: pending.data.stepIndex });
  }
  if (target) return <WorkDetail key={JSON.stringify(target)} api={api} target={target} canReport={canReport}
    back={() => select(null)} openOrder={openOrder} pending={pending} remember={remember} forget={forget} resume={resume} />;
  return <Board api={api} select={select} orderId={orderId} stage={stage} filterStage={filterStage}
    filterOrder={id => { filterOrder(id); filterStage(""); }} resume={canReport && pending ? resume : undefined} />;
}

function Board({ api, select, orderId, stage, filterOrder, filterStage, resume }: {
  api: RequestApi; select: (target: WorkTarget) => void; orderId: string; stage: string;
  filterOrder: (id: string) => void; filterStage: (name: string) => void; resume?: () => void;
}) {
  const read = useRead<Execution[]>(api, "production-orders/kanban");
  const orders = read.value;
  const lanes = Array.isArray(orders) ? lanesFor(orders.filter(order => !orderId || order.orderId === orderId)) : [];
  return <div className="work-board">
    <div className="kanban-title"><div><h1>Kanban de produção</h1>
      <p>Peças disponíveis por etapa de fabricação.</p></div>
      <div className="row">{resume && <button className="order-action" onClick={resume}>Retomar apontamento</button>}
        <button onClick={read.reload}>Atualizar quadro</button></div>
    </div>
    {orders === null ? <p role="status">Carregando quadro…</p> : orders === "error" ? <ReadError retry={read.reload} /> :
      !orders.length ? <p className="order-empty">Nenhuma OS liberada nesta unidade.</p> : <>
        <div className="kanban-tools">
          <label>Filtrar por OS<select value={orderId} onChange={e => filterOrder(e.target.value)}>
            <option value="">Todas as ordens</option>{orders.map(order =>
              <option value={order.orderId} key={order.orderId}>{orderNumber(order.number)} · {order.productName}</option>)}
          </select></label>
          <label>Filtrar por etapa<select value={stage} onChange={e => filterStage(e.target.value)}>
            <option value="">Todas as etapas</option>{lanes.map(lane => <option key={laneKey(lane)} value={laneKey(lane)}>{lane.name}</option>)}
          </select></label>
        </div>
        <div className="kanban-lanes" role="group" aria-label="Etapas do roteiro" tabIndex={0}>
          {lanes.filter(lane => !stage || laneKey(lane) === stage).map((lane, index) =>
            <section key={laneKey(lane)} aria-label={lane.name} className="kanban-lane"
              data-tone={lane.finished ? "done" : index === 0 ? "first" : "next"}>
              <header><h2>{lane.name}</h2><span aria-label={lane.cards.length + " cartões"}>{lane.cards.length}</span></header>
              {lane.cards.map(card => <WorkCard key={card.order.orderId + "/" + card.piece.pieceIndex + "/" + card.step.stepIndex}
                card={card} select={select} />)}
              {!lane.cards.length && <p className="lane-empty">Sem peças nesta etapa</p>}
            </section>)}
        </div>
      </>}
  </div>;
}

function laneKey(lane: Lane) { return lane.finished ? "#finished" : lane.name; }

function WorkCard({ card: { order, piece, step, finished }, select }: { card: Card; select: (target: WorkTarget) => void }) {
  const lane = finished ? finishedLabel : step.name;
  const completed = BigInt(step.completed), total = BigInt(piece.total);
  const percent = Number(completed * 100n / total);
  const quantity = quantityFormat.format(BigInt(finished ? step.completed : step.available));
  return <button className="work-card" onClick={() => select({orderId: order.orderId, pieceIndex: piece.pieceIndex,
      stepIndex: step.stepIndex, finished})} aria-label={[orderNumber(order.number), piece.name, lane].join(" · ")}>
    <span className="order-number">{orderNumber(order.number)}</span><strong>{piece.name}</strong>
    <span className="card-product">{order.productName}</span>
    <span className="card-quantity">{quantity} {finished ? "concluídas" : "disponíveis"}</span>
    <span className="card-progress"><progress aria-label="Progresso desta etapa" max={100} value={percent} /><small>{percent}%</small></span>
  </button>;
}
