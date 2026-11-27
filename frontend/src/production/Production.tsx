import { encodePending, savePending, readPending, scopeId } from "./pending";
import React, { useRef, useState } from "react";
import type { RequestApi } from "../Workspace";
import { ApiError } from "../ApiError";
import { displayQuantity } from "../quantity";
import { useRead } from "../useRead";
import { ReadError, MaterialTotals } from "./WorkDetails";
import { orderNumber, dateFormat, quantityFormat, executionPath, type Execution } from "./execution";
import { FinishedKits } from "./FinishedKits";
import "./production.css";

type Product = { productId: string; code: string; name: string; version: number };
type Create = { productId: string; version: number; quantity: number };
type Intent = { id: string; data: Create; productName: string };
type Order = Create & {
  id: string; number: number; productCode: string; productName: string;
  status: "draft" | "released"; createdAt: string; releasedAt: string | null;
  materials: { materialId: string; name: string; unitCode: string; perKit: string; required: string }[];
  pieces: { name: string; perKit: number; steps: string[] }[];
};
const ordersPath = "production-orders";
const numberOf = (order: Order) => orderNumber(order.number);
const stage = { draft: "Rascunho", released: "Liberada" };

export function Production({ api, accountId, plantId, canCreate, canRelease, canReceive, initialOrder, openBoard }: {
  api: RequestApi; accountId: string; plantId: string; canCreate: boolean; canRelease: boolean;
  canReceive: boolean; initialOrder: string; openBoard: (id: string) => void;
}) {
  const storageKey = "erp.production.create." + JSON.stringify([scopeId(accountId), scopeId(plantId)]);
  const [view, navigate] = useState(initialOrder || "list");
  const back = () => navigate("list");
  if (view === "list") return <OrderList api={api} open={navigate} canCreate={canCreate}
    pending={sessionStorage.getItem(storageKey) !== null} />;
  if (view === "new") return <NewOrder api={api} storageKey={storageKey} back={back} open={navigate} />;
  return <OrderDetail key={view} storageKey={JSON.stringify(["finished", scopeId(accountId), scopeId(plantId), scopeId(view)])} canReceive={canReceive} api={api} id={view} back={back} canRelease={canRelease} openBoard={openBoard} />;
}

function OrderList({ api, open, canCreate, pending }: {
  api: RequestApi; open: (id: string) => void; canCreate: boolean; pending: boolean;
}) {
  const list = useRead<Order[]>(api, ordersPath);
  return <div className="order-index">
    <div className="order-title-row"><h1>Ordens de produção</h1>
      {canCreate && <button className="order-action" type="button" onClick={() => open("new")}>
        {pending ? "Retomar criação da OS" : "Nova OS"}</button>}</div>
    {list.value === "error" ? <ReadError retry={list.reload} /> :
      list.value === null ? <p role="status">Carregando ordens…</p> :
      list.value.length === 0 ? <p className="order-empty">Nenhuma ordem de produção nesta unidade.</p> :
      <ul className="order-list" aria-label="Ordens da unidade">{list.value.map(order => <li key={order.id}>
        <button type="button" onClick={() => open(order.id)}>
          <span className="order-number">{numberOf(order)}</span><strong>{order.productName}</strong>
          <span>{quantityFormat.format(order.quantity)} kits</span>
          <span className="order-badge" data-status={order.status}>{stage[order.status]}</span>
        </button></li>)}</ul>}
  </div>;
}

function Back({ back, disabled = false }: { back: () => void; disabled?: boolean }) {
  return <button type="button" className="order-back" onClick={back} disabled={disabled} aria-label="Voltar para ordens">
    <span aria-hidden="true">‹</span> Ordens de produção</button>;
}

