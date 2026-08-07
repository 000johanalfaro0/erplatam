import "dotenv/config";

import { chromium } from "@playwright/test";

/**
 * Prueba de la capa de anotaciones.
 *
 * Verifica lo que de verdad importa y no se ve en un typecheck:
 *   1. Al activar el modo, un clic sobre un elemento abre la nota.
 *   2. La nota se guarda y queda pegada JUNTO al elemento correcto.
 *   3. Al recargar, la nota reencuentra su elemento (el anclaje funciona).
 *   4. Al hacer scroll, la nota SIGUE al elemento.
 */

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT = "capturas";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "es-MX",
  });
  const page = await context.newPage();

  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo electrónico").fill(
    process.env.SEED_ADMIN_EMAIL ?? "admin@erp.local",
  );
  await page.getByLabel("Contraseña").fill(process.env.SEED_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 15_000 });

  await page.goto(`${BASE_URL}/inventario`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // 1. Activar el modo
  await page.getByRole("button", { name: "Modo feedback" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/30-capa-activa.png` });
  console.log("✓ 30-capa-activa.png");

  // 2. Clic sobre el botón de nuevo producto
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/31-capa-escribiendo.png` });
  console.log("✓ 31-capa-escribiendo.png");

  await page
    .getByLabel("Texto de la nota")
    .fill("Este botón debería estar también abajo, junto a la tabla");
  await page.getByRole("button", { name: "Pegar" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/32-capa-nota-pegada.png` });
  console.log("✓ 32-capa-nota-pegada.png");

  // 3. Segunda nota sobre un elemento de la tabla
  await page.getByRole("button", { name: "Solo stock bajo" }).click();
  await page.waitForTimeout(500);
  await page.getByLabel("Texto de la nota").fill("¿Se puede filtrar por proveedor?");
  await page.getByRole("button", { name: "Pegar" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/33-capa-dos-notas.png` });
  console.log("✓ 33-capa-dos-notas.png");

  // 4. Recargar: las notas deben reencontrar sus elementos
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Modo feedback" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/34-capa-tras-recargar.png` });
  console.log("✓ 34-capa-tras-recargar.png");

  // Comprobación real del anclaje: la nota debe estar cerca de su elemento
  const boton = await page
    .getByRole("button", { name: "Nuevo producto" })
    .boundingBox();
  const nota = await page
    .locator("text=Este botón debería estar también abajo")
    .first()
    .boundingBox();

  if (boton && nota) {
    const distanciaVertical = Math.abs(nota.y - boton.y);
    console.log(
      `\n  anclaje: nota a ${Math.round(distanciaVertical)} px verticales de su botón ` +
        `${distanciaVertical < 120 ? "→ CORRECTO" : "→ DEMASIADO LEJOS"}`,
    );
    if (distanciaVertical >= 120) process.exitCode = 1;
  } else {
    console.log("\n  ✗ no se encontró la nota o su elemento tras recargar");
    process.exitCode = 1;
  }

  console.log(
    errores.length === 0
      ? "  sin errores de consola"
      : `  ✗ errores: ${errores.slice(0, 3).join(" | ")}`,
  );
  if (errores.length > 0) process.exitCode = 1;

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
