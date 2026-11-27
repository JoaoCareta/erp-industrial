import React, { useCallback, useEffect, useState } from "react";
import { Engineering } from "./engineering/Engineering";
import { Stock } from "./stock/Stock";
import { Production } from "./production/Production";
import { Kanban } from "./production/Kanban";
import { OperationalAccess } from "./OperationalAccess";
import { Dashboard } from "./dashboard/Dashboard";
import { Costs } from "./costs/Costs";
import { Planning } from "./planning/Planning";
import { Outsourcing } from "./outsourcing/Outsourcing";
import { Purchasing } from "./purchasing/Purchasing";
import { Sales } from "./sales/Sales";
import { scoped } from "./EntryForm";
import { ApiError } from "./ApiError";

export type RequestApi = <T>(
  path: string,
  method?: string,
  data?: unknown,
) => Promise<T>;
export type Run = (action: () => Promise<void>) => Promise<void>;
type Sector = { id: string; name: string };
type Plant = Sector & {
  groupName: string;
  actions: string[];
  sectors: Sector[];
};
type Context = { accountId: string; units: Plant[] };

export function Workspace({
  token,
  logout,
}: {
  token: () => Promise<string>;
  logout: () => void;
}) {
  const [context, setContext] = useState<Context | null>(null);
  const [selected, select] = useState("");
  const [generation, reload] = useState(0);
  const [message, notify] = useState("");
  const request: RequestApi = useCallback(
    async (path, method = "GET", data?: unknown) => {
      let credential: string;
      try {
        credential = await token();
      } catch {
        setContext(null);
        notify("Entre novamente");
        throw Error("Entre novamente");
      }
      const response = await fetch("/api/" + path, {
        method,
        cache: "no-store",
        headers: {
          Authorization: "Bearer " + credential,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setContext(null);
          notify("Acesso negado");
          if (path !== "me/context") reload((n) => n + 1);
          throw Error("Acesso negado");
        }
        throw new ApiError(response.status);
      }
      const body = await response.text();
      return body ? JSON.parse(body) : undefined;
    },
    [token],
  );
  useEffect(() => {
    let active = true;
    request<Context>("me/context")
      .then((c) => {
        if (!active) return;
        const key = "erp.plant." + c.accountId;
        const last = localStorage.getItem(key);
        const current =
          c.units.length === 1
            ? c.units[0]
            : c.units.find((p) => p.id === last);
        select(current?.id ?? "");
        if (!current) localStorage.removeItem(key);
        setContext(c);
        notify("");
      })
      .catch((e: Error) => {
        if (active) notify(e.message);
      });
    return () => {
      active = false;
    };
  }, [request, generation]);
  const plant = context?.units.find((p) => p.id === selected);
  function choose(id: string) {
    select(id);
    localStorage.setItem("erp.plant." + context!.accountId, id);
  }
  const unitPicker = context && context.units.length > 1 && (
    <label className="unit-picker">
      Trocar unidade
      <select value={selected} onChange={(e) => choose(e.target.value)}>
        <option value="" disabled>Escolha uma unidade</option>
        {context.units.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
  const controls = (
    <div className="station-controls">
      <div className="station-context">
        {context && context.units.length > 0 && <span>Grupo: {context.units[0].groupName}</span>}
        {plant && !unitPicker && <span>Unidade: {plant.name}</span>}
      </div>
      {plant && unitPicker}
      <button type="button" onClick={logout}>Sair</button>
    </div>
  );
  if (plant) {
    return <PlantWorkspace key={plant.id} plant={plant} request={request} controls={controls} accountId={context!.accountId} />;
  }
  return <>
    <StationHeader controls={controls} />
    <main className="workspace-content">
      <h1 key={message || (context ? "ready" : "loading")} className="workspace-status">
        {message || (!context ? "Carregando…" :
          context.units.length ? "Escolha uma unidade" : "Nenhuma unidade liberada")}
      </h1>
      {unitPicker}
      {context?.units.length === 0 && <p>Fale com o administrador para solicitar acesso.</p>}
    </main>
  </>;
}

function StationHeader({ controls, children }: { controls: React.ReactNode; children?: React.ReactNode }) {
  return <header className="station-header">
    <div className="station-bar">
      <div className="station-brand"><strong>ERP Fábrica</strong><span>Estação de turno</span></div>
      {children}
      {controls}
    </div>
  </header>;
}

function PlantWorkspace({
  plant,
  request,
  controls,
  accountId,
}: {
  plant: Plant;
  request: RequestApi;
  controls: React.ReactNode;
  accountId: string;
}) {
  const pages = [
    "Equipe",
    ...(plant.actions.includes("access.operations") ? ["Permissões"] : []),
    ...(plant.actions.includes("dashboard.read") ? ["Painel do turno"] : []),
    ...(plant.actions.includes("costs.read") ? ["Custos e preços"] : []),
    ...(plant.actions.includes("planning.read") ? ["Planejamento"] : []),
    ...(plant.actions.includes("outsourcing.read") ? ["Terceiros"] : []),
    ...(plant.actions.includes("purchases.read") ? ["Compras"] : []),
    ...(plant.actions.includes("sales.read") ? ["Vendas"] : []),
    ...(plant.actions.includes("engineering.read") ? ["Engenharia"] : []),
    ...(plant.actions.includes("stock.read") ? ["Estoque"] : []),
    ...(plant.actions.includes("production.read") ? ["Kanban", "Ordens de produção"] : []),
  ];
  const [page, setPage] = useState("Equipe");
  const [orderTarget, setOrderTarget] = useState("");
  function show(name: string, orderId = "") {
    setOrderTarget(orderId);
    setPage(name);
  }
  const api: RequestApi = useCallback(
    (path, method, data) =>
      request(
        "units/" + encodeURIComponent(plant.id) + "/" + path,
        method,
        data,
      ),
    [plant.id, request],
  );
  return (
    <>
      <StationHeader controls={controls}>
        {pages.length > 1 && (
          <nav className="station-nav" aria-label="Menu principal">
            {pages.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-current={name === page ? "page" : undefined}
                onClick={() => show(name)}
              >
                {name === "Ordens de produção" ? <><span className="nav-order-long">{name}</span><span className="nav-order-short">Ordens</span></> : name}
              </button>
            ))}
          </nav>
        )}
      </StationHeader>
      <main className="workspace-content" key={page}>
        {page !== "Ordens de produção" && page !== "Kanban" && <h1>{page}</h1>}
        {page === "Equipe" ? (
          <section aria-label="Consulta de equipe"><Team sectors={plant.sectors} api={api} /></section>
        ) : page === "Permissões" ? (
          <OperationalAccess api={api} scope={scoped(accountId,plant.id)}/>
        ) : page === "Painel do turno" ? (
          <Dashboard api={api} actions={plant.actions} open={show}/>
        ) : page === "Custos e preços" ? (
          <Costs api={api}/>
        ) : page === "Planejamento" ? (
          <Planning api={api} scope={scoped(accountId,plant.id)} canWrite={plant.actions.includes("planning.write")} canStock={plant.actions.includes("stock.read")} />
        ) : page === "Terceiros" ? (
          <Outsourcing api={api} scope={scoped(accountId,plant.id)} canWrite={plant.actions.includes("outsourcing.write")} />
        ) : page === "Compras" ? (
          <Purchasing api={api} scope={scoped(accountId,plant.id)} canWrite={plant.actions.includes("purchases.write")} />
        ) : page === "Vendas" ? (
          <Sales api={api} scope={scoped(accountId,plant.id)} canSell={plant.actions.includes("sales.write")} canOpen={plant.actions.includes("stock.write")} />
        ) : page === "Estoque" ? (
          <Stock api={api} canWrite={plant.actions.includes("stock.write")} accountId={accountId} plantId={plant.id} />
        ) : page === "Ordens de produção" ? (
          <Production api={api} accountId={accountId} plantId={plant.id}
            initialOrder={orderTarget} openBoard={id => show("Kanban", id)}
            canCorrect={plant.actions.includes("production.correct")} canClose={plant.actions.includes("production.close")}
            canCreate={plant.actions.includes("production.create")}
            canReceive={plant.actions.includes("production.receive")} canRelease={plant.actions.includes("production.release")} />
        ) : page === "Kanban" ? (
          <Kanban api={api} accountId={accountId} plantId={plant.id} initialOrder={orderTarget}
            canReport={plant.actions.includes("production.report")} openOrder={id => show("Ordens de produção", id)} />
        ) : (
          <EngineeringPage api={api} plant={plant} />
        )}
      </main>
    </>
  );
}
function EngineeringPage({ api, plant }: { api: RequestApi; plant: Plant }) {
  const [notice, setNotice] = useState("");
  const run: Run = async action => {
    setNotice("Carregando…");
    try {
      await action();
      setNotice("");
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  return <>
    <p role="status">{notice && <span key={notice}>{notice}</span>}</p>
    <fieldset className="engineering-workspace" disabled={notice === "Carregando…"}>
      <Engineering api={api} run={run} canEdit={plant.actions.includes("engineering.edit")}
        canPublish={plant.actions.includes("engineering.publish")} />
    </fieldset>
  </>;
}
type TeamMember = { id: string; name: string; role: string | null };

function initials(fullName: string): string {
  return (fullName.normalize("NFC").match(/\p{L}[\p{L}\p{M}’'-]*/gu) ?? [])
    .filter((word, index) => index === 0 || !/^(da|das|de|do|dos|e)$/i.test(word))
    .slice(0, 2)
    .map(word => Array.from(word)[0].toLocaleUpperCase("pt-BR"))
    .join("");
}

function Team({ sectors, api }: { sectors: Sector[]; api: RequestApi }) {
  const [id, select] = useState(sectors.length === 1 ? sectors[0].id : "");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const onFocus = () => setRefresh((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const [result, setResult] = useState<{
    id: string; refresh: number; members: TeamMember[] | null;
  } | null>(null);
  useEffect(() => {
    if (!id) return;
    let active = true;
    api<TeamMember[]>("sectors/" + encodeURIComponent(id) + "/team").then(
      members => { if (active) setResult({ id, refresh, members }); },
      () => { if (active) setResult({ id, refresh, members: null }); },
    );
    return () => { active = false; };
  }, [id, api, refresh]);
  const current = result?.id === id && result.refresh === refresh ? result : null;
  const members = current?.members ?? [];
  return (
    <>
      <div className="team-query">
      {sectors.length > 1 ? (
        <label>
          Setor
          <select value={id} onChange={(e) => select(e.target.value)}>
            <option value="" disabled>
              Escolha um setor
            </option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <h2>
          {sectors.length
            ? "Equipe de " + sectors[0].name
            : "Nenhum setor liberado para consulta"}
        </h2>
      )}
      </div>
      {id && !current && <p role="status" className="team-loading">Carregando equipe…</p>}
      {current?.members?.length === 0 && <p role="status">Equipe vazia</p>}
      {current?.members === null && <div role="alert" className="team-error">
        <p>Não foi possível carregar a equipe.</p>
        <button onClick={() => setRefresh(n => n + 1)}>Tentar novamente</button>
      </div>}
      {members.length > 0 && <>
        <p className="team-count">{members.length} {members.length === 1 ? "pessoa" : "pessoas"}</p>
        <ul className="team-roster" aria-label="Pessoas da equipe">
          {members.map(member => (
            <li key={member.id}>
              <span className="team-initials" aria-hidden="true">{initials(member.name)}</span>
              <div><strong>{member.name}</strong>
                <span className="team-role">{member.role ?? "Função não informada"}</span>
              </div>
            </li>
          ))}
        </ul>
      </>}
    </>
  );
}
