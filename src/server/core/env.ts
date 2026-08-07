import { z } from "zod";

/**
 * Validación de variables de entorno al arranque.
 *
 * Motivo: es preferible que el proceso falle inmediatamente con un mensaje
 * claro a que arranque y reviente tres horas después con `undefined is not a
 * string` en mitad de una venta.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL es obligatoria (ver .env.example)"),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const detalles = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Configuración de entorno inválida:\n${detalles}\n\n` +
        `Revisa tu archivo .env (usa .env.example como plantilla).`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
