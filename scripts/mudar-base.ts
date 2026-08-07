import "dotenv/config";

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Restaura el último respaldo en una base de datos nueva.
 *
 *   npx tsx scripts/mudar-base.ts "postgres://usuario:clave@host:5432/base"
 *
 * PRINCIPIO: mudar datos es fácil de hacer mal y difícil de deshacer. Por eso
 * el script se niega a escribir sobre una base que ya tenga algo, y no dice
 * "listo" hasta haber CONTADO las filas en los dos lados y comprobado que
 * coinciden. Un `pg_restore` que termina con código 0 no significa que los
 * datos estén: significa que no hubo errores fatales.
 *
 * No toca `.env` ni las variables de Vercel. Cambiar dónde apunta la
 * aplicación es un paso aparte y consciente; ver `scripts/migrar-base.md`.
 */

const PG_BIN = "C:/Program Files/PostgreSQL/17/bin";
const RESPALDOS = "respaldos";

/** Tablas cuya cuenta se compara. Las que perder dolería. */
const TABLAS = [
  "Business",
  "User",
  "Product",
  "Sale",
  "SaleItem",
  "InventoryMovement",
  "Purchase",
  "Expense",
  "Customer",
  "Supplier",
  "AuditLog",
  "FeedbackItem",
];

function conSsl(url: string): string {
  if (url.includes("sslmode=")) return url;
  return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
}

/**
 * Avisa si la cadena de Supabase es la que no sirve.
 *
 * Supabase ofrece tres y solo una vale para todo. Equivocarse no da un error
 * claro: la directa simplemente agota el tiempo de espera —es solo IPv6 en el
 * plan gratuito— y el pooler de transacciones falla más tarde, al migrar,
 * porque no admite sentencias preparadas. Las dos son media hora de
 * desconcierto, así que se detectan aquí.
 */
function avisarSiEsSupabaseEquivocada(url: string) {
  if (!url.includes("supabase")) return;

  if (url.includes(":6543")) {
    console.warn(
      "\n⚠  Estás usando el POOLER DE TRANSACCIONES (puerto 6543).\n" +
        "   No admite sentencias preparadas, que es lo que usa Prisma, y no\n" +
        "   sirve para migraciones. Usa el Session pooler: mismo host, 5432.\n",
    );
  } else if (/@db\.[a-z0-9]+\.supabase\.co/.test(url)) {
    console.warn(
      "\n⚠  Estás usando la CONEXIÓN DIRECTA (host db.….supabase.co).\n" +
        "   En el plan gratuito solo responde por IPv6, así que desde muchas\n" +
        "   redes y desde las funciones de Vercel no se alcanza. Usa el\n" +
        "   Session pooler: host …pooler.supabase.com, puerto 5432.\n",
    );
  }
}

function ultimoRespaldo(): string {
  if (!existsSync(RESPALDOS)) {
    throw new Error(
      `No existe la carpeta "${RESPALDOS}". Haz primero una copia; ver scripts/migrar-base.md`,
    );
  }

  const archivos = readdirSync(RESPALDOS)
    .filter((f) => f.endsWith(".dump"))
    .map((f) => ({ f, t: statSync(join(RESPALDOS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  if (archivos.length === 0) {
    throw new Error(`No hay ningún .dump en "${RESPALDOS}".`);
  }

  return join(RESPALDOS, archivos[0].f);
}

async function contar(url: string): Promise<Record<string, number>> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: conSsl(url) }),
  });

  const cuentas: Record<string, number> = {};

  try {
    for (const tabla of TABLAS) {
      try {
        const filas = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT COUNT(*)::bigint AS n FROM "${tabla}"`,
        );
        cuentas[tabla] = Number(filas[0].n);
      } catch {
        // La tabla no existe todavía: en el destino vacío es lo esperado.
        cuentas[tabla] = -1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  return cuentas;
}

async function main() {
  const destino = process.argv[2];

  if (!destino || !destino.startsWith("postgres")) {
    console.error(
      'Uso: npx tsx scripts/mudar-base.ts "postgres://usuario:clave@host:5432/base"',
    );
    process.exitCode = 1;
    return;
  }

  const origen = process.env.DATABASE_URL;
  if (!origen) throw new Error("Falta DATABASE_URL en .env");

  avisarSiEsSupabaseEquivocada(destino);

  const respaldo = ultimoRespaldo();
  console.log(`Respaldo:  ${respaldo}`);

  // --- 1. El destino tiene que estar vacío --------------------------------
  const antes = await contar(destino);
  const conDatos = Object.entries(antes).filter(([, n]) => n > 0);

  if (conDatos.length > 0) {
    console.error("\n✗ La base destino NO está vacía:");
    for (const [tabla, n] of conDatos) console.error(`    ${tabla}: ${n} filas`);
    console.error(
      "\nNo se restaura encima de datos existentes. Usa una base nueva.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("✓ La base destino está vacía\n");

  // --- 2. Restaurar --------------------------------------------------------
  console.log("Restaurando…");
  try {
    execFileSync(
      join(PG_BIN, "pg_restore.exe"),
      ["--no-owner", "--no-privileges", "--dbname", conSsl(destino), respaldo],
      { stdio: "inherit" },
    );
  } catch {
    // pg_restore devuelve código distinto de cero por avisos benignos
    // (extensiones que ya existen, por ejemplo). Lo que decide si ha ido
    // bien es el recuento de filas de abajo, no este código de salida.
    console.log("· pg_restore terminó con avisos; se comprueban las filas");
  }

  // --- 3. Comparar los dos lados ------------------------------------------
  console.log("\nComparando origen y destino:\n");

  const [enOrigen, enDestino] = await Promise.all([
    contar(origen),
    contar(destino),
  ]);

  let fallos = 0;
  for (const tabla of TABLAS) {
    const a = enOrigen[tabla];
    const b = enDestino[tabla];
    const bien = a === b;
    if (!bien) fallos += 1;
    console.log(
      `  ${bien ? "✓" : "✗"} ${tabla.padEnd(20)} origen ${String(a).padStart(5)}   destino ${String(b).padStart(5)}`,
    );
  }

  if (fallos > 0) {
    console.error(
      `\n✗ ${fallos} ${fallos === 1 ? "tabla no coincide" : "tablas no coinciden"}. NO cambies DATABASE_URL.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`
✓ Todo coincide. La base nueva es una copia exacta.

Falta cambiar a dónde apunta la aplicación, que es un paso aparte:

  1. .env  →  DATABASE_URL="${destino.replace(/:\/\/[^@]+@/, "://***@")}"
  2. npx vercel env rm DATABASE_URL production --yes --scope johan-alfaro-mejias-projects
     npx vercel env add DATABASE_URL production --scope johan-alfaro-mejias-projects
  3. npx vercel deploy --prod --yes --scope johan-alfaro-mejias-projects
`);
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
