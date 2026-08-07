import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

import { env, isDevelopment } from "./env";

/**
 * Cliente Prisma, creado de forma PEREZOSA.
 *
 * Dos motivos para no instanciarlo al importar el módulo:
 *
 * 1. COMPILACIÓN SIN SECRETOS.
 *    `next build` importa cada ruta para recoger su configuración. Si el
 *    cliente se creara aquí, leería DATABASE_URL y la compilación fallaría sin
 *    credenciales. Un artefacto de compilación no debe depender de secretos de
 *    ejecución — y además obliga a exponerlos en el entorno de build sin
 *    necesidad. (Este fallo se detectó en el primer despliegue a Vercel.)
 *
 * 2. ARRANQUE EN FRÍO MÁS BARATO.
 *    Una función serverless que solo devuelve HTML no necesita abrir un pool
 *    de conexiones. Con la creación perezosa, solo paga ese coste quien de
 *    verdad consulta la base de datos.
 *
 * El singleton global sigue siendo necesario: en desarrollo Next recarga los
 * módulos en cada cambio y, sin él, se abriría un pool nuevo por recarga hasta
 * agotar los slots de Postgres.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    /*
     * TAMAÑO DEL POOL — medido en producción, no elegido al azar.
     *
     * En serverless el pool debe ser PEQUEÑO, justo al revés de lo que uno
     * espera. El motivo: cada instancia de función abre su propio pool, así
     * que el total de conexiones contra la base es `max × instancias
     * activas`. Vercel levanta instancias según el tráfico, sin avisar.
     *
     * Historial de este número, todo medido:
     *
     *   max: 10 → la prueba de 10 cajas simultáneas tumbaba la base con
     *             "Failed to connect to upstream database".
     *   max: 5  → arreglaba los tests locales, pero en PRODUCCIÓN el panel
     *             devolvía 500 con `too many connections for role` (SQLSTATE
     *             53300): el panel lanza 9 consultas en paralelo, y con
     *             varias instancias vivas se agotaba el cupo del plan.
     *   max: 2  → en serverless. Las consultas de una misma petición hacen
     *             cola local, que cuesta milisegundos, en lugar de competir
     *             por un cupo global que cuesta un error 500.
     *
     * En local se permite un pool mayor: hay un solo proceso y los tests de
     * concurrencia necesitan paralelismo real.
     */
    max: Number(
      process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 2 : 5),
    ),
    /*
     * Debe ser COHERENTE con el `maxWait` de las transacciones (30 s, ver
     * `core/tx.ts`). Ambos miden la misma espera: obtener una conexión libre.
     *
     * Tenerlo en 10 s mientras la transacción esperaba 30 producía rechazos
     * inconsistentes bajo carga —"timeout exceeded when trying to connect"—
     * pese a que el sistema funcionaba: el pool se rendía antes de que la
     * transacción hubiera agotado su paciencia.
     */
    connectionTimeoutMillis: 30_000,
    // Cierra conexiones ociosas para no ocupar el cupo del proveedor entre
    // ráfagas de actividad.
    idleTimeoutMillis: 30_000,
  });

  return new PrismaClient({
    adapter,
    log: isDevelopment ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Cliente de base de datos.
 *
 * Se expone como Proxy para que el código lo use igual que siempre
 * (`db.product.findMany(...)`), pero la conexión no se abra hasta la primera
 * consulta real.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    // Los métodos se enlazan al cliente real; si no, `this` sería el Proxy y
    // Prisma fallaría al acceder a su estado interno.
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return property in getClient();
  },
});

/**
 * Tipo del cliente dentro de una transacción.
 *
 * Los repositorios reciben `DbClient`, no `PrismaClient`, para poder
 * ejecutarse indistintamente dentro o fuera de una transacción. Ese detalle es
 * lo que permite componer operaciones atómicas sin duplicar código de acceso a
 * datos.
 */
export type DbClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$transaction" | "$extends"
>;
