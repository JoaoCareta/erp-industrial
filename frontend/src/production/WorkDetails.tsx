import React from "react";
import { displayQuantity } from "../quantity";
import type { MaterialUse } from "./execution";

export function ReadError({ retry }: { retry: () => void }) {
  return <div role="alert" className="order-error"><p>Não foi possível carregar os dados da produção.</p>
    <button type="button" onClick={retry}>Tentar novamente</button></div>;
}

export function MaterialTotals({ material, perKit }: { material: MaterialUse; perKit?: string }) {
  const { name, unitCode, initial, consumed, remaining } = material;
  return <div className="order-material"><h3>{name}</h3>
    <dl>{perKit && <div><dt>Por kit</dt><dd>{displayQuantity(perKit, unitCode)}</dd></div>}
      {(consumed !== "0" || !perKit) && <>
        <div><dt>Reserva inicial</dt><dd>{displayQuantity(initial, unitCode)}</dd></div>
        <div><dt>Consumo apontado</dt><dd>{displayQuantity(consumed, unitCode)}</dd></div></>}
      <div><dt>Reserva restante</dt><dd>{displayQuantity(remaining, unitCode)}</dd></div>
    </dl>
  </div>;
}
