type Receipt = { id: string; quantity: number };
type Creation = { id: string; productName: string; data: {productId: string; version: number; quantity: number} };
type Report = { requestId: string; orderId: string; data: {pieceIndex: number; stepIndex: number; quantity: number;
  consumption: {materialId: string; quantity: string} | null} };
type Intent = Receipt | Creation | Report;

function id(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error("Identificador inválido");
  return value;
}
function integer(value: number, min: number) {
  if (!Number.isSafeInteger(value) || value < min || value > 2147483647) throw new Error("Quantidade inválida");
  return value;
}

/** Only persist the fields accepted by each production command; bound both text and quantities. */
function clean(intent: Intent): Intent {
  if ("requestId" in intent) {
    const { pieceIndex, stepIndex, quantity, consumption } = intent.data;
    if (consumption && !/^\d{1,12}(?:\.\d{1,6})?$/.test(consumption.quantity)) throw new Error("Consumo inválido");
    return { requestId:id(intent.requestId), orderId:id(intent.orderId), data:{pieceIndex:integer(pieceIndex,0),
      stepIndex:integer(stepIndex,0), quantity:integer(quantity,1), consumption:consumption &&
      {materialId:id(consumption.materialId),quantity:consumption.quantity}} };
  }
  if ("productName" in intent) {
    const {productId, version, quantity} = intent.data;
    return {id:id(intent.id), productName:intent.productName.slice(0,512),
      data:{productId:id(productId),version:integer(version,1),quantity:integer(quantity,1)}};
  }
  return {id:id(intent.id),quantity:integer(intent.quantity,1)};
}

export function encodePending(intent: Intent) {
  return encodeURIComponent(JSON.stringify(clean(intent)));
}

export function savePending(key: string, encoded: string) {
  // Validate the whole key and wire representation before they reach browser storage.
  if (!/^(?:erp\.stage-report\.|erp\.production\.create\.)?\["[\w%.'!~()*-]+"(?:,"[\w%.'!~()*-]+"){1,3}\]$/.test(key))
    throw new Error("Chave de operação inválida");
  if (!/^(?:[a-zA-Z0-9_.!~*'()-]|%[0-9A-F]{2}){1,16000}$/.test(encoded)) throw new Error("Operação inválida");
  sessionStorage.setItem(key, encoded);
}

export function readPending<T extends Intent>(key: string): T | null {
  const stored = sessionStorage.getItem(key);
  if (!stored) return null;
  try {
    return clean(JSON.parse(stored.startsWith("%") ? decodeURIComponent(stored) : stored)) as T;
  } catch {
    return null;
  }
}

export function scopeId(value: string) {
  return encodeURIComponent(value);
}
