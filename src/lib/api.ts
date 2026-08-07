/**
 * Cliente HTTP de la interfaz.
 *
 * Único punto por el que el navegador habla con la API. Centralizarlo permite
 * que el manejo de errores, la sesión caducada y el formato de respuesta se
 * resuelvan una sola vez, en lugar de en cada componente.
 */

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "BUSINESS_RULE"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "NETWORK";

/**
 * Error de API con forma estable.
 *
 * `message` siempre es apto para mostrar al usuario: el servidor nunca envía
 * detalles técnicos en ese campo. `fieldErrors` permite pintar los errores
 * junto a cada input en lugar de en un aviso genérico.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Errores por campo, cuando el servidor devolvió un fallo de validación. */
  get fieldErrors(): Record<string, string> {
    if (
      this.code === "VALIDATION_ERROR" &&
      this.details &&
      typeof this.details === "object"
    ) {
      return this.details as Record<string, string>;
    }
    return {};
  }
}

const BASE = "/api/v1";

/**
 * Parámetros de consulta.
 *
 * Se tipa como `object` y no como `Record<string, ...>` a propósito: TypeScript
 * NO considera que una `interface` satisfaga un `Record`, porque las
 * interfaces no reciben firma de índice implícita. Como todos los filtros de
 * la aplicación son interfaces con nombre (`SaleFilters`, `ProductFilters`…),
 * exigir `Record` obligaría a añadir `[key: string]: unknown` a cada una —
 * lo que destruiría la comprobación de campos mal escritos, que es justo para
 * lo que sirven.
 *
 * No se pierde seguridad real: todo valor acaba pasando por `String()` para ir
 * en la URL, así que el tipo concreto de cada valor no cambia el resultado.
 */
export type QueryParams = object;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Parámetros de consulta; los `undefined`, `null` y `""` se omiten. */
  query?: QueryParams;
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = `${BASE}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    // Omitir vacíos evita URLs con `?search=&status=` que ensucian la caché de
    // TanStack Query: `?search=` y sin parámetro son la misma consulta, pero
    // producirían claves distintas.
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

/**
 * Se invoca cuando el servidor responde 401.
 *
 * La app lo usa para redirigir al login sin que cada pantalla tenga que
 * comprobarlo. Es un callback y no una redirección directa para que este
 * módulo siga siendo probable sin navegador.
 */
let onUnauthenticated: (() => void) | null = null;

export function setUnauthenticatedHandler(handler: () => void): void {
  onUnauthenticated = handler;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, signal, query } = options;

  let response: Response;

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // La cookie de sesión es httpOnly y same-origin; se envía sola, pero se
      // declara explícitamente por claridad.
      credentials: "same-origin",
    });
  } catch (error) {
    // Fallo de red: sin conexión, servidor caído, petición abortada.
    if (error instanceof DOMException && error.name === "AbortError") throw error;

    throw new ApiError(
      "NETWORK",
      "No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.",
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      "INTERNAL",
      "El servidor devolvió una respuesta inesperada.",
      response.status,
    );
  }

  if (!response.ok) {
    const errorBody = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;

    const code = (errorBody?.code ?? "INTERNAL") as ApiErrorCode;

    if (code === "UNAUTHENTICATED") {
      onUnauthenticated?.();
    }

    throw new ApiError(
      code,
      errorBody?.message ??
        "No pudimos completar la operación. Inténtalo nuevamente.",
      response.status,
      errorBody?.details,
    );
  }

  return (payload as { data: T }).data;
}

/** Atajos por verbo, para que las llamadas se lean bien. */
export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: "GET", query, signal }),

  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body }),

  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body }),

  /**
   * PUT sustituye el recurso completo; PATCH lo modifica en parte.
   * El cuestionario usa PUT porque guardar reemplaza todas las respuestas.
   */
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body }),

  delete: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "DELETE", body }),
};

/** Envoltura estándar de listados paginados. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
