import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sincroniza DATABASE_URL en .env con el puerto real del Postgres de Prisma.
 *
 * POR QUÉ EXISTE ESTE SCRIPT
 * ---------------------------------------------------------------------------
 * `prisma dev` asigna puertos dinámicamente y puede cambiarlos al reiniciar el
 * servidor o la máquina. Si el .env apunta al puerto anterior, la aplicación
 * falla con ECONNREFUSED y el síntoma —"la base de datos no responde"— no
 * apunta a la causa real.
 *
 * Se ejecuta automáticamente como parte de `npm run db:up`, así que en la
 * práctica el problema desaparece.
 *
 * En producción este script NO se usa: allí DATABASE_URL apunta a una base
 * gestionada con host y puerto estables.
 */

const ENV_PATH = resolve(process.cwd(), ".env");

function readPrismaDevUrl() {
  // `shell: true` es obligatorio en Windows: sin él, spawn falla con EINVAL
  // al invocar un .cmd por razones de seguridad de Node.
  const output = execFileSync("npx", ["prisma", "dev", "ls"], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  // La salida trae enlaces de terminal y códigos de color; se extrae la URL
  // TCP directa con una expresión regular en lugar de intentar parsear la
  // tabla.
  const match = output.match(
    /postgres:\/\/postgres:postgres@localhost:(\d+)\/\w+/,
  );

  if (!match) {
    throw new Error(
      "No se encontró un servidor de `prisma dev` en ejecución.\n" +
        "Ejecuta primero: npx prisma dev -d -n erp",
    );
  }

  return { url: `${match[0]}?sslmode=disable`, port: Number(match[1]) };
}

function updateEnvFile(databaseUrl, port) {
  const content = readFileSync(ENV_PATH, "utf8");

  // La base "sombra" que usa `prisma migrate` corre en el puerto siguiente.
  const shadowUrl = databaseUrl.replace(
    `localhost:${port}`,
    `localhost:${port + 1}`,
  );

  const updated = content
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${databaseUrl}"`)
    .replace(/^SHADOW_DATABASE_URL=.*$/m, `SHADOW_DATABASE_URL="${shadowUrl}"`);

  if (updated === content) {
    console.log("→ .env ya estaba sincronizado.");
    return;
  }

  writeFileSync(ENV_PATH, updated, "utf8");
  console.log(`✓ .env sincronizado con el puerto ${port}`);
}

try {
  const { url, port } = readPrismaDevUrl();
  updateEnvFile(url, port);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
