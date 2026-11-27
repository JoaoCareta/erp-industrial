import React, { useState } from "react";

type LaserPiece = { steps?:string[]; name: string; quantity: number; piecesPerCut?: number; minutesPerCut?: number;
  thicknessMm?: number; piecesPerPlate?: number };

const format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

/** Each part runs its own complete cuts, including the last partially occupied cut. */
export function LaserPlanner({ pieces }: { pieces: LaserPiece[] }) {
  const [lot, setLot] = useState("1");
  const kits = Number(lot);
  const valid = Number.isSafeInteger(kits) && kits > 0 && kits <= 2147483647;
  const cutting = pieces.filter(piece => !piece.steps || piece.steps.some(step => /cort|laser/i.test(step)) ||
    [piece.minutesPerCut,piece.piecesPerPlate,piece.piecesPerCut].some(value=>value != null));
  const rows = cutting.map(piece => {
    const required = BigInt(piece.quantity) * BigInt(valid ? kits : 0);
    const capacity = BigInt(piece.piecesPerCut || 0);
    const cuts = capacity > 0n ? (required + capacity - 1n) / capacity : null;
    const minutes = cuts !== null && piece.minutesPerCut ? Number(cuts) * piece.minutesPerCut : null;
    return {piece, required, cuts, minutes};
  });
  const minutes = rows.reduce((sum,r) => sum + (r.minutes ?? 0),0);
  return <details><summary>Planejamento laser</summary>
    <label>Quantidade de kits<input type="number" min="1" max="2147483647" step="1" value={lot}
      onChange={e => setLot(e.target.value)} /></label>
    {!rows.length ? <p>Esta ficha não contém operações de corte.</p> : valid ? <><div className="industrial-table"><table><caption>Carga por peça da ficha publicada</caption>
      <thead><tr>{["Peça","Espessura (mm)","Peças/placa","Peças/corte","Min/corte","Necessidade","Cortes","Min/kit","Minutos"].map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(({piece,required,cuts,minutes},i) => <tr key={i}><th>{piece.name}</th>
        <td>{piece.thicknessMm ?? "—"}</td><td>{piece.piecesPerPlate ?? "—"}</td><td>{piece.piecesPerCut ?? "—"}</td>
        <td>{piece.minutesPerCut ?? "—"}</td><td>{String(required)}</td><td>{cuts?.toString() ?? "—"}</td><td>{piece.minutesPerCut && piece.piecesPerCut ?
          format.format(piece.minutesPerCut * piece.quantity / piece.piecesPerCut) : "—"}</td>
        <td>{minutes === null ? "Parâmetros pendentes" : format.format(minutes)}</td></tr>)}</tbody></table></div>
      <output>{rows.every(r => r.minutes !== null) ? format.format(minutes) + " min · " + Math.floor(minutes / 60) +
        " h " + format.format(minutes % 60) + " min" : "Total pendente. Confira os parâmetros de corte de cada peça."}</output></> :
      <p>Informe um lote inteiro positivo.</p>}
  </details>;
}