function NewOrder({ api, storageKey, back, open }: {
  api: RequestApi; storageKey: string; back: () => void; open: (id: string) => void;
}) {
  const [pending, setPending] = useState<Intent | null>(() => readPending<Intent>(storageKey));
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, notify] = useState("");
  async function send(intent: Intent) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    notify("");
    const encoded = encodePending(intent);
    // A lost response must keep the original order ID and payload across navigation and reload.
    savePending(storageKey, encoded);
    setPending(intent);
    const forget = () => {
      if (sessionStorage.getItem(storageKey) === encoded) sessionStorage.removeItem(storageKey);
    };
    try {
      const order = await api<Order>(ordersPath + "/" + intent.id, "PUT", intent.data);
      forget();
      open(order.id);
    } catch (reason) {
      if (reason instanceof ApiError && [400, 404, 409, 422].includes(reason.status)) {
        forget();
        setPending(null);
        notify("A OS foi recusada. Confira a ficha publicada e a quantidade de kits.");
      } else {
        notify("Não foi possível confirmar a criação. Reenvie a mesma OS para consultar o resultado.");
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return <div className="order-new">
    <Back back={back} disabled={busy} /><h1>Nova ordem de produção</h1>
    {error && <p role="alert">{error}</p>}
    {pending ? <section className="order-stage" aria-label="Criação pendente">
      <h2>{pending.productName}</h2><p>Ficha técnica v{pending.data.version} · {quantityFormat.format(pending.data.quantity)} kits</p>
      <button className="order-action" type="button" disabled={busy} onClick={() => void send(pending)}>
        {busy ? "Criando OS…" : "Reenviar criação"}</button>
    </section> : <CreateForm api={api} save={(data, productName) => void send({ id: crypto.randomUUID(), data, productName })} />}
  </div>;
}

function CreateForm({ api, save }: { api: RequestApi; save: (data: Create, productName: string) => void }) {
  const catalog = useRead<Product[]>(api, ordersPath + "/products");
  const [productId, selectProduct] = useState("");
  const [version, selectVersion] = useState("");
  const [quantity, setQuantity] = useState("");
  if (catalog.value === "error") return <ReadError retry={catalog.reload} />;
  if (!catalog.value) return <p role="status">Carregando fichas publicadas…</p>;
  if (!catalog.value.length) return <p className="order-empty">Nenhuma ficha publicada nesta unidade. Publique uma ficha na Engenharia para criar uma OS.</p>;
  const published = catalog.value;
  // The product selector shows the most recent published name; the command retains the chosen revision.
  const byVersion = [...published].sort((a, b) => a.version - b.version);
  const products = new Map(byVersion.map(p => [p.productId, p]));
  const revisions = byVersion.filter(p => p.productId === productId).reverse();
  return <section className="order-stage"><h2>Dados da ordem</h2>
    <form className="order-form" onSubmit={e => {
      e.preventDefault();
      const selected = revisions.find(p => p.version === Number(version))!;
      save({ productId, version: selected.version, quantity: Number(quantity) }, selected.name);
    }}>
      <label>Produto<select required value={productId} onChange={e => {
        selectProduct(e.target.value);
        selectVersion("");
      }}>
        <option value="">Escolha um produto</option>
        {[...products.values()].map(p => <option key={p.productId} value={p.productId}>{p.code} · {p.name}</option>)}
      </select></label>
      <label>Versão da ficha<select required value={version} disabled={!productId} onChange={e => selectVersion(e.target.value)}>
        <option value="">Escolha uma versão</option>
        {revisions.map(p => <option key={p.version} value={p.version}>Ficha técnica v{p.version}</option>)}
      </select></label>
      <label>Quantidade de kits<input type="number" inputMode="numeric" min="1" max="2147483647" step="1"
        required value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
      <button type="submit" disabled={!version}>Criar OS</button>
    </form>
  </section>;
}

function OrderDetail({ api, id, back, canRelease, canReceive, storageKey, openBoard }: {
  api: RequestApi; id: string; back: () => void; canRelease: boolean; canReceive: boolean; storageKey: string; openBoard: (id: string) => void;
}) {
  const path = ordersPath + "/" + encodeURIComponent(id);
  const result = useRead<Order>(api, path);
  const releasedOrder = result.value && result.value !== "error" && result.value.status === "released";
  const progress = useRead<Execution>(api, releasedOrder ? executionPath(id) : null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, notify] = useState("");
  async function release() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    notify("");
    try {
      result.setValue(await api<Order>(path + "/release", "PUT"));
      setConfirm(false);
    } catch (reason) {
      notify(reason instanceof ApiError && reason.status === 409
        ? "A reserva foi recusada. Confira o saldo disponível dos materiais no Estoque."
        : "Não foi possível confirmar a liberação. Tente novamente para conferir o resultado.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const order = result.value;
  if (!order || order === "error") return <><Back back={back} />
    {order === "error" ? <ReadError retry={result.reload} /> : <p role="status">Carregando ordem…</p>}</>;
  const released = order.status === "released";
  const hasMaterials = order.materials.length > 0;
  const started = progress.value && progress.value !== "error" && progress.value.reports.length > 0;
  return <div className="order-detail">
    <Back back={back} />
    <div className="order-summary">
      <div><div className="order-heading"><h1>{order.productName}</h1>
        <span className="order-badge" aria-live="polite" data-status={order.status}>{stage[order.status]}</span></div>
        <div className="order-subtitle"><strong className="order-number">{numberOf(order)}</strong>
          <span>{order.productCode}</span><span>Ficha técnica v{order.version}</span></div></div>
      <div className="order-lot"><span className="order-label">Lote de produção</span>
        <strong>{quantityFormat.format(order.quantity)} kits</strong></div>
    </div>
    <div className="order-columns">
      <section key={"stage-" + order.status} className="order-stage" aria-label="Liberação da ordem">
        <span className="order-label">{started ? "Execução da ordem" : "Liberação da ordem"}</span>
        <h2>{started ? "Em andamento" : released ? (hasMaterials ? "Reserva confirmada" : "OS liberada") : "Aguardando liberação"}</h2>
        <p>{!hasMaterials ? "A liberação desta OS mantém os saldos de estoque." :
          released ? "Acompanhe os saldos de material e as etapas das peças desta OS." :
          "A liberação reserva os materiais da ficha para este lote e mantém o saldo físico."}</p>
        {released && <button type="button" className="order-action" onClick={() => openBoard(id)}>Acompanhar etapas</button>}
        {canRelease && !released && (confirm ?
          <div className="order-confirm" role="group" aria-label="Confirmar reserva dos materiais">
            <p>{hasMaterials ? "Confirmar a reserva" : "Confirmar a liberação"} para {quantityFormat.format(order.quantity)} kits?</p>
            {error && <p role="alert">{error}</p>}
            <div className="row"><button type="button" className="order-action" autoFocus disabled={busy}
              onClick={() => void release()}>{busy ? "Liberando…" : "Confirmar liberação"}</button>
              <button type="button" disabled={busy} onClick={() => { setConfirm(false); notify(""); }}>Cancelar</button></div>
          </div> : <button type="button" className="order-action" onClick={() => setConfirm(true)}>Liberar OS</button>)}
        <dl className="order-log" aria-label="Histórico da OS">
          <div><dt>Criação</dt><dd><time dateTime={order.createdAt}>{dateFormat.format(new Date(order.createdAt))}</time></dd></div>
          {order.releasedAt && <div><dt>Liberação</dt><dd><time dateTime={order.releasedAt}>{dateFormat.format(new Date(order.releasedAt))}</time></dd></div>}
        </dl>
      </section>
      <section key={"materials-" + order.status} aria-label="Materiais da ordem" className="order-materials">
        <h2 className="order-label">Materiais da ordem</h2>
        {!hasMaterials && <p>Esta ficha não exige reserva de material.</p>}
        {released && hasMaterials ? progress.value === "error" ? <ReadError retry={progress.reload} /> :
          !progress.value ? <p role="status">Consultando reservas…</p> :
          progress.value.materials.map(m => <MaterialTotals key={m.materialId} material={m}
            perKit={order.materials.find(line => line.materialId === m.materialId)!.perKit} />) :
          order.materials.map(m => <div className="order-material" key={m.materialId}><h3>{m.name}</h3>
          <dl><div><dt>Por kit</dt><dd>{displayQuantity(m.perKit, m.unitCode)}</dd></div>
            <div><dt>Necessário para a OS</dt>
              <dd>{displayQuantity(m.required, m.unitCode)}</dd></div></dl></div>)}
      </section>
      {released && <FinishedKits api={api} path={path} canReceive={canReceive} storageKey={storageKey} />}
      <section className="order-pieces" aria-label="Peças e roteiro"><h2>Peças e roteiro</h2>
        <ul>{order.pieces.map((piece, index) => <li key={index}>
          <strong>{piece.name}</strong><span>{quantityFormat.format(piece.perKit)} por kit
            <small>{quantityFormat.format(BigInt(piece.perKit) * BigInt(order.quantity))} no lote</small></span>
          <ol aria-label={"Roteiro de " + piece.name}>{piece.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
        </li>)}</ul>
      </section>
    </div>
  </div>;
}
