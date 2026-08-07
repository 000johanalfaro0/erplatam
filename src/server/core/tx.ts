import type { Prisma } from "@/generated/prisma/client";

import { db } from "./db";
import { InternalError } from "./errors";
import { logger } from "./logger";

/**
 * Cliente dentro de una transacción. Los repositorios lo aceptan para poder
 * componerse dentro de operaciones atómicas.
 */
export type Tx = Prisma.TransactionClient;

/**
 * ESTRATEGIA DE CONCURRENCIA (requisito 17 y 18)
 * ---------------------------------------------------------------------------
 * Nivel de aislamiento: READ COMMITTED (el de Postgres por defecto).
 *
 * No usamos SERIALIZABLE porque no hace falta: los conflictos reales de este
 * sistema son sobre filas concretas y conocidas de antemano (los productos de
 * una venta). Para esos casos, un bloqueo pesimista explícito
 * (`SELECT ... FOR UPDATE`) es más barato y más predecible que abortar y
 * reintentar transacciones enteras.
 *
 * El escenario que hay que impedir es exactamente este:
 *
 *   Caja A                          Caja B
 *   ------                          ------
 *   lee stock = 1                   lee stock = 1
 *   valida 1 >= 1  OK               valida 1 >= 1  OK
 *   escribe stock = 0               escribe stock = 0
 *                                   -> se vendieron 2 unidades de 1
 *
 * Con `SELECT ... FOR UPDATE`, la caja B se bloquea en la lectura hasta que A
 * confirma, y entonces lee stock = 0 y falla correctamente.
 *
 * El bloqueo se toma SIEMPRE en orden ascendente de id para minimizar
 * abrazos mortales, y aun así se reintenta si Postgres detecta uno.
 */

const DEADLOCK_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
]);

/**
 * Fallos TRANSITORIOS de infraestructura bajo contención.
 *
 * No son errores de lógica ni de datos: son "ahora mismo no hay hueco". Con
 * una base gestionada y varias cajas simultáneas, agotar el cupo de conexiones
 * momentáneamente es normal, y reintentar tras una espera corta funciona.
 *
 * Se detectó midiendo: la prueba de diez cajas simultáneas fallaba una de cada
 * tres ejecuciones con "timeout exceeded when trying to connect", rechazando
 * ventas legítimas. La lógica era correcta; lo que faltaba era paciencia.
 *
 * Se tratan igual que un abrazo mortal porque el remedio es el mismo:
 * esperar un poco y volver a intentarlo.
 */
const TRANSIENT_PATTERNS = [
  "timeout exceeded when trying to connect",
  "Unable to start a transaction",
  "Failed to connect to upstream database",
  "Connection terminated",
  "too many clients",
];

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown };

  if (typeof candidate.code === "string" && DEADLOCK_CODES.has(candidate.code)) {
    return true;
  }

  if (typeof candidate.message !== "string") return false;

  const message = candidate.message;

  // El adaptador de driver a veces envuelve el error del motor; el código
  // SQLSTATE sigue apareciendo en el mensaje.
  if ([...DEADLOCK_CODES].some((code) => message.includes(code))) {
    return true;
  }

  return TRANSIENT_PATTERNS.some((pattern) => message.includes(pattern));
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface TransactionOptions {
  /** Milisegundos que la transacción puede permanecer abierta. */
  timeout?: number;
  /** Milisegundos de espera para obtener una conexión del pool. */
  maxWait?: number;
  /** Reintentos ante abrazo mortal / fallo de serialización. */
  retries?: number;
}

/**
 * Ejecuta una unidad de trabajo atómica.
 *
 * Todo lo que ocurre dentro del callback confirma o revierte en bloque:
 * la venta, sus líneas, sus pagos, los movimientos de inventario, la
 * actualización de existencias y el registro de auditoría. Es imposible
 * terminar con "la venta se creó pero el inventario no se actualizó".
 */
