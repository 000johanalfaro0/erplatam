import { z } from "zod";

/**
 * Configuración de entorno, validada de forma PEREZOSA.
 *
 * POR QUÉ PEREZOSA Y NO AL IMPORTAR
 * ---------------------------------------------------------------------------
 * La versión anterior validaba en el momento de importar el módulo. Parecía
 * correcto —fallar pronto y con un mensaje claro— pero rompía la compilación:
 *
 *   next build → "Collecting page data" → importa cada ruta para leer su
 *   configuración → se ejecuta este módulo → revienta por falta de
 *   SESSION_SECRET.
 *
 * El problema de fondo es que un artefacto de compilación NO debe depender de
 * secretos de ejecución. Compilar y ejecutar son fases distintas: la primera
 * solo necesita el código, la segunda las credenciales. Mezclarlas obliga a
 * exponer secretos en el entorno de build sin ninguna necesidad.
 *
 * Con la validación perezosa:
 *   - `next build` funciona sin ninguna variable definida.
 *   - La primera petición real que necesite la base de datos valida y, si
 *     falta algo, falla con el mismo mensaje claro de siempre.
 *   - Se conserva la garantía importante: nunca se opera con un valor ausente.
 */

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL es obligatoria (ver .env.example)"),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

function loadEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const detalles = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Configuración de entorno inválida:\n${detalles}\n\n` +
        `En desarrollo: revisa tu archivo .env (usa .env.example como plantilla).\n` +
        `En producción: revisa las variables de entorno del proyecto en Vercel.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Acceso a la configuración validada.
 *
 * Se expone como Proxy para que el código siga escribiéndose igual
 * (`env.DATABASE_URL`) mientras la validación ocurre en el primer acceso real,
 * no al importar.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, property: string) {
    return loadEnv()[property as keyof Env];
  },
  has(_target, property: string) {
    return property in loadEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(loadEnv());
  },
  getOwnPropertyDescriptor(_target, property) {
    return Object.getOwnPropertyDescriptor(loadEnv(), property);
  },
});

/**
 * Estas tres SÍ se leen directamente de `process.env`, sin pasar por la
 * validación. NODE_ENV siempre existe (Next la define), no es un secreto, y
 * consultarla no debe poder lanzar una excepción: se usa para decidir cosas
 * como el formato de los logs, incluso en rutas de error.
 */
export const isProduction = process.env.NODE_ENV === "production";
export const isDevelopment = process.env.NODE_ENV === "development";
export const isTest = process.env.NODE_ENV === "test";

/**
 * Comprobación explícita de la configuración.
 *
 * Pensada para un endpoint de salud o un script de arranque: permite verificar
 * que el entorno está bien configurado SIN provocar una excepción.
 */
export function checkEnv(): { ok: true } | { ok: false; error: string } {
  try {
    loadEnv();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
