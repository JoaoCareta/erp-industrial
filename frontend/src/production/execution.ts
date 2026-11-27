export type StepProgress = { stepIndex: number; name: string; completed: string; available: string };
export type PieceProgress = { pieceIndex: number; name: string; total: string; steps: StepProgress[] };
export type MaterialUse = { materialId: string; name: string; unitCode: string; initial: string; consumed: string; remaining: string };
export type ReportData = { pieceIndex: number; stepIndex: number; quantity: number; consumption: { materialId: string; quantity: string } | null };
export type StageReport = ReportData & { requestId: string; actor: string; occurredAt: string };
export type Execution = {
  orderId: string; number: number; productName: string; quantity: number; version: number;
  pieces: PieceProgress[]; materials: MaterialUse[]; reports: StageReport[];
};
export const orderNumber = (number: number) => "OS-" + String(number).padStart(4, "0");
export const executionPath = (id: string) => "production-orders/" + encodeURIComponent(id) + "/execution";
export const quantityFormat = new Intl.NumberFormat("pt-BR");
export const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
