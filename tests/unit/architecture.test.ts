import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * TESTS DE ARQUITECTURA
 * ===========================================================================
 * Las reglas de modularidad no se sostienen con buena voluntad: se sostienen
 * porque romperlas rompe la suite.
 *
 * Estas pruebas leen el código fuente y verifican las tres reglas que
 * mantienen el sistema desacoplado. Sin ellas, la primera vez que alguien
 * tenga prisa importará el repositorio de otro módulo "solo esta vez", y en
 * seis meses todo estará entrelazado.
 */

const SRC = join(process.cwd(), "src");

function listFiles(dir: string, extensions = [".ts", ".tsx"]): string[] {
  const out: string[] = [];

  function walk(current: string) {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);

      // El cliente generado por Prisma no es código nuestro.
      if (entry === "generated" || entry === "node_modules") continue;

      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (extensions.some((ext) => entry.endsWith(ext))) {
        out.push(full);
      }
    }
  }

  walk(dir);
  return out;
}

function importsOf(file: string): string[] {
  const content = readFileSync(file, "utf8");
  const matches = content.matchAll(/from\s+["']([^"']+)["']/g);
  return [...matches].map((match) => match[1]);
}

describe("Regla 1 — encapsulación entre módulos", () => {
  it("ningún módulo importa los internos de otro módulo", () => {
    /*
     * Permitido:   import { createSale } from "@/server/modules/sales"
     * Prohibido:   import { ... } from "@/server/modules/sales/service"
     *
     * Motivo: mientras los cruces pasen por el `index.ts`, reescribir las
     * entrañas de un módulo no puede romper a los demás. En cuanto alguien
     * importa un archivo interno, ese archivo se vuelve parte del contrato
     * público sin que nadie lo haya decidido.
     */
    const violaciones: string[] = [];

    for (const file of listFiles(join(SRC, "server", "modules"))) {
      const propio = relative(join(SRC, "server", "modules"), file).split(
        /[\\/]/,
      )[0];

      for (const spec of importsOf(file)) {
        const match = spec.match(/^@\/server\/modules\/([^/]+)\/(.+)$/);
        if (!match) continue;

        const [, modulo] = match;
        // Dentro del propio módulo sí se puede importar cualquier archivo.
        if (modulo === propio) continue;

        violaciones.push(
          `${relative(SRC, file)} importa "${spec}" — debe usar "@/server/modules/${modulo}"`,
        );
      }
    }

    expect(violaciones, violaciones.join("\n")).toEqual([]);
  });

  it("todo módulo tiene su index.ts como puerta de entrada", () => {
    const modulesDir = join(SRC, "server", "modules");
    const sinIndex = readdirSync(modulesDir).filter((name) => {
      const full = join(modulesDir, name);
      if (!statSync(full).isDirectory()) return false;
      return !readdirSync(full).includes("index.ts");
    });

    expect(
      sinIndex,
      `Módulos sin index.ts: ${sinIndex.join(", ")}`,
    ).toEqual([]);
  });
});

describe("Regla 2 — el dominio no conoce el framework", () => {
  it("core/ y modules/ no importan nada de Next.js", () => {
    /*
     * Es lo que hace que `src/server/` sea portable: si mañana hiciera falta
     * un backend independiente (Fastify, NestJS, una cola de trabajos), la
     * lógica de negocio se mueve tal cual y solo se reescribe la capa HTTP.
     *
     * El único sitio que puede tocar Next es `src/server/http/`, que es
     * precisamente la capa de transporte.
     */
    const violaciones: string[] = [];

    for (const dir of ["core", "modules"]) {
      for (const file of listFiles(join(SRC, "server", dir))) {
        for (const spec of importsOf(file)) {
          if (spec === "next" || spec.startsWith("next/")) {
            violaciones.push(`${relative(SRC, file)} importa "${spec}"`);
          }
        }
      }
    }

    expect(violaciones, violaciones.join("\n")).toEqual([]);
  });

  it("el dominio no importa componentes de interfaz", () => {
    const violaciones: string[] = [];

    for (const dir of ["core", "modules"]) {
      for (const file of listFiles(join(SRC, "server", dir))) {
        for (const spec of importsOf(file)) {
          if (
            spec.startsWith("@/components") ||
            spec.startsWith("@/modules") ||
            spec === "react"
          ) {
            violaciones.push(`${relative(SRC, file)} importa "${spec}"`);
          }
        }
      }
    }

    expect(violaciones, violaciones.join("\n")).toEqual([]);
  });
});

