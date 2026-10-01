/** Errors the DAL raises; server actions translate them into `{ ok: false, … }` results. */
export type FieldErrors = Record<string, string[]>;

export class DalError extends Error {
  readonly code: string;
  readonly fieldErrors: FieldErrors | undefined;
  constructor(code: string, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "DalError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends DalError {
  constructor(entity: string, id?: string) {
    super("NOT_FOUND", id ? `${entity} ${id} was not found` : `${entity} was not found`);
    this.name = "NotFoundError";
  }
}

/** A business rule was violated (e.g. editing an issued invoice). */
export class InvariantError extends DalError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super("INVARIANT", message, fieldErrors);
    this.name = "InvariantError";
  }
}

export function isDalError(e: unknown): e is DalError {
  return e instanceof DalError;
}
