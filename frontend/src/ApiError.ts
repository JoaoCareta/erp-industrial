export class ApiError extends Error {
  constructor(readonly status: number) { super("Operação indisponível"); }
}
