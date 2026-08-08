import "dotenv/config";

import { chromium, type Page } from "@playwright/test";

/**
 * AUDITORÍA DE LA INTERFAZ
 * ===========================================================================
 * Recorre las pantallas y comprueba tres cosas que se rompen en silencio:
 *
 *   1. BOTONES QUE NO HACEN NADA. Un botón que existe pero no abre lo que
 *      promete es peor que un botón que falta: el que falta se nota, el que
 *      no responde se atribuye a "va lento".
 *
 *   2. DESPLEGABLES VACÍOS O CON OPCIONES MUERTAS. Un selector de categoría
 *      que ofrece una categoría que ya no existe filtra a cero y parece que
 *      se perdieron los datos.
 *
 *   3. BUSCADORES QUE NO CONCUERDAN CON LOS DATOS. Este es el importante y
 *      el que casi nunca se prueba: no basta con que el buscador responda,
 *      tiene que devolver EXACTAMENTE lo que hay en la base. Se comprueba
 *      contra la API, no contra otra pantalla —comparar la interfaz consigo
 *      misma no demuestra nada—.
 *
 * FILOSOFÍA: cada comprobación afirma sobre datos, no sobre píxeles. Por eso
 * sobrevive al rediseño: si mañana la navegación se va a la barra superior,
 * este guion sigue valiendo, porque busca por rol y nombre accesible, que es
 * lo que ve una persona, no por clases CSS.
 */

const BASE = process.env.APP_URL ?? "http://localhost:3000";

let fallos = 0;
let comprobaciones = 0;

function ok(descripcion: string, condicion: boolean, detalle = "") {
  comprobaciones += 1;
  if (!condicion) fallos += 1;
  console.log(
    `  ${condicion ? "✓" : "✗"} ${descripcion}${detalle ? `  — ${detalle}` : ""}`,
  );
}

