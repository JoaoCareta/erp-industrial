import { MaterialPreview } from "./MaterialPreview";
import React, { useEffect, useRef, useState } from "react";
import type { RequestApi, Run } from "../Workspace";
type Props = {
  api: RequestApi;
  run: Run;
  canEdit: boolean;
  canPublish: boolean;
};
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
export function Engineering({ api, run, canEdit, canPublish }: Props) {
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
  const [catalogOpen, openCatalog] = useState(false);
  const [createdProduct, setCreatedProduct] = useState("");
  useEffect(() => { void run(load); }, [api]);
  const reset = () => {
    setValue(blank());
    setId("");
  };
  const catalog = catalogOpen && (
    <section className="catalog-panel">
      <h2>Cadastros</h2>
      <button onClick={() => openCatalog(false)}>Fechar cadastros</button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const saved = await api<Item>(
              "catalog/" + kind + (id ? "/" + id : ""),
              id ? "PUT" : "POST",
              value,
            );
            reset();
            await load();
            if (kind === "product" && !id) {setCreatedProduct(saved.id);openCatalog(false);}
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
        {canEdit && (
          <>
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
                        [k === "unit" ? "unitId" : "categoryId"]:
                          e.target.value,
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
                onChange={(e) =>
                  setValue({ ...value, active: e.target.checked })
                }
              />
            </label>
            <button type="submit">Salvar cadastro</button>
            <button type="button" onClick={reset}>
              Limpar campos
            </button>
          </>
        )}
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
    </section>
  );
  return <><MaterialPreview run={run} catalogs={() => Promise.all([api<Item[]>("catalog/material"), api<Item[]>("catalog/unit")])} />
      <Sheets key={createdProduct} initialProduct={createdProduct} catalog={catalog} onCatalog={k => {setKind(k);reset();filter("");openCatalog(true)}}
        canEdit={canEdit}
        canPublish={canPublish}
        all={all}
        api={api}
        run={run}
      /></>;
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
const firstSheet = (): Sheet => ({pieces:[{partId:"",quantity:1,steps:[]}],materials:[]});
function Sheets({
  all, initialProduct, catalog, onCatalog,
  api,
  run,
  canEdit,
  canPublish,
}: Props & { all: Catalog; initialProduct: string; catalog: React.ReactNode; onCatalog: (kind: Kind) => void }) {
  const [product, setProduct] = useState(initialProduct);
  const [editing, edit] = useState(Boolean(initialProduct));
  const [sheet, setSheet] = useState<Sheet>(() => initialProduct ? firstSheet() : empty());
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
      <h2>Ficha do produto e roteiro</h2>
      <p>Selecione um produto para consultar suas peças, materiais e etapas de fabricação.</p>
      <div className="sheet-toolbar">
      <label>
        Produto pai
        <select
          value={product}
          onChange={(e) => {
            const id = e.target.value;
            setProduct(id);
            edit(false);
            setSheet(empty());
            setDraft(null);
            setView(null);
            setVersions([]);
            if (id)
              void run(async () => {
                const path = "products/" + id + "/versions";
                const list = await api<number[]>(path);
                setVersions(list);
                if (list.length) setView(await api<Snapshot>(path + "/" + Math.max(...list)));
                else { setSheet(firstSheet()); edit(true); }
              });
          }}
        >
          <option value="">Selecione</option>
          {options(all.product)}
        </select>
      </label>
      {canEdit && <button onClick={() => onCatalog("product")}>Novo</button>}
      </div>
      {catalog}
      {product && (
        <>
          <div className="row">
            {versions.map((v) => (
              <button
                key={v}
                onClick={() =>
                  run(async () => {
                    setView(await api<Snapshot>(base + "/versions/" + v));
                    edit(false);
                  })
                }
              >
                Consultar V{v}
              </button>
            ))}
          </div>
          {view && !editing && (
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
              {canEdit && (
                <button
                  onClick={() => {
                    edit(true);
                    setSheet(structuredClone(view.sheet));
                    setDraft(null);
                  }}
                >
                  Editar composição
                </button>
              )}
            </article>
          )}
          {canEdit && editing && (
            <form className="sheet-editor"
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
                    const list = await api<number[]>(base + "/versions");
                    setVersions(list);
                    setView(await api<Snapshot>(base + "/versions/" + Math.max(...list)));
                    edit(false);
                  }
                });
              }}
            >
              <h3>Composição do produto</h3>
              {sheet.pieces.map((p, i) => (
                <fieldset key={i}>
                  <legend>Peça {i + 1}</legend>
                  <label>Tipo de item<select value="part" onChange={()=>setSheet({
                    pieces:sheet.pieces.filter((_,index)=>index!==i),
                    materials:[...sheet.materials,{materialId:"",quantity:1,unitId:""}]
                  })}><option value="part">Peça</option><option value="material">Matéria-prima</option></select></label>
                  <ItemSearch key={p.partId} label="Peça do kit" items={all.part} id={p.partId}
                    choose={partId => change(i,{partId})} create={() => onCatalog("part")} />
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
                  <RouteEditor steps={p.steps} update={steps => change(i,{steps})} />
                  <details><summary>Parâmetros de corte</summary>{(
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
                  ))}</details>
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
              {sheet.materials.map((m, i) => (
                <fieldset key={i}>
                  <legend>Material {i + 1}</legend>
                  <label>Tipo de item<select value="material" onChange={()=>setSheet({
                    materials:sheet.materials.filter((_,index)=>index!==i),
                    pieces:[...sheet.pieces,{partId:"",quantity:1,steps:[]}]
                  })}><option value="part">Peça</option><option value="material">Matéria-prima</option></select></label>
                  <ItemSearch key={m.materialId} label="Matéria-prima do produto" items={all.material} id={m.materialId}
                    choose={id => material(i,{materialId:id,unitId:all.material.find(x=>x.id===id)?.value.unitId || ""})}
                    create={() => onCatalog("material")} />
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
              <button className="add-line"
                type="button" aria-label="Adicionar item" title="Adicionar item"
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
                +
              </button>
              <button type="submit" value="save">Salvar rascunho</button>
              {canPublish && <button type="submit" value="publish">Publicar ficha</button>}
            </form>
          )}
        </>
      )}
    </section>
  );
}
function ItemSearch({label,items,id,choose,create}:{
  label:string; items:Item[]; id:string; choose:(id:string)=>void; create:()=>void;
}){
  const format=(item:Item)=>item.value.code+" · "+item.value.name;
  const selected=items.find(item=>item.id===id);
  const [query,setQuery]=useState(selected ? format(selected) : "");
  const [open,setOpen]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const hits=items.filter(item=>item.value.active && format(item).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,12);
  return <div className="item-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
    <label>{label}<span><input ref={input} required placeholder="Digite o código ou o nome" value={query}
      onFocus={event=>event.target.select()} onChange={event=>{
        const text=event.target.value;
        setQuery(text);setOpen(true);
        event.target.setCustomValidity(selected && text===format(selected) ? "" : "Selecione um item da lista.");
      }}/><span aria-hidden="true" className="search-icon" /></span></label>
    {open && <div className="search-results">{hits.map(item=><button type="button" key={item.id} onClick={()=>{
      input.current!.setCustomValidity("");setQuery(format(item));choose(item.id);setOpen(false);
    }}>{format(item)}</button>)}{!hits.length && <span>Nenhum item encontrado</span>}</div>}
    <button type="button" className="text-action" onClick={create}>Cadastrar {label==="Peça do kit"?"peça":"matéria-prima"}</button>
  </div>;
}
const standardSteps=["corte","lixamento","pintura","montagem"];
function RouteEditor({steps,update}:{steps:string[];update:(steps:string[])=>void}){
  const [choices]=useState(()=>Array.from(new Set([...standardSteps,...steps])));
  const dragged=useRef<number | null>(null);
  function move(from:number,to:number){
    if(to<0 || to>=steps.length || from===to)return;
    const next=[...steps];next.splice(to,0,next.splice(from,1)[0]);update(next);
  }
  return <div className="route-editor"><strong>Etapas da peça</strong>
    <div className="route-choices">{choices.map((step,rank)=><label key={step}><input type="checkbox" checked={steps.includes(step)}
      onChange={event=>{
        if(!event.target.checked){update(steps.filter(s=>s!==step));return}
        const index=steps.findIndex(s=>choices.indexOf(s)>rank);
        const next=[...steps];next.splice(index<0?next.length:index,0,step);update(next);
      }}/>{step}</label>)}</div>
    <strong>Prévia do roteiro</strong><p>Arraste as etapas para alterar a ordem.</p>
    <ul className="route-preview" aria-label="Prévia do roteiro">{steps.map((step,i)=><li key={step}>
      <button type="button" aria-label={step} draggable onDragStart={event=>{dragged.current=i;event.dataTransfer.setData("text/plain",step)}}
        onDragOver={event=>event.preventDefault()} onDrop={event => {
          event.preventDefault();
          if (dragged.current !== null) {
            move(dragged.current, i);
          }
          dragged.current = null;
        }}
        onDragEnd={()=>{dragged.current=null}}
        onKeyDown={event=>{if(["ArrowLeft","ArrowRight"].includes(event.key)){event.preventDefault();move(i,i+(event.key==="ArrowLeft"?-1:1))}}}
        title="Arraste ou use as setas do teclado">{step}</button></li>)}</ul>
  </div>;
}
