import { chromium } from "@playwright/test";

/**
 * Captura la página de reclamación de la base de datos, para poder guiar al
 * usuario paso a paso sobre lo que verá en su pantalla.
 *
 * Solo NAVEGA Y OBSERVA. No inicia sesión, no crea cuentas y no pulsa nada:
 * esas acciones las tiene que hacer la persona con sus propias credenciales.
 */

const CLAIM_URL =
  "https://create-db.prisma.io/claim?projectID=proj_jetiqeomcuin094m3zn60m6j";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });

  await page.goto(CLAIM_URL, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: "capturas/guia-01-prisma-claim.png" });
  console.log("✓ capturas/guia-01-prisma-claim.png");
  console.log("  URL final:", page.url());
  console.log("  Título:", await page.title());

  // Texto visible de los botones, para poder nombrarlos con exactitud.
  const botones = await page
    .getByRole("button")
    .allInnerTexts()
    .catch(() => []);
  const enlaces = await page.getByRole("link").allInnerTexts().catch(() => []);

  console.log(
    "  Botones:",
    botones.filter(Boolean).map((t) => t.replace(/\s+/g, " ").trim()).join(" | "),
  );
  console.log(
    "  Enlaces:",
    enlaces.filter(Boolean).map((t) => t.replace(/\s+/g, " ").trim()).slice(0, 10).join(" | "),
  );

  await browser.close();
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
