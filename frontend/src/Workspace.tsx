import React, { useState } from "react";
import { Engineering } from "./engineering/Engineering";

export type RequestApi = <T>(
  path: string,
  method?: string,
  data?: unknown,
) => Promise<T>;
export function Workspace({
  token,
  logout,
}: {
  token: () => Promise<string>;
  logout: () => void;
}) {
  const [page, setPage] = useState("Equipe");
  const [notice, setNotice] = useState("");
  const [epoch, clear] = useState(0);
  const request: RequestApi = async (path, method = "GET", data) => {
    let credential: string;
    try {
      credential = await token();
    } catch {
      clear((n) => n + 1);
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
      if ([401, 403].includes(response.status)) clear((n) => n + 1);
      const message = (await response.json().catch(() => ({}))).error;
      throw Error(
        response.status === 403
          ? "Acesso negado"
          : message || "Operação indisponível",
      );
    }
    const body = await response.text();
    return body ? JSON.parse(body) : undefined;
  };
  const run = async (action: () => Promise<void>) => {
    setNotice("Carregando…");
    try {
      await action();
      setNotice("");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  return (
    <>
      <header>
        <strong>ERP Industrial</strong>
        <nav>
          {["Equipe", "Engenharia", "Acessos"].map((p) => (
            <button
              key={p}
              aria-current={page === p ? "page" : undefined}
              onClick={() => {
                setPage(p);
                setNotice("");
              }}
            >
              {p}
            </button>
          ))}
        </nav>
        <button onClick={logout}>Sair</button>
      </header>
      <main>
        <h1>{page}</h1>
        <p role="status">{notice}</p>
        <fieldset disabled={notice === "Carregando…"} key={epoch}>
          {page === "Engenharia" ? (
            <Engineering api={request} run={run} />
          ) : (
            <AccessPanel
              key={page}
              team={page === "Equipe"}
              api={request}
              run={run}
            />
          )}
        </fieldset>
      </main>
    </>
  );
}

export type Run = (action: () => Promise<void>) => Promise<void>;
function AccessPanel({
  team,
  api,
  run,
}: {
  team: boolean;
  api: RequestApi;
  run: Run;
}) {
  const [target, setTarget] = useState(team ? "corte" : "");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string[] | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setResult(null);
        void run(async () => {
          if (team)
            setResult(
              (
                await api<{ name: string }[]>(
                  "sectors/" + encodeURIComponent(target) + "/team",
                )
              ).map((m) => m.name),
            );
          else {
            await api(
              "accounts/" + encodeURIComponent(target) + "/suspension",
              "POST",
              { reason },
            );
            setResult(["Conta suspensa"]);
          }
        });
      }}
    >
      <label>
        {team ? "Setor" : "Identificador da conta"}
        <input
          required
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setResult(null);
          }}
        />
      </label>
      {!team && (
        <label>
          Motivo
          <input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      )}
      <button>{team ? "Consultar equipe" : "Suspender conta"}</button>
      {result && (
        <ul>
          {(result.length ? result : ["Equipe vazia"]).map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
