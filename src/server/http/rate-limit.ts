import { RateLimitError } from "@/server/core/errors";

/**
 * Limitación de peticiones en memoria, por ventana deslizante.
 *
 * LIMITACIÓN HONESTA, DOCUMENTADA A PROPÓSITO
 * ---------------------------------------------------------------------------
 * Este contador vive en la memoria del proceso. En Vercel, cada función
 * serverless tiene su propia memoria, así que con N instancias activas el
 * límite efectivo es N × límite. NO es una defensa criptográficamente sólida.
 *
 * Aun así se incluye, y no es seguridad teatral, porque:
 *
 *   1. Frena de forma efectiva el caso real y frecuente: un script torpe, un
 *      bucle infinito en el cliente, o un usuario recargando compulsivamente.
 *   2. Es gratis: cero dependencias, cero infraestructura, cero latencia.
 *
 * La defensa REAL contra fuerza bruta de credenciales no está aquí, sino en el
 * bloqueo por cuenta persistido en base de datos (`auth/service.ts`), que sí
 * es consistente entre instancias porque su estado vive en Postgres.
 *
 * Si el cliente decide usar el sistema en serio, la sustitución natural es
 * Upstash Redis o el limitador de la propia plataforma. El punto de cambio
 * está aislado en este archivo.
 */

interface Bucket {
  /** Marcas de tiempo de las peticiones dentro de la ventana. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/** Evita que el mapa crezca sin límite si llegan muchas claves distintas. */
const MAX_BUCKETS = 10_000;

export interface RateLimitRule {
  /** Peticiones permitidas dentro de la ventana. */
  limit: number;
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number;
}

/** Reglas predefinidas por tipo de endpoint. */
export const RATE_LIMITS = {
  /** Inicio de sesión: agresivo, complementa el bloqueo por cuenta. */
  login: { limit: 10, windowMs: 60_000 },
  /** Escrituras normales: generoso, un cajero rápido no debe toparse con él. */
  write: { limit: 120, windowMs: 60_000 },
  /** Lecturas: muy generoso. */
  read: { limit: 600, windowMs: 60_000 },
  /** Subida de capturas de feedback: son pesadas. */
  upload: { limit: 20, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

function prune(bucket: Bucket, now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  let index = 0;
  while (index < bucket.hits.length && bucket.hits[index] <= cutoff) index++;
  if (index > 0) bucket.hits.splice(0, index);
}

/**
 * Consume una unidad del cupo. Lanza `RateLimitError` si se excedió.
 *
 * @param key   Identificador del consumidor. Para login conviene combinar IP y
 *              correo, para que un atacante no agote el cupo de otro usuario.
 * @param rule  Regla a aplicar.
 */
export function consumeRateLimit(key: string, rule: RateLimitRule): void {
  const now = Date.now();

  // Desalojo simple cuando el mapa se descontrola: se prefiere perder
  // precisión a consumir memoria sin techo.
  if (buckets.size > MAX_BUCKETS) buckets.clear();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  prune(bucket, now, rule.windowMs);

  if (bucket.hits.length >= rule.limit) {
    const oldest = bucket.hits[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + rule.windowMs - now) / 1000),
    );
    throw new RateLimitError(retryAfterSeconds);
  }

  bucket.hits.push(now);
}

/** Solo para tests: vacía el estado del limitador. */
export function resetRateLimits(): void {
  buckets.clear();
}
