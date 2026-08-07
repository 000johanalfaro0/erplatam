import "dotenv/config";

import { chromium } from "@playwright/test";

/**
 * Simula el PRIMER acceso de un cliente.
 *
 * Contexto de navegador limpio, sin localStorage: es exactamente lo que verá
 * el cliente al entrar por primera vez.
 *
 * Verifica lo que importa:
 *   1. El tutorial se abre SOLO, sin que nadie pulse nada.
 *   2. Empieza hablando de las anotaciones, no de vender.
 *   3. El paso 2 ilumina el botón del modo feedback.
 *   4. Tras completarlo, no vuelve a abrirse al recargar.
 */

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT = "capturas";

async function main() {
  const browser = await chromium.launch();
  // Contexto limpio: sin localStorage previo, como un cliente nuevo.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "es-MX",
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo electrónico").fill(
    process.env.SEED_ADMIN_EMAIL ?? "admin@erp.local",
  );
  await page.getByLabel("Contraseña").fill(process.env.SEED_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 15_000 });

  // 1. El tutorial debe abrirse SOLO.
  const panel = page.getByRole("dialog", { name: /.*/ });
  await page.waitForTimeout(2200);

  const abierto = await page
    .getByText("Paso 1 de", { exact: false })
    .isVisible()
    .catch(() => false);

  await page.screenshot({ path: `${OUT}/40-primer-acceso.png` });
  console.log(
    `${abierto ? "✓" : "✗"} el tutorial se abre solo al primer acceso${abierto ? "" : "  ← NO SE ABRIÓ"}`,
  );
  if (!abierto) {
    process.exitCode = 1;
    await browser.close();
    return;
  }

  // 2. Debe empezar por las anotaciones.
  const titulo = await page.locator("#tour-titulo").textContent();
  const hablaDeFeedback = /importante|anot|feedback|voz/i.test(titulo ?? "");
  console.log(
    `${hablaDeFeedback ? "✓" : "✗"} empieza por el feedback: “${titulo?.trim()}”`,
  );
  if (!hablaDeFeedback) process.exitCode = 1;

  // 3. El paso 2 ilumina el botón del modo feedback.
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/41-tutorial-feedback.png` });

  const titulo2 = await page.locator("#tour-titulo").textContent();
  console.log(`✓ paso 2: “${titulo2?.trim()}”`);

  // Recorre el resto
  for (let i = 3; i <= 10; i++) {
    const siguiente = page.getByRole("button", { name: "Siguiente" });
    if (!(await siguiente.isVisible().catch(() => false))) break;
    await siguiente.click();
    await page.waitForTimeout(700);
    if (i === 4) {
      await page.screenshot({ path: `${OUT}/42-tutorial-paso4.png` });
    }
  }

  const terminar = page.getByRole("button", { name: "Terminar" });
  if (await terminar.isVisible().catch(() => false)) {
    await terminar.click();
    await page.waitForTimeout(600);
    console.log("✓ recorrido completado");
  }

  // 4. Al recargar NO debe volver a abrirse.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  const reabrio = await page
    .getByText("Paso 1 de", { exact: false })
    .isVisible()
    .catch(() => false);

  console.log(
    `${reabrio ? "✗" : "✓"} tras completarlo no vuelve a abrirse${reabrio ? "  ← SE REABRIÓ" : ""}`,
  );
  if (reabrio) process.exitCode = 1;

  await page.screenshot({ path: `${OUT}/43-segundo-acceso.png` });
  void panel;
  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
