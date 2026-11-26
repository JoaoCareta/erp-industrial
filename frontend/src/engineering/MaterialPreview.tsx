import React, { useState } from "react";
import type { Run } from "../Workspace";

type Reference = { id: string; value: { code: string; name: string; active: boolean; unitId?: string } };
type RecordLine = { line: number; fields: string[] };
type Result = RecordLine & { result: string };

/** Preserva a linha física inicial de cada registro, inclusive em descrições entre aspas. */
function parseCsv(text: string): RecordLine[] {
  const records: RecordLine[] = [];
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  let line = 1;
  let start = 1;
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i <= input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === undefined) throw Error("Campo entre aspas incompleto na linha " + start);
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        field += char;
        if (char === "\n") line++;
      }
    } else if (char === "," || char === "\n" || char === undefined) {
      fields.push(field.trim());
      field = "";
      closed = false;
      if (char !== ",") {
        if (fields.length > 1 || fields[0]) records.push({ line: start, fields });
        fields = [];
        start = ++line;
      }
    } else if (char === '"' && !field && !closed) {
      quoted = true;
    } else {
      if (closed || char === '"') throw Error("Aspas inválidas na linha " + line);
      field += char;
    }
  }
  return records;
}

export function compareFile(text: string, materials: Reference[], units: Reference[]): Result[] {
  const [header, ...rows] = parseCsv(text);
  if (header?.fields.join(",") !== "código,descrição,unidade" || header.fields.length !== 3) {
    throw Error("Use o cabeçalho código,descrição,unidade");
  }
  const occurrences = new Map<string, number[]>();
  for (const { fields, line } of rows) {
    if (fields.length !== 3) throw Error("Esperadas três colunas na linha " + line);
    const code = fields[0];
    const lines = occurrences.get(code) ?? [];
    lines.push(line);
    occurrences.set(code, lines);
  }
  const materialByCode = new Map(materials.map(m => [m.value.code, m]));
  const unitByCode = new Map(units.map(u => [u.value.code, u]));
  function classify([code, name, symbol]: string[]) {
    if (!code) return materials.filter(m => m.value.name === name).length > 1
      ? "Descrição ambígua. Informe o código" : "Informe o código";
    const lines = occurrences.get(code)!;
    if (lines.length > 1) return "Código repetido nas linhas " + lines.join(", ");
    if (!name) return "Informe a descrição";
    if (!symbol) return "Informe a unidade";
    const unit = unitByCode.get(symbol);
    if (!unit) return "Unidade desconhecida";
    if (!unit.value.active) return "Unidade inativa";
    const material = materialByCode.get(code);
    if (!material) return "Material novo";
    if (!material.value.active) return "Material inativo";
    if (material.value.unitId !== unit.id) return "Unidade divergente";
    return material.value.name === name ? "Confere" : "Descrição divergente";
  }
  return rows.map(row => ({ ...row, result: classify(row.fields) }));
}

export function MaterialPreview({ catalogs, run }: { catalogs: () => Promise<[Reference[], Reference[]]>; run: Run }) {
  const [rows, show] = useState<Result[]>([]);
  return <details>
    <summary>Prévia de materiais</summary>
    <label>Arquivo CSV (código,descrição,unidade)
      <input type="file" accept=".csv,text/csv" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        show([]);
        if (file) void run(async () => {
          const [text, [materials, units]] = await Promise.all([file.text(), catalogs()]);
          show(compareFile(text, materials, units));
        });
      }} />
    </label>
    {rows.length > 0 && <table><caption>Conferência do arquivo</caption>
      <thead><tr>{["Linha","Código","Descrição","Unidade","Resultado"].map(title => <th key={title}>{title}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.line}><td>{row.line}</td>
        {row.fields.map((value, index) => <td key={index}>{value}</td>)}<td>{row.result}</td>
      </tr>)}</tbody>
    </table>}
  </details>;
}
