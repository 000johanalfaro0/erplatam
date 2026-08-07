import "dotenv/config";

import { chromium, type APIRequestContext } from "@playwright/test";

/**
 * Verificación de extremo a extremo de usuarios y configuración.
 *
 * No comprueba que las pantallas pinten —eso ya lo hace
 * `screenshot-pantallas.ts`—, sino que las reglas de negocio se cumplan
 * contra la base de datos real:
 *
 *   1. Se puede crear un cajero y entrar con él.
 *   2. Un cajero NO puede leer usuarios ni configuración (RBAC de verdad,
 *      no solo el menú oculto).
 *   3. Desactivar a alguien le cierra la sesión al instante.
 *   4. Un usuario desactivado no puede volver a entrar.
 *   5. Nadie puede desactivarse a sí mismo.
 *   6. No se puede archivar una tasa de impuesto que usan productos.
 *
 * Deja el sistema como lo encontró: el cajero de prueba se queda
 * desactivado y con un correo reconocible.
 */

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@erp.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";

const CAJERO_EMAIL = `prueba.cajero.${Date.now()}@erp.local`;
const CAJERO_PASSWORD = "Cajero2026x";

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(`${condicion ? "✓" : "✗"} ${descripcion}${detalle ? `  — ${detalle}` : ""}`);
  if (!condicion) fallos += 1;
}

async function entrar(api: APIRequestContext, email: string, password: string) {
  const res = await api.post(`${BASE}/api/v1/auth/login`, {
    data: { email, password },
  });
  return { ok: res.ok(), status: res.status() };
}

async function main() {
  const browser = await chromium.launch();

  // Cada persona necesita su propio contexto: las cookies de sesión no se
  // pueden compartir o estaríamos probando otra cosa.
  const admin = await browser.newContext();
  const cajero = await browser.newContext();

  // --- 1. El administrador entra y crea un cajero --------------------------
  const login = await entrar(admin.request, ADMIN_EMAIL, ADMIN_PASSWORD);
  comprobar("el administrador entra", login.ok, `HTTP ${login.status}`);
  if (!login.ok) {
    await browser.close();
    process.exitCode = 1;
    return;
  }

  const roles = await admin.request
    .get(`${BASE}/api/v1/users/roles`)
    .then((r) => r.json());

  const rolCajero = roles.data.find(
    (r: { key: string }) => r.key === "EMPLOYEE",
  );
  comprobar("existe el rol de cajero", Boolean(rolCajero));

  const creado = await admin.request.post(`${BASE}/api/v1/users`, {
    data: {
      name: "Cajero de prueba",
      email: CAJERO_EMAIL,
      password: CAJERO_PASSWORD,
      roleId: rolCajero.id,
    },
  });

  comprobar("se crea el cajero", creado.ok(), `HTTP ${creado.status()}`);
  const cajeroId = creado.ok() ? (await creado.json()).data.id : null;

  // --- 2. El cajero entra, pero no ve lo que no le toca --------------------
  const loginCajero = await entrar(cajero.request, CAJERO_EMAIL, CAJERO_PASSWORD);
  comprobar("el cajero entra con su contraseña", loginCajero.ok);

  const usuariosProhibido = await cajero.request.get(`${BASE}/api/v1/users`);
  comprobar(
    "el cajero NO puede listar usuarios",
    usuariosProhibido.status() === 403,
    `HTTP ${usuariosProhibido.status()}`,
  );

  const configProhibida = await cajero.request.get(`${BASE}/api/v1/settings`);
  comprobar(
    "el cajero NO puede leer la configuración",
    configProhibida.status() === 403,
    `HTTP ${configProhibida.status()}`,
  );

  const ventasPermitido = await cajero.request.get(`${BASE}/api/v1/sales`);
  comprobar(
    "el cajero SÍ puede ver ventas",
    ventasPermitido.ok(),
    `HTTP ${ventasPermitido.status()}`,
  );

  // --- 3. Nadie se desactiva a sí mismo ------------------------------------
  const yo = await admin.request
    .get(`${BASE}/api/v1/auth/me`)
    .then((r) => r.json());

  const yoMismo = await admin.request.patch(
    `${BASE}/api/v1/users/${yo.data.id}`,
    { data: { status: "INACTIVE" } },
  );
  comprobar(
    "el administrador NO puede desactivarse a sí mismo",
    yoMismo.status() === 400 || yoMismo.status() === 422,
    `HTTP ${yoMismo.status()}`,
  );

  // --- 4. Desactivar corta la sesión en el acto ----------------------------
  const desactivado = await admin.request.patch(
    `${BASE}/api/v1/users/${cajeroId}`,
    { data: { status: "INACTIVE" } },
  );
  comprobar("se desactiva al cajero", desactivado.ok());

  const sesionMuerta = await cajero.request.get(`${BASE}/api/v1/sales`);
  comprobar(
    "la sesión del cajero muere al instante",
    sesionMuerta.status() === 401,
    `HTTP ${sesionMuerta.status()}`,
  );

  const reintento = await entrar(
    await browser.newContext().then((c) => c.request),
    CAJERO_EMAIL,
    CAJERO_PASSWORD,
  );
  comprobar(
    "un usuario desactivado no puede volver a entrar",
    !reintento.ok,
    `HTTP ${reintento.status}`,
  );

  // --- 5. Una tasa en uso no se archiva ------------------------------------
  const tasas = await admin.request
    .get(`${BASE}/api/v1/settings/tax-rates`)
    .then((r) => r.json());

  const enUso = tasas.data.find(
    (t: { productCount: number; isDefault: boolean }) =>
      t.productCount > 0 && !t.isDefault,
  );

  if (enUso) {
    const archivar = await admin.request.delete(
      `${BASE}/api/v1/settings/tax-rates/${enUso.id}`,
    );
    comprobar(
      "no se puede archivar una tasa que usan productos",
      archivar.status() === 409,
      `HTTP ${archivar.status()} sobre "${enUso.name}" (${enUso.productCount} productos)`,
    );
  } else {
    console.log("· sin tasa en uso no predeterminada; se omite esa comprobación");
  }

  // --- 6. La tasa predeterminada no se archiva -----------------------------
  const predeterminada = tasas.data.find((t: { isDefault: boolean }) => t.isDefault);
  const archivarPred = await admin.request.delete(
    `${BASE}/api/v1/settings/tax-rates/${predeterminada.id}`,
  );
  comprobar(
    "no se puede archivar la tasa predeterminada",
    archivarPred.status() === 400 || archivarPred.status() === 422,
    `HTTP ${archivarPred.status()}`,
  );

  await browser.close();

  console.log(
    fallos === 0
      ? "\n✓ Todo correcto"
      : `\n✗ ${fallos} ${fallos === 1 ? "comprobación falló" : "comprobaciones fallaron"}`,
  );
  if (fallos > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