/**
 * Resuelve un especificador de import a una ruta de archivo real.
 *
 * Maneja DOS formas, y ambas son imprescindibles:
 *
 *   - Alias:     "@/server/core/db"
 *   - Relativo:  "./db", "../core/db"
 *
 * La primera versión de esta función solo seguía los alias, y por eso el test
 * pasaba pese a existir la violación: la cadena real era
 * `lib/audit-labels` → `@/server/core/audit` → `./db`, y ese último salto
 * relativo era invisible. Un test que no puede fallar no prueba nada.
 *
 * Devuelve null para dependencias externas (react, zod…), que no interesan.
 */
function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;

  if (spec.startsWith("@/")) {
    base = join(SRC, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = join(dirname(fromFile), spec);
  } else {
    return null;
  }

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Siguiente candidato.
    }
  }
  return null;
}

/**
 * Sigue la cadena de importaciones desde un archivo y devuelve todo lo que
 * acaba alcanzando, directa o indirectamente.
 */
function transitiveImports(entry: string): Map<string, string[]> {
  const alcanzado = new Map<string, string[]>();
  const pendientes: { file: string; ruta: string[] }[] = [
    { file: entry, ruta: [] },
  ];

  while (pendientes.length > 0) {
    const { file, ruta } = pendientes.pop()!;
    if (alcanzado.has(file)) continue;
    alcanzado.set(file, ruta);

    let specs: string[];
    try {
      specs = importsOf(file);
    } catch {
      continue;
    }

    for (const spec of specs) {
      const resolved = resolveImport(spec, file);
      if (resolved && !alcanzado.has(resolved)) {
        pendientes.push({
          file: resolved,
          ruta: [...ruta, relative(SRC, file)],
        });
      }
    }
  }

  return alcanzado;
}

describe("Regla 3 — el cliente no accede a la base de datos", () => {
  it("ningún componente de cliente alcanza el cliente de base de datos, ni siquiera de forma indirecta", () => {
    /*
     * ESTE TEST NACIÓ DE UN BUG REAL.
     *
     * La pantalla de auditoría devolvía 500. La cadena era:
     *
     *   auditoria/page.tsx ("use client")
     *     → lib/audit-labels        (traducir verbos a español)
     *       → server/core/audit     (donde vivían las constantes)
     *         → server/core/db      (porque audit.ts escribe)
     *           → Prisma en el bundle del navegador
     *
     * La versión anterior de este test solo miraba importaciones DIRECTAS, así
     * que no vio nada. Compilaba sin errores. El único síntoma era un 500 al
     * abrir la pantalla.
     *
     * Ahora se sigue la cadena completa.
     */
    const prohibido = join(SRC, "server", "core", "db.ts");
    const violaciones: string[] = [];

    const clientDirs = [
      join(SRC, "app"),
      join(SRC, "components"),
      join(SRC, "modules"),
    ];

    for (const dir of clientDirs) {
      for (const file of listFiles(dir)) {
        const content = readFileSync(file, "utf8");
        if (!/^["']use client["']/m.test(content)) continue;

        const alcanzado = transitiveImports(file);

        if (alcanzado.has(prohibido)) {
          const cadena = [...(alcanzado.get(prohibido) ?? []), "server/core/db.ts"];
          violaciones.push(
            `${relative(SRC, file)} alcanza la base de datos:\n    ${cadena.join("\n    → ")}`,
          );
        }
      }
    }

    expect(violaciones, `\n${violaciones.join("\n\n")}`).toEqual([]);
  });
});

describe("Regla 3 (bis) — importaciones directas", () => {
  it("ningún componente de interfaz importa el cliente de base de datos", () => {
    /*
     * Un `import { db }` en un componente marcado con "use client" no falla al
     * compilar de forma evidente, pero mete el cliente de Prisma en el bundle
     * del navegador. En el mejor caso hincha la descarga; en el peor, expone
     * la cadena de conexión.
     *
     * Se permite en Server Components (páginas sin "use client"), que sí
     * corren en el servidor.
     */
    const violaciones: string[] = [];

    for (const dir of ["components", "modules", "lib"]) {
      for (const file of listFiles(join(SRC, dir))) {
        const content = readFileSync(file, "utf8");
        const esCliente = /^["']use client["']/m.test(content);
        if (!esCliente) continue;

        for (const spec of importsOf(file)) {
          if (
            spec === "@/server/core/db" ||
            spec.startsWith("@/server/modules/")
          ) {
            // Importar solo TIPOS o funciones puras sí es válido y útil:
            // el punto de venta reutiliza las funciones de cálculo del
            // servidor precisamente para que los totales coincidan.
            const esPuro =
              spec === "@/server/core/pricing" ||
              spec === "@/server/core/money" ||
              spec === "@/server/core/permissions";
            if (esPuro) continue;

            violaciones.push(`${relative(SRC, file)} importa "${spec}"`);
          }
        }
      }
    }

    expect(violaciones, violaciones.join("\n")).toEqual([]);
  });
});
