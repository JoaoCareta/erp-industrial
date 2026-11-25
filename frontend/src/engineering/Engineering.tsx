import React, { useState } from "react";
import type { RequestApi, Run } from "../Workspace";
type Props = { api: RequestApi; run: Run };
const labels = {
  category: "Categoria",
  unit: "Unidade",
  material: "Matéria-prima",
  product: "Produto",
  part: "Peça",
};
type Kind = keyof typeof labels;
type Value = {
  code: string;
  name: string;
  active: boolean;
  dimension: string;
  categoryId?: string;
  unitId?: string;
};
type Item = { id: string; kind: Kind; value: Value };
const blank = (): Value => ({
  code: "",
  name: "",
  active: true,
  dimension: "",
});
const kinds = Object.keys(labels) as Kind[];
type Catalog = Record<Kind, Item[]>;
const options = (items: Item[]) =>
  items
    .filter((i) => i.value.active)
    .map((i) => (
      <option key={i.id} value={i.id}>
        {i.value.name}
      </option>
    ));
export function Engineering({ api, run }: Props) {
  const [all, setAll] = useState<Catalog>({
    category: [],
    unit: [],
    material: [],
    product: [],
    part: [],
  });
  const [kind, setKind] = useState<Kind>("category");
  const [value, setValue] = useState<Value>(blank);
  const [id, setId] = useState("");
  const [query, filter] = useState("");
  const load = async () => {
    const lists = await Promise.all(
      kinds.map((k) => api<Item[]>("catalog/" + k)),
    );
    setAll(Object.fromEntries(kinds.map((k, i) => [k, lists[i]])) as Catalog);
  };
  const reset = () => {
    setValue(blank());
    setId("");
  };
  return (
    <>
      <h2>Cadastros</h2>
      <button onClick={() => run(load)}>Carregar cadastros</button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api(
              "catalog/" + kind + (id ? "/" + id : ""),
              id ? "PUT" : "POST",
              value,
            );
            reset();
            await load();
          });
        }}
      >
        <label>
          Tipo
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              reset();
            }}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {labels[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Código
          <input
            required
            value={value.code}
            onChange={(e) => setValue({ ...value, code: e.target.value })}
          />
        </label>
        <label>
          Descrição
          <input
            required
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </label>
        {kind === "unit" && (
          <label>
            Dimensão
            <input
              required
              value={value.dimension}
              onChange={(e) =>
                setValue({ ...value, dimension: e.target.value })
              }
            />
          </label>
        )}
        {kind === "material" &&
          (["category", "unit"] as const).map((k) => (
            <label key={k}>
              {labels[k]} de referência
              <select
                required
                value={value[k === "unit" ? "unitId" : "categoryId"] || ""}
                onChange={(e) =>
                  setValue({
                    ...value,
                    [k === "unit" ? "unitId" : "categoryId"]: e.target.value,
                  })
                }
              >
                <option value="">Selecione</option>
                {options(all[k])}
              </select>
            </label>
          ))}
        <label>
          Ativo
          <input
            type="checkbox"
            checked={value.active}
            onChange={(e) => setValue({ ...value, active: e.target.checked })}
          />
        </label>
        <button>Salvar cadastro</button>
        <button type="button" onClick={reset}>
          Novo
        </button>
      </form>
      <label>
        Pesquisar
        <input value={query} onChange={(e) => filter(e.target.value)} />
      </label>
      <ul>
        {all[kind]
          .filter((i) =>
            (i.value.code + " " + i.value.name)
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()),
          )
          .map((i) => (
            <li key={i.id}>
              <button
                onClick={() => {
                  setId(i.id);
                  setValue(i.value);
                }}
              >
                {i.value.code} · {i.value.name}
              </button>
            </li>
          ))}
      </ul>
      <Sheets all={all} api={api} run={run} />
    </>
  );
}
type Piece = {
  partId: string;
  quantity: number;
  steps: string[];
  thicknessMm?: number;
  piecesPerPlate?: number;
  piecesPerCut?: number;
  minutesPerCut?: number;
};
type Material = { materialId: string; quantity: number; unitId: string };
type Sheet = { pieces: Piece[]; materials: Material[] };
type Snapshot = {
  version: number;
  sheet: Sheet;
  parts: Item[];
  materials: { material: Item; unit: Item }[];
  product: Item;
};
const empty = (): Sheet => ({ pieces: [], materials: [] });
function Sheets({ all, api, run }: Props & { all: Catalog }) {
  const [product, setProduct] = useState("");
  const [sheet, setSheet] = useState<Sheet>(empty);
  const [draft, setDraft] = useState<{
    id: string;
    revision: number;
    saved: Sheet;
  } | null>(null);
  const [versions, setVersions] = useState<number[]>([]);
  const [view, setView] = useState<Snapshot | null>(null);
  const base = "products/" + product;
  const change = (i: number, update: Partial<Piece>) =>
    setSheet({
      ...sheet,
      pieces: sheet.pieces.map((p, j) => (i === j ? { ...p, ...update } : p)),
    });
  const material = (i: number, update: Partial<Material>) =>
    setSheet({
      ...sheet,
      materials: sheet.materials.map((p, j) =>
        i === j ? { ...p, ...update } : p,
      ),
    });
  const persist = async () => {
    if (draft?.saved === sheet) return draft;
    const next = await api<{ id: string; revision: number }>(
      base + "/drafts" + (draft ? "/" + draft.id : ""),
      draft ? "PUT" : "POST",
      draft ? { revision: draft.revision, sheet } : sheet,
    );
    setDraft({ ...next, saved: sheet });
    return next;
  };
  return (
    <section>
      <h2>Ficha e roteiro</h2>
      <label>
        Produto pai
        <select
          value={product}
          onChange={(e) => {
            const id = e.target.value;
            setProduct(id);
            setSheet(empty());
            setDraft(null);
            setView(null);
            setVersions([]);
            if (id)
              void run(async () =>
                setVersions(
                  await api<number[]>("products/" + id + "/versions"),
                ),
              );
          }}
        >
          <option value="">Selecione</option>
          {options(all.product)}
        </select>
      </label>
      {product && (
        <>
          <div className="row">
            {versions.map((v) => (
              <button
                key={v}
                onClick={() =>
                  run(async () =>
                    setView(await api<Snapshot>(base + "/versions/" + v)),
                  )
                }
              >
                Consultar V{v}
              </button>
            ))}
          </div>
          {view && (
            <article>
              <h3>
                {view.product.value.name} · V{view.version}
              </h3>
              <ul>
                {view.sheet.pieces.map((p, i) => (
                  <li key={p.partId}>
                    {view.parts[i].value.name} · {p.quantity} por kit ·{" "}
                    {p.steps.join(" → ")}
                  </li>
                ))}
                {view.sheet.materials.map((m, i) => (
                  <li key={i}>
                    {view.materials[i].material.value.name} · {m.quantity}{" "}
                    {view.materials[i].unit.value.code}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  setSheet(structuredClone(view.sheet));
                  setDraft(null);
                }}
              >
                Copiar para rascunho
              </button>
            </article>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const publish =
                (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                  "value",
                ) === "publish";
              void run(async () => {
                const next = await persist();
                if (publish) {
                  await api(
                    base + "/drafts/" + next.id + "/publication",
                    "POST",
                    { revision: next.revision },
                  );
                  setDraft(null);
                  setSheet(empty());
                  setVersions(await api<number[]>(base + "/versions"));
                }
              });
            }}
          >
            {sheet.pieces.map((p, i) => (
              <fieldset key={i}>
                <legend>Peça {i + 1}</legend>
                <label>
                  Peça do kit
                  <select
                    required
                    value={p.partId}
                    onChange={(e) => change(i, { partId: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    {options(all.part)}
                  </select>
                </label>
                <label>
                  Quantidade por kit
                  <input
                    type="number"
                    min="1"
                    required
                    value={p.quantity}
                    onChange={(e) =>
                      change(i, { quantity: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Etapas em ordem (separadas por vírgula)
                  <input
                    required
                    value={p.steps.join(",")}
                    onChange={(e) =>
                      change(i, {
                        steps: e.target.value
                          .split(",")
                          .map((s) => s.trimStart()),
                      })
                    }
                  />
                </label>
                {(
                  [
                    ["thicknessMm", "Espessura (mm)"],
                    ["piecesPerPlate", "Peças por placa"],
                    ["piecesPerCut", "Peças por corte"],
                    ["minutesPerCut", "Minutos por corte"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min="0"
                      step={key.startsWith("pieces") ? "1" : "any"}
                      value={p[key] ?? ""}
                      onChange={(e) =>
                        change(i, {
                          [key]: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setSheet({
                      ...sheet,
                      pieces: sheet.pieces.filter((_, j) => j !== i),
                    })
                  }
                >
                  Remover peça
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                setSheet({
                  ...sheet,
                  pieces: [
                    ...sheet.pieces,
                    { partId: "", quantity: 1, steps: [] },
                  ],
                })
              }
            >
              Adicionar peça
            </button>
            {sheet.materials.map((m, i) => (
              <fieldset key={i}>
                <legend>Material {i + 1}</legend>
                <label>
                  Matéria-prima do produto
                  <select
                    required
                    value={m.materialId}
                    onChange={(e) => {
                      const item = all.material.find(
                        (p) => p.id === e.target.value,
                      );
                      material(i, {
                        materialId: e.target.value,
                        unitId: item?.value.unitId || "",
                      });
                    }}
                  >
                    <option value="">Selecione</option>
                    {options(all.material)}
                  </select>
                </label>
                <label>
                  Quantidade por produto
                  <input
                    type="number"
                    required
                    step="any"
                    min="0"
                    value={m.quantity}
                    onChange={(e) =>
                      material(i, { quantity: Number(e.target.value) })
                    }
                  />
                </label>
                <span>
                  {all.unit.find((u) => u.id === m.unitId)?.value.code}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSheet({
                      ...sheet,
                      materials: sheet.materials.filter((_, j) => i !== j),
                    })
                  }
                >
                  Remover material
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                setSheet({
                  ...sheet,
                  materials: [
                    ...sheet.materials,
                    { materialId: "", unitId: "", quantity: 1 },
                  ],
                })
              }
            >
              Adicionar material
            </button>
            <button value="save">Salvar rascunho</button>
            <button value="publish">Publicar ficha</button>
          </form>
        </>
      )}
    </section>
  );
}
