import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isProduction } from "@/server/core/env";
import {
  type ErrorCode,
  InternalError,
  RateLimitError,
  ValidationError,
  isAppError,
} from "@/server/core/errors";
import { logger } from "@/server/core/logger";

/**
 * Formato uniforme de respuesta de la API.
 *
 * Éxito: { data: ... }
 * Error: { error: { code, message, details? } }
 *
 * El cliente siempre sabe dónde mirar, y `code` permite reaccionar de forma
 * programática (p. ej. redirigir al login ante UNAUTHENTICATED) sin parsear
 * mensajes en español.
 */

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, { status: 200, ...init });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/** Convierte errores de Zod al formato de detalles que consume la interfaz. */
function formatZodIssues(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    // Se conserva el primer mensaje por campo: mostrar cinco errores del mismo
    // input a la vez no ayuda a nadie.
    fields[path] ??= issue.message;
  }

  return fields;
}

/**
 * Traduce cualquier excepción a una respuesta HTTP segura.
 *
 * Este es el punto que garantiza el requisito 29: bajo ninguna circunstancia
 * un `PrismaClientKnownRequestError`, un stack trace o un nombre de tabla
 * llega al navegador. Los errores no previstos se registran íntegros en el log
 * y se devuelven como un 500 genérico.
 */
export function handleApiError(error: unknown): NextResponse<ApiErrorBody> {
  // 1. Errores de validación de Zod.
  if (error instanceof ZodError) {
    const validation = new ValidationError(
      "Revisa los datos capturados.",
      formatZodIssues(error),
    );
    return NextResponse.json(
      {
        error: {
          code: validation.code,
          message: validation.userMessage,
          details: validation.details,
        },
      },
      { status: validation.httpStatus },
    );
  }

  // 2. Errores de dominio: llevan mensaje seguro por construcción.
  if (isAppError(error)) {
    // Los 5xx se registran como error; los 4xx son comportamiento esperado.
    if (error.httpStatus >= 500) {
      logger.error("Error de aplicación", error);
    } else {
      logger.debug("Error de dominio", {
        code: error.code,
        message: error.message,
      });
    }

    const response = NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.userMessage,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      { status: error.httpStatus },
    );

    if (error instanceof RateLimitError) {
      response.headers.set("Retry-After", String(error.retryAfterSeconds));
    }

    return response;
  }

  // 3. Cualquier otra cosa: se registra completa y se oculta al cliente.
  logger.error("Error no controlado en la API", error);

  const fallback = new InternalError("Error no controlado");

  return NextResponse.json(
    {
      error: {
        code: fallback.code,
        message: fallback.userMessage,
        // Solo en desarrollo se adjunta el detalle, para poder depurar sin
        // abrir la consola del servidor.
        ...(isProduction
          ? {}
          : {
              details: {
                _dev: error instanceof Error ? error.message : String(error),
              },
            }),
      },
    },
    { status: fallback.httpStatus },
  );
}

/**
 * Envuelve un manejador de ruta para que nunca escape una excepción.
 *
 * Se usa así:
 *   export const POST = route(async (request) => { ... });
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * Lee y valida el cuerpo JSON de una petición.
 * Un cuerpo malformado se convierte en 422, no en 500.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("El cuerpo de la petición no es JSON válido.");
  }
}
