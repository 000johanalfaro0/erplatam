import "dotenv/config";

import { chromium } from "@playwright/test";

import { THEMES } from "../src/config/themes";

/**
 * Captura la misma pantalla en las tres direcciones visuales.
 *
 * Sirve para compararlas lado a lado sin tener que ir alternando, y para
 * comprobar que el conmutador realmente cambia lo que dice cambiar.
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

  // El tutorial arranca solo en el primer acceso; se cierra para poder ver.
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  await page.goto(`${BASE_URL}/inventario`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  for (const theme of THEMES) {
    // Se aplica directamente, como haría el conmutador.
    await page.evaluate(
      ({ tokens, fuente, id }) => {
        const raiz = document.documentElement;
        for (const [k, v] of Object.entries(tokens)) {
          raiz.style.setProperty(k, v as string);
        }
        raiz.style.setProperty("--font-sans", fuente);
        raiz.dataset.direccion = id;
        localStorage.setItem("erp-direccion-visual", id);
      },
      { tokens: theme.tokens, fuente: theme.fuente, id: theme.id },
    );

    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/50-direccion-${theme.id}.png` });
    console.log(`✓ 50-direccion-${theme.id}.png   ${theme.nombre} — ${theme.apuesta}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
