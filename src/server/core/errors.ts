/**
 * Jerarquía de errores de dominio.
 *
 * Regla central (requisito 29): el usuario JAMÁS ve un error técnico.
 * Cada error lleva dos mensajes:
 *
 *   - `userMessage`: en español, accionable, seguro de mostrar.
 *   - `message` (de Error): detalle técnico, solo para logs.
 *
 * La capa HTTP serializa únicamente `userMessage` y `code`. Un
 * `PrismaClientKnownRequestError` que se escape hacia arriba se convierte en un
 * 500 genérico, nunca en una fuga de detalles del esquema.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "BUSINESS_RULE"
  | "RATE_LIMITED"
  | "INTERNAL";

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;
  /** Mensaje seguro para mostrar al usuario final. */
  abstract readonly userMessage: string;
  /** Datos estructurados adicionales (p. ej. qué campos fallaron). */
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** Entrada del usuario que no cumple el contrato. */
export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR" as const;
  readonly httpStatus = 422;
  readonly userMessage: string;

  constructor(userMessage = "Revisa los datos capturados.", details?: unknown) {
    super(`Validación fallida: ${userMessage}`, details);
    this.userMessage = userMessage;
  }
}

/** No hay sesión válida. */
export class UnauthenticatedError extends AppError {
  readonly code = "UNAUTHENTICATED" as const;
  readonly httpStatus = 401;
  readonly userMessage = "Tu sesión expiró. Inicia sesión nuevamente.";

  constructor(message = "Sesión ausente o inválida") {
    super(message);
  }
}

/**
 * Credenciales incorrectas al iniciar sesión.
 *
 * Se separa de `UnauthenticatedError` por dos motivos concretos:
 *
 *   1. El mensaje al usuario es distinto. "Tu sesión expiró" ante un login
 *      fallido es desconcertante: el usuario nunca tuvo sesión.
 *   2. El cliente reacciona distinto. Un 401 por sesión caducada redirige al
 *      login; uno por credenciales incorrectas debe quedarse en el formulario
 *      mostrando el error.
 *
 * El mensaje es deliberadamente ambiguo entre "no existe el correo" y "la
 * contraseña no es": distinguirlos permitiría enumerar las cuentas del
 * sistema.
 */
export class InvalidCredentialsError extends AppError {
  readonly code = "INVALID_CREDENTIALS" as const;
  readonly httpStatus = 401;
  readonly userMessage = "Correo o contraseña incorrectos.";

  constructor(technical = "Credenciales inválidas") {
    super(technical);
  }
}

/** Hay sesión, pero el rol no alcanza. */
export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN" as const;
  readonly httpStatus = 403;
  readonly userMessage = "No tienes permiso para realizar esta acción.";

  constructor(permission?: string) {
    super(
      permission
        ? `Permiso requerido no concedido: ${permission}`
        : "Acceso denegado",
    );
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND" as const;
  readonly httpStatus = 404;
  readonly userMessage: string;

  constructor(recurso = "El registro", id?: string) {
    super(`${recurso} no encontrado${id ? ` (id=${id})` : ""}`);
    this.userMessage = `${recurso} no existe o fue eliminado.`;
  }
}

/** Choque con un dato existente: SKU duplicado, email repetido, etc. */
export class ConflictError extends AppError {
  readonly code = "CONFLICT" as const;
  readonly httpStatus = 409;
  readonly userMessage: string;

  constructor(userMessage: string, technical?: string) {
    super(technical ?? userMessage);
    this.userMessage = userMessage;
  }
}

/**
 * Stock insuficiente. Error de primera clase porque es el fallo más frecuente
 * del punto de venta y la interfaz necesita saber exactamente qué producto y
 * cuánto había disponible.
 */
export class InsufficientStockError extends AppError {
  readonly code = "INSUFFICIENT_STOCK" as const;
  readonly httpStatus = 409;
  readonly userMessage: string;

  constructor(
    readonly productName: string,
    readonly available: number,
    readonly requested: number,
  ) {
    super(
      `Stock insuficiente para "${productName}": disponible=${available}, solicitado=${requested}`,
      { productName, available, requested },
    );
    this.userMessage = `No hay existencia suficiente de "${productName}".`;
  }
}

/** Regla de negocio violada (cancelar una venta ya cancelada, etc.). */
export class BusinessRuleError extends AppError {
  readonly code = "BUSINESS_RULE" as const;
  readonly httpStatus = 409;
  readonly userMessage: string;

  constructor(userMessage: string, technical?: string) {
    super(technical ?? userMessage);
    this.userMessage = userMessage;
  }
}

export class RateLimitError extends AppError {
  readonly code = "RATE_LIMITED" as const;
  readonly httpStatus = 429;
  readonly userMessage: string;

  constructor(readonly retryAfterSeconds: number, userMessage?: string) {
    super(`Límite de peticiones excedido; reintentar en ${retryAfterSeconds}s`);
    this.userMessage =
      userMessage ??
      `Demasiados intentos. Espera ${retryAfterSeconds} segundos e inténtalo de nuevo.`;
  }
}

/** Fallo no previsto. Su mensaje interno nunca se envía al cliente. */
export class InternalError extends AppError {
  readonly code = "INTERNAL" as const;
  readonly httpStatus = 500;
  readonly userMessage =
    "No pudimos completar la operación. Inténtalo nuevamente.";
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
