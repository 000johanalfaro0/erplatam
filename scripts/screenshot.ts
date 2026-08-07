import "dotenv/config";

import { chromium } from "@playwright/test";

/**
 * Captura pantallas de la aplicación para revisión visual.
 *
 *   npx tsx scripts/screenshot.ts
 *
 * Recorre las pantallas principales autenticándose como el usuario del seed.
 * Sirve para revisar la interfaz sin tener que navegar a mano, y como base de
 * la validación end-to-end del requisito 22.
 */

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT_DIR = "capturas";

const email = process.env.SEED_ADMIN_EMAIL ?? "admin@erp.local";
const password = process.env.SEED_ADMIN_PASSWORD ?? "";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "es-MX",
  });
  const page = await context.newPage();

  // --- Login ---------------------------------------------------------------
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/01-login.png` });
  console.log("✓ 01-login.png");

  // La automatización localiza los campos por su ETIQUETA VISIBLE, no por
  // selectores CSS frágiles. Eso es posible porque el componente Field enlaza
  // label y control correctamente — el mismo trabajo que hace la interfaz
  // accesible la hace automatizable.
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await page.waitForURL(`${BASE_URL}/`, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT_DIR}/02-panel.png` });
  console.log("✓ 02-panel.png");

  // --- Inventario ----------------------------------------------------------
  await page.goto(`${BASE_URL}/inventario`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/03-inventario.png` });
  console.log("✓ 03-inventario.png");

  // --- Formulario de producto (panel lateral) ------------------------------
  const nuevoProducto = page.getByRole("button", { name: "Nuevo producto" });
  if (await nuevoProducto.isVisible().catch(() => false)) {
    await nuevoProducto.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/04-producto-form.png` });
    console.log("✓ 04-producto-form.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // --- Filtro de stock bajo ------------------------------------------------
  const filtroStock = page.getByRole("button", { name: "Solo stock bajo" });
  if (await filtroStock.isVisible().catch(() => false)) {
    await filtroStock.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT_DIR}/05-stock-bajo.png` });
    console.log("✓ 05-stock-bajo.png");
  }

  // --- Punto de venta: VENTA REAL de principio a fin -----------------------
  await page.goto(`${BASE_URL}/ventas/nueva`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/06-pos-vacio.png` });
  console.log("✓ 06-pos-vacio.png");

  // Se escribe en el buscador como lo haría un cajero.
  const buscador = page.getByLabel("Escanear o buscar producto");
  await buscador.fill("Jabón");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT_DIR}/07-pos-busqueda.png` });
  console.log("✓ 07-pos-busqueda.png");

  // Enter agrega el producto resaltado, sin tocar el ratón.
  await buscador.press("Enter");
  await page.waitForTimeout(600);

  // Segundo producto, para que el ticket tenga dos líneas con IVA distinto.
  await buscador.fill("Arroz");
  await page.waitForTimeout(1200);
  await buscador.press("Enter");
  await page.waitForTimeout(600);

  await page.screenshot({ path: `${OUT_DIR}/08-pos-carrito.png` });
  console.log("✓ 08-pos-carrito.png");

  // Cobro.
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT_DIR}/09-pos-cobro.png` });
  console.log("✓ 09-pos-cobro.png");

  // Se paga con un billete de $100 para ver el cálculo del cambio.
  const billete = page.getByRole("button", { name: "$100.00" });
  if (await billete.isVisible().catch(() => false)) {
    await billete.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/10-pos-cambio.png` });
    console.log("✓ 10-pos-cambio.png");
  }

  await page.getByRole("button", { name: "Confirmar cobro" }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT_DIR}/11-pos-cobrado.png` });
  console.log("✓ 11-pos-cobrado.png");

  console.log("✓ recorrido completado");

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