export async function transaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  /*
   * `maxWait` es cuánto se espera para OBTENER una conexión y empezar; no
   * cuánto dura la transacción. Los 30 segundos parecen mucho y son
   * deliberados.
   *
   * El pool tiene 5 conexiones a propósito (ver `core/db.ts`): con más, la
   * base gestionada rechaza conexiones bajo carga. Eso significa que con 10
   * cajas simultáneas, cinco ESPERAN en cola — y esa espera es normal, no un
   * error.
   *
   * Con el valor anterior de 5 s, las peticiones en cola fallaban con
   * "Unable to start a transaction in the given time" pese a que el sistema
   * funcionaba correctamente: se rechazaban ventas legítimas por impaciencia.
   *
   * `timeout` (cuánto puede durar ya iniciada) se mantiene ajustado: una
   * transacción larga retiene bloqueos y bloquea a las demás. Si una venta
   * tarda más de 15 s, algo va mal y es mejor abortarla.
   */
  const { timeout = 15_000, maxWait = 30_000, retries = 3 } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await db.$transaction(fn, { timeout, maxWait });
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === retries) {
        throw error;
      }

      /*
       * Espera exponencial con dispersión aleatoria.
       *
       * La dispersión no es adorno: sin ella, dos cajas que chocan esperan
       * exactamente lo mismo y vuelven a chocar sincronizadas en el reintento.
       *
       * La base de 150 ms está pensada para el caso de contención de
       * conexiones: reintentar a los 25 ms no sirve de nada si la conexión que
       * hace falta la está usando una transacción que tardará medio segundo.
       */
      const backoff = 150 * 2 ** attempt + Math.random() * 150;
      logger.warn("Conflicto de concurrencia; reintentando transacción", {
        attempt: attempt + 1,
        backoffMs: Math.round(backoff),
      });
      await sleep(backoff);
    }
  }

  logger.error("Transacción agotó los reintentos", lastError);
  throw new InternalError("La transacción falló tras agotar los reintentos");
}

/**
 * Bloquea filas de producto para actualización y devuelve su existencia real.
 *
 * Debe invocarse SIEMPRE antes de leer o modificar `stock` dentro de una
 * transacción que vaya a escribirlo. El orden ascendente por id es lo que
 * hace que dos transacciones que tocan los mismos productos los tomen en la
 * misma secuencia.
 *
 * Devuelve un Map para que quien llama pueda resolver por id sin recorrer.
 */
export async function lockProductsForUpdate(
  tx: Tx,
  businessId: string,
  productIds: readonly string[],
): Promise<
  Map<string, { id: string; name: string; stock: number; tracksInventory: boolean }>
> {
  if (productIds.length === 0) return new Map();

  // Deduplicar: pedir dos veces la misma fila no aporta y ensucia el orden.
  const uniqueIds = [...new Set(productIds)].sort();

  const rows = await tx.$queryRaw<
    { id: string; name: string; stock: number; tracksInventory: boolean }[]
  >`
    SELECT id, name, stock, "tracksInventory"
    FROM "Product"
    WHERE id = ANY(${uniqueIds}::text[])
      AND "businessId" = ${businessId}
      AND "deletedAt" IS NULL
    ORDER BY id
    FOR UPDATE
  `;

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Reserva el siguiente folio de un tipo de documento, de forma atómica.
 *
 * `UPDATE ... RETURNING` bloquea la fila del contador durante la transacción,
 * así que dos ventas simultáneas obtienen folios distintos por construcción.
 * No se usa `MAX(folio) + 1`, que es una condición de carrera clásica.
 *
 * Efecto secundario deliberado: si la transacción revierte, el folio se
 * devuelve al contador. Puede haber huecos si una venta falla a medias, lo
 * cual es correcto — el folio identifica, no cuenta.
 */
export async function nextFolio(
  tx: Tx,
  businessId: string,
  docType: "SALE" | "PURCHASE",
): Promise<string> {
  const rows = await tx.$queryRaw<{ prefix: string; nextValue: number }[]>`
    UPDATE "DocumentCounter"
    SET "nextValue" = "nextValue" + 1
    WHERE "businessId" = ${businessId} AND "docType" = ${docType}
    RETURNING prefix, "nextValue" - 1 AS "nextValue"
  `;

  const counter = rows[0];

  if (!counter) {
    throw new InternalError(
      `No existe contador de folios para ${docType} en el negocio ${businessId}. ` +
        `Ejecuta el seed.`,
    );
  }

  return `${counter.prefix}-${String(counter.nextValue).padStart(6, "0")}`;
}
