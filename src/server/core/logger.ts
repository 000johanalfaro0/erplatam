import { isProduction } from "./env";

/**
 * Logging estructurado.
 *
 * En producción emite JSON por línea: Vercel lo indexa y se puede filtrar por
 * campo. En desarrollo emite texto legible.
 *
 * Regla: aquí SÍ va el detalle técnico completo (stack traces, ids, SQL). Lo
 * que nunca debe entrar es material sensible — contraseñas, hashes, tokens de
 * sesión, cookies.
 */

type Level = "debug" | "info" | "warn" | "error";

/** Claves cuyo valor se sustituye por `[redactado]` antes de escribir. */
const REDACTED_KEYS = new Set([
  "password",
  "passwordhash",
  "passwordconfirm",
  "token",
  "tokenhash",
  "sessiontoken",
  "secret",
  "authorization",
  "cookie",
  "apikey",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    output[key] = REDACTED_KEYS.has(key.toLowerCase())
      ? "[redactado]"
      : redact(val, depth + 1);
  }
  return output;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(("code" in error) ? { code: (error as { code: unknown }).code } : {}),
    };
  }
  return { message: String(error) };
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  const safeContext = context
    ? (redact(context) as Record<string, unknown>)
    : undefined;

  if (isProduction) {
    console[level === "debug" ? "log" : level](
      JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        ...safeContext,
      }),
    );
    return;
  }

  const suffix = safeContext ? ` ${JSON.stringify(safeContext)}` : "";
  console[level === "debug" ? "log" : level](
    `[${level.toUpperCase()}] ${message}${suffix}`,
  );
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    if (!isProduction) write("debug", message, context);
  },
  info: (message: string, context?: Record<string, unknown>) =>
    write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    write("warn", message, context),
  error: (
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ) =>
    write("error", message, {
      ...context,
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    }),
};
