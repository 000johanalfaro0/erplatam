import "dotenv/config";

import { chromium } from "@playwright/test";

/**
 * Recorrido del modo feedback, capturado paso a paso.
 *
 * Simula lo que hará el cliente durante la demo: activar el modo, hacer clic
 * derecho sobre un elemento, escribir la anotación y guardarla con captura.
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

  // Se va al inventario, que tiene elementos concretos que comentar.
  await page.goto(`${BASE_URL}/inventario`, { waitUntil: "networkidle" });

  // 1. Activar el modo feedback.
  await page.getByRole("button", { name: "Modo feedback" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/12-feedback-activo.png` });
  console.log("✓ 12-feedback-activo.png");

  // 2. Clic derecho sobre el botón de nuevo producto.
  await page.getByRole("button", { name: "Nuevo producto" }).click({
    button: "right",
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/13-feedback-formulario.png` });
  console.log("✓ 13-feedback-formulario.png");

  // 3. Escribir la anotación como lo haría el cliente.
  await page
    .getByLabel("En pocas palabras")
    .fill("Este botón debería estar también abajo, junto a la tabla");
  await page
    .getByLabel("Explícalo mejor")
    .fill(
      "Cuando reviso el inventario acabo hasta abajo de la lista y tengo que subir hasta arriba para dar de alta un producto.",
    );
  await page.getByLabel("¿Qué tan urgente es?").selectOption("MEDIUM");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/14-feedback-lleno.png` });
  console.log("✓ 14-feedback-lleno.png");

  // 4. Guardar.
  await page.getByRole("button", { name: /Guardar anotación|Capturando/ }).click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/15-feedback-guardado.png` });
  console.log("✓ 15-feedback-guardado.png");

  // 5. Bandeja de revisión.
  await page.goto(`${BASE_URL}/feedback`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/16-feedback-bandeja.png` });
  console.log("✓ 16-feedback-bandeja.png");

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
