import "dotenv/config";

import { chromium } from "@playwright/test";

/**
 * Recorre el tutorial guiado y captura cada paso.
 *
 * Sirve de doble comprobación: que el foco ilumina el elemento correcto en
 * cada paso, y que la navegación entre pantallas funciona.
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

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo electrónico").fill(
    process.env.SEED_ADMIN_EMAIL ?? "admin@erp.local",
  );
  await page.getByLabel("Contraseña").fill(process.env.SEED_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Iniciar recorrido guiado" }).click();
  await page.waitForTimeout(700);

  // Se recorren los 7 pasos capturando cada uno.
  for (let paso = 1; paso <= 7; paso++) {
    await page.screenshot({ path: `${OUT}/tour-${String(paso).padStart(2, "0")}.png` });
    console.log(`✓ tour-${String(paso).padStart(2, "0")}.png`);

    if (paso < 7) {
      await page.getByRole("button", { name: "Siguiente" }).click();
      // Margen para la navegación entre pantallas y la animación del foco.
      await page.waitForTimeout(1100);
    }
  }

  await page.getByRole("button", { name: "Terminar" }).click();
  await page.waitForTimeout(500);
  console.log("✓ recorrido completado");

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
