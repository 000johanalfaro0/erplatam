import "dotenv/config";

import { chromium } from "@playwright/test";

import { THEMES, THEME_STORAGE_KEY } from "../src/config/themes";

/**
 * Captura el acceso en las tres direcciones visuales.
 *
 * El login es la primera pantalla que ve el cliente, así que es donde más
 * pesa la identidad: aquí es donde antes aparecía la inicial en un cuadrado.
 *
 * A diferencia de la captura del inventario, aquí no se inyectan los tokens a
 * mano: se escribe la preferencia en `localStorage` y se recarga, que es lo
 * que hace un usuario real. Así se comprueba de paso que el script del layout
 * aplica la dirección antes del primer pintado, también sin sesión.
 */

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "es-MX",
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

  for (const theme of THEMES) {
    await page.evaluate(
      ([clave, id]) => localStorage.setItem(clave, id),
      [THEME_STORAGE_KEY, theme.id],
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `capturas/51-acceso-${theme.id}.png` });
    console.log(`✓ 51-acceso-${theme.id}.png   ${theme.marca}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
