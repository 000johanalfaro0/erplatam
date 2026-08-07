import "dotenv/config";

import { chromium } from "@playwright/test";

/**
 * Captura la capa de anotaciones con varias notas pegadas.
 *
 * Existe porque los pósits no se pueden juzgar leyendo el código: hay que
 * verlos unos junto a otros, con sus colores e inclinaciones distintas, sobre
 * una pantalla real con datos reales.
 *
 * Las notas se siembran por API y no simulando clic derecho: el objetivo aquí
 * es mirar el papel, no probar el anclaje —de eso ya se encarga la propia
 * capa, que resuelve el ancla al pintar—.
 */

const BASE = process.env.APP_URL ?? "http://localhost:3000";

/** Anclas por rol + nombre accesible, que es como las genera la capa. */
const NOTAS = [
  {
    texto: "Aquí quiero ver el proveedor de cada producto",
    ancla: { role: "heading", name: "Inventario", label: "Inventario" },
  },
  {
    texto: "¿Se puede duplicar uno que ya existe?",
    ancla: { role: "button", name: "Nuevo producto", label: "Nuevo producto" },
  },
  {
    texto: "Que este filtro se quede marcado al volver",
    ancla: { role: "button", name: "Solo stock bajo", label: "Solo stock bajo" },
  },
];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "es-MX",
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo electrónico").fill(
    process.env.SEED_ADMIN_EMAIL ?? "admin@erp.local",
  );
  await page.getByLabel("Contraseña").fill(process.env.SEED_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15_000 });

  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");

  for (const nota of NOTAS) {
    const res = await context.request.post(`${BASE}/api/v1/feedback`, {
      data: {
        kind: "COMMENT",
        priority: "MEDIUM",
        title: nota.texto,
        route: "/inventario",
        elementLabel: nota.ancla.label,
        elementPath: JSON.stringify(nota.ancla),
        viewportWidth: 1440,
        viewportHeight: 900,
      },
    });
    console.log(`${res.ok() ? "✓" : "✗"} ${nota.texto}  (HTTP ${res.status()})`);
  }

  await page.goto(`${BASE}/inventario`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: /Modo feedback/i }).click();
  await page.waitForTimeout(1200);

  await page.screenshot({ path: "capturas/60-postits.png" });
  console.log("✓ 60-postits.png");

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
