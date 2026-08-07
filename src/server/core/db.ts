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
     * TAMAÑO DEL POOL — medido, no elegido al azar.
     *
     * Con `max: 10`, una prueba de 10 ventas simultáneas sobre el mismo
     * producto hacía caer la base con "Failed to connect to upstream
     * database": el plan gestionado limita las conexiones concurrentes, y
     * abrir diez a la vez lo desborda.
     *
     * Bajarlo a 5 cambia el modo de fallo por uno mucho mejor: en lugar de
     * que la base rechace la conexión, las peticiones extra ESPERAN en la
     * cola local del pool. Como las transacciones de venta duran decenas de
     * milisegundos, esa espera es imperceptible.
     *
     * En serverless importa el doble: cada instancia abre su propio pool, así
     * que el total es `max × instancias activas`. Un pool pequeño es lo único
     * que evita agotar el límite del proveedor bajo carga.
     *
     * Configurable por si el entorno de destino admite más.
     */
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    // Si en 10 s no hay conexión libre, es mejor fallar con un error claro
    // que dejar la petición colgada indefinidamente.
    connectionTimeoutMillis: 10_000,
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