/** Pulsa un botón y comprueba que algo aparece después. */
async function abre(
  page: Page,
  boton: string,
  esperado: { rol: "dialog" | "menu"; nombre?: RegExp | string },
) {
  const disparador = page.getByRole("button", { name: boton }).first();

  if (!(await disparador.isVisible().catch(() => false))) {
    ok(`botón "${boton}" existe`, false, "no está en pantalla");
    return;
  }

  await disparador.click();

  const objetivo = esperado.nombre
    ? page.getByRole(esperado.rol, { name: esperado.nombre })
    : page.getByRole(esperado.rol);

  const aparecio = await objetivo
    .first()
    .waitFor({ state: "visible", timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  ok(`"${boton}" abre algo`, aparecio, aparecio ? "" : "no apareció nada");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "es-MX",
  });
  const page = await context.newPage();

  const erroresConsola: string[] = [];
  page.on("pageerror", (e) => erroresConsola.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") erroresConsola.push(m.text());
  });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo electrónico").fill(
    process.env.SEED_ADMIN_EMAIL ?? "admin@erp.local",
  );
  await page.getByLabel("Contraseña").fill(process.env.SEED_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15_000 });
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // =========================================================================
  console.log("\nINVENTARIO");
  // =========================================================================
  await page.goto(`${BASE}/inventario`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  // --- El buscador concuerda con los datos ---
  const productos = await context.request
    .get(`${BASE}/api/v1/products`, { params: { pageSize: "100" } })
    .then((r) => r.json());

  const total = productos.data.items.length;
  ok("hay productos con los que probar", total > 0, `${total} productos`);

  const filasVisibles = async () =>
    page.locator("tbody tr").count();

  const sinFiltrar = await filasVisibles();
  ok(
    "la tabla muestra los productos de la API",
    sinFiltrar === Math.min(total, sinFiltrar > 0 ? sinFiltrar : 1) &&
      sinFiltrar > 0,
    `${sinFiltrar} filas en pantalla`,
  );

  // Se busca un producto concreto y se compara con lo que dice la API para
  // ese mismo término. Si la interfaz enseña algo distinto, se ve aquí.
  const muestra = productos.data.items[0];
  const termino = muestra.name.split(" ")[0];

  const buscador = page.getByLabel("Buscar productos");
  await buscador.fill(termino);
  await page.waitForTimeout(900);

  const esperados = await context.request
    .get(`${BASE}/api/v1/products`, {
      params: { search: termino, pageSize: "100" },
    })
    .then((r) => r.json());

  const enPantalla = await filasVisibles();
  ok(
    `buscar "${termino}" devuelve lo mismo que la API`,
    enPantalla === esperados.data.items.length,
    `pantalla ${enPantalla}, API ${esperados.data.items.length}`,
  );

  // El resultado tiene que CONTENER el término, no ser cualquier cosa.
  const primeraFila = await page
    .locator("tbody tr")
    .first()
    .textContent()
    .catch(() => "");
  ok(
    "el primer resultado contiene lo buscado",
    (primeraFila ?? "").toLowerCase().includes(termino.toLowerCase()),
    `"${(primeraFila ?? "").slice(0, 40).trim()}…"`,
  );

  // Un término imposible tiene que acabar en "sin coincidencias".
  //
  // No se cuentan filas ni se usa una espera fija. Mientras llega la consulta
  // nueva, la tabla sigue enseñando el resultado anterior a propósito
  // —`placeholderData`, para no parpadear a un esqueleto en cada tecla—, así
  // que mirar a los 900 ms mide la velocidad de la red, no si el buscador
  // funciona. Se espera al estado que ve la persona.
  await buscador.fill("zzzzqqqxx");

  const sinCoincidencias = await page
    .getByText("Sin coincidencias")
    .first()
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  ok(
    "una búsqueda sin resultados acaba en 'sin coincidencias'",
    sinCoincidencias,
    sinCoincidencias ? "" : "la tabla siguió mostrando productos",
  );

  await buscador.fill("");
  await page.waitForTimeout(900);

  // --- El desplegable de categorías concuerda con las categorías reales ---
  const referencia = await context.request
    .get(`${BASE}/api/v1/reference`)
    .then((r) => r.json());

  const categoriasReales: string[] = referencia.data.categories.map(
    (c: { name: string }) => c.name,
  );

  const selector = page.getByLabel("Filtrar por categoría");
  const opciones = await selector.locator("option").allTextContents();
  // La primera opción es "Todas las categorías"; el resto deben ser reales.
  const ofrecidas = opciones.slice(1).map((o) => o.trim());

  const inventadas = ofrecidas.filter((o) => !categoriasReales.includes(o));
  ok(
    "el desplegable no ofrece categorías inexistentes",
    inventadas.length === 0,
    inventadas.length ? `sobran: ${inventadas.join(", ")}` : `${ofrecidas.length} categorías`,
  );

  const faltan = categoriasReales.filter((c) => !ofrecidas.includes(c));
  ok(
    "el desplegable ofrece todas las categorías que existen",
    faltan.length === 0,
    faltan.length ? `faltan: ${faltan.join(", ")}` : "",
  );

  // --- Filtrar por categoría devuelve lo que corresponde ---
  if (ofrecidas.length > 0) {
    const categoria = referencia.data.categories[0];
    await selector.selectOption({ label: categoria.name });
    await page.waitForTimeout(900);

    const esperadosCat = await context.request
      .get(`${BASE}/api/v1/products`, {
        params: { categoryId: categoria.id, pageSize: "100" },
      })
      .then((r) => r.json());

    const filtradas = await filasVisibles();
    ok(
      `filtrar por "${categoria.name}" concuerda con la API`,
      filtradas === esperadosCat.data.items.length,
      `pantalla ${filtradas}, API ${esperadosCat.data.items.length}`,
    );

    await selector.selectOption({ index: 0 });
    await page.waitForTimeout(700);
  }

  // --- Botones ---
  await abre(page, "Nuevo producto", { rol: "dialog" });

  const primerMenu = page
    .getByRole("button", { name: /^Acciones para / })
    .first();
  if (await primerMenu.isVisible().catch(() => false)) {
    await primerMenu.click();
    const menuAbierto = await page
      .getByRole("menu")
      .first()
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    ok("el menú de acciones de una fila abre", menuAbierto);

    if (menuAbierto) {
      const items = await page.getByRole("menuitem").allTextContents();
      ok(
        "el menú de acciones tiene opciones",
        items.length > 0,
        items.map((i) => i.trim()).join(" · "),
      );
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  } else {
    ok("existe el menú de acciones por fila", false, "no se encontró");
  }

  // =========================================================================
  console.log("\nBUSCADOR GLOBAL");
  // =========================================================================
  await page.keyboard.press("Control+k");
  const paletaAbierta = await page
    .getByRole("dialog")
    .first()
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  ok("Ctrl+K abre el buscador global", paletaAbierta);

  if (paletaAbierta) {
    await page.keyboard.type("inven");
    await page.waitForTimeout(600);
    const texto = (await page.getByRole("dialog").first().textContent()) ?? "";
    ok(
      'buscar "inven" ofrece Inventario',
      texto.toLowerCase().includes("inventario"),
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // =========================================================================
  console.log("\nCLIENTES");
  // =========================================================================
  await page.goto(`${BASE}/clientes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  const clientes = await context.request
    .get(`${BASE}/api/v1/customers`, { params: { pageSize: "100" } })
    .then((r) => r.json());

  const filasClientes = await page.locator("tbody tr").count();
  ok(
    "la tabla de clientes concuerda con la API",
    filasClientes === clientes.data.items.length,
    `pantalla ${filasClientes}, API ${clientes.data.items.length}`,
  );

  await abre(page, "Nuevo cliente", { rol: "dialog" });

  // =========================================================================
  console.log("\nCONFIGURACIÓN");
  // =========================================================================
  await page.goto(`${BASE}/configuracion`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  const tasas = await context.request
    .get(`${BASE}/api/v1/settings/tax-rates`)
    .then((r) => r.json());

  for (const tasa of tasas.data) {
    const visible = await page
      .getByText(tasa.name, { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    ok(`la tasa "${tasa.name}" aparece en pantalla`, visible);
  }

  const metodos = await context.request
    .get(`${BASE}/api/v1/settings/payment-methods`)
    .then((r) => r.json());

  for (const metodo of metodos.data) {
    const visible = await page
      .getByText(metodo.name, { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    ok(`el método "${metodo.name}" aparece en pantalla`, visible);
  }

  // =========================================================================
  console.log("\nUSUARIOS");
  // =========================================================================
  await page.goto(`${BASE}/usuarios`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  const usuarios = await context.request
    .get(`${BASE}/api/v1/users`)
    .then((r) => r.json());

  const filasUsuarios = await page.locator("tbody tr").count();
  ok(
    "la tabla de usuarios concuerda con la API",
    filasUsuarios === usuarios.data.length,
    `pantalla ${filasUsuarios}, API ${usuarios.data.length}`,
  );

  await abre(page, "Nuevo usuario", { rol: "dialog" });

  // =========================================================================
  console.log("\nVENTAS");
  // =========================================================================
  await page.goto(`${BASE}/ventas`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  const ventas = await context.request
    .get(`${BASE}/api/v1/sales`, { params: { pageSize: "100" } })
    .then((r) => r.json());

  const filasVentas = await page.locator("tbody tr").count();
  ok(
    "la tabla de ventas concuerda con la API",
    filasVentas === ventas.data.items.length,
    `pantalla ${filasVentas}, API ${ventas.data.items.length}`,
  );

  // =========================================================================
  console.log("\nENLACES DEL MENÚ");
  // =========================================================================
  const enlaces = await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link")
    .all();

  ok("el menú tiene enlaces", enlaces.length > 0, `${enlaces.length} enlaces`);

  for (const enlace of enlaces) {
    const nombre = (await enlace.textContent())?.trim() ?? "?";
    const destino = await enlace.getAttribute("href");
    if (!destino) continue;

    const res = await context.request.get(`${BASE}${destino}`);
    ok(
      `"${nombre}" (${destino}) responde`,
      res.status() === 200,
      `HTTP ${res.status()}`,
    );
  }

  // =========================================================================
  await browser.close();

  const unicos = [...new Set(erroresConsola)];
  if (unicos.length > 0) {
    console.log("\nERRORES DE CONSOLA:");
    for (const e of unicos.slice(0, 8)) console.log(`  · ${e.slice(0, 150)}`);
    fallos += unicos.length;
  }

  console.log(
    fallos === 0
      ? `\n✓ ${comprobaciones} comprobaciones, todas en verde`
      : `\n✗ ${fallos} de ${comprobaciones} fallaron`,
  );
  if (fallos > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
