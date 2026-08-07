import "dotenv/config";

import { chromium } from "@playwright/test";

/**
 * Recorre las pantallas nuevas y las captura.
 *
 * Además de capturar, VERIFICA: si una página lanza un error o no muestra su
 * encabezado, el script falla. Es una comprobación de humo barata sobre lo que
 * los tests unitarios no cubren — que la pantalla realmente carga con datos
 * reales.
 */

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT = "capturas";

const PANTALLAS = [
  { ruta: "/gastos", titulo: "Gastos", archivo: "20-gastos" },
  { ruta: "/clientes", titulo: "Clientes", archivo: "21-clientes" },
  { ruta: "/proveedores", titulo: "Proveedores", archivo: "22-proveedores" },
  { ruta: "/configuracion", titulo: "Configuración y análisis del negocio", archivo: "23-cuestionario" },
  { ruta: "/reportes", titulo: "Reportes", archivo: "24-reportes" },
  { ruta: "/auditoria", titulo: "Auditoría", archivo: "25-auditoria" },
];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "es-MX",
  });
  const page = await context.newPage();

  // Cualquier error de consola es una señal de que algo va mal.
  const errores: string[] = [];
  page.on("pageerror", (error) => errores.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errores.push(msg.text());
  });

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo electrónico").fill(
    process.env.SEED_ADMIN_EMAIL ?? "admin@erp.local",
  );
  await page.getByLabel("Contraseña").fill(process.env.SEED_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 15_000 });

  for (const pantalla of PANTALLAS) {
    await page.goto(`${BASE_URL}${pantalla.ruta}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    // Verificación: el encabezado debe estar presente.
    const encabezado = page.getByRole("heading", {
      name: pantalla.titulo,
      level: 1,
    });
    const visible = await encabezado.isVisible().catch(() => false);

    await page.screenshot({ path: `${OUT}/${pantalla.archivo}.png` });
    console.log(
      `${visible ? "✓" : "✗"} ${pantalla.archivo}.png  ${pantalla.ruta}${visible ? "" : "  ← NO CARGÓ"}`,
    );

    if (!visible) process.exitCode = 1;
  }

  if (errores.length > 0) {
    console.log("\n✗ Errores de consola detectados:");
    for (const error of [...new Set(errores)].slice(0, 8)) {
      console.log(`   ${error.slice(0, 160)}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\n✓ Sin errores de consola");
  }

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
