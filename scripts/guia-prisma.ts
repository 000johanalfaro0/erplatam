import { chromium } from "@playwright/test";

/**
 * Verifica que un enlace de reclamación de base de datos funcione ANTES de
 * pasárselo a la persona.
 *
 *   npx tsx scripts/guia-prisma.ts <claimUrl>
 *
 * Comprueba que la página carga, que el proyecto existe del lado de Prisma
 * (la petición de verificación no devuelve 404) y captura lo que se verá.
 *
 * Solo NAVEGA Y OBSERVA. No inicia sesión ni pulsa el botón de reclamar:
 * esas acciones exigen credenciales personales.
 */

const claimUrl = process.argv[2];

if (!claimUrl) {
  console.error("Uso: npx tsx scripts/guia-prisma.ts <claimUrl>");
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });

  // Se escuchan las respuestas de red: así se detecta el 404 de verificación
  // del proyecto, que es justo el fallo que hubo la vez anterior y que la
  // página no muestra hasta que pulsas el botón.
  const fallos: string[] = [];

  page.on("response", (response) => {
    if (response.status() >= 400) {
      fallos.push(`${response.status()} ${response.url().slice(0, 120)}`);
    }
  });

  await page.goto(claimUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3500);

  await page.screenshot({ path: "capturas/guia-01-prisma-claim.png" });

  const cuerpo = await page.locator("body").innerText();
  const proyectoNoEncontrado = /project not found|not found|no existe/i.test(cuerpo);

  console.log("URL:", page.url());
  console.log("Título:", await page.title());
  console.log(
    "Botones:",
    (await page.getByRole("button").allInnerTexts())
      .filter(Boolean)
      .map((t) => t.replace(/\s+/g, " ").trim())
      .join(" | "),
  );
  console.log(
    "Peticiones fallidas:",
    fallos.length === 0 ? "ninguna" : fallos.join("\n  "),
  );
  console.log(
    "\nVEREDICTO:",
    proyectoNoEncontrado || fallos.some((f) => f.startsWith("404"))
      ? "✗ EL ENLACE NO SIRVE — el proyecto no existe del lado de Prisma"
      : "✓ El enlace carga correctamente y el proyecto existe",
  );

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
