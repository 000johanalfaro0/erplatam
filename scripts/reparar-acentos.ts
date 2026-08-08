import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Repara nombres con el carácter de reemplazo de Unicode (U+FFFD, "�").
 *
 * QUÉ PASÓ: algunos registros se crearon durante pruebas desde una consola
 * que no mandaba UTF-8. El servidor recibió bytes inválidos, los decodificó
 * como pudo y guardó "Mar�a" en lugar de "María". No es un fallo de pintado:
 * el carácter original ya no está en la base. Es pérdida de datos, pequeña
 * pero real.
 *
 * QUÉ HACE ESTE GUION:
 *
 *   1. Busca "�" en los nombres de clientes, proveedores, categorías y
 *      productos.
 *   2. Si existe otro registro sano cuyo nombre coincide salvo por los
 *      caracteres rotos, el roto es un duplicado de prueba y se archiva.
 *   3. Si no lo hay, aplica el arreglo del diccionario de abajo.
 *   4. Lo que no sepa arreglar, lo dice y no lo toca. Adivinar la letra
 *      original sería inventarse el dato del cliente.
 *
 * Se puede ejecutar las veces que haga falta: sobre datos sanos no hace nada.
 */

/** Nombre roto → nombre correcto. Se amplía si aparece alguno nuevo. */
const ARREGLOS: Record<string, string> = {
  "Ferreter�a del Norte SA de CV": "Ferretería del Norte SA de CV",
  "Mar�a Gonz�lez": "María González",
};

const ROTO = "�";

/** "Mar�a" y "María" son el mismo nombre a efectos de comparación. */
function esqueleto(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(new RegExp(ROTO, "g"), "?")
    .toLowerCase();
}

function coincideSalvoRotos(roto: string, sano: string): boolean {
  if (roto.length !== sano.length) return false;
  for (let i = 0; i < roto.length; i++) {
    if (roto[i] === ROTO) continue;
    if (esqueleto(roto[i]) !== esqueleto(sano[i])) return false;
  }
  return true;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const soloVer = !process.argv.includes("--aplicar");
  let tocados = 0;
  let sinResolver = 0;

  try {
    /**
     * Los cuatro modelos comparten `id`, `name` y `deletedAt`, pero sus tipos
     * generados son distintos y la unión no es invocable. Se describen con la
     * forma mínima que este guion necesita, que además documenta qué se
     * espera de cada tabla.
     */
    interface ModeloConNombre {
      findMany(args: {
        select: { id: true; name: true; deletedAt: true };
      }): Promise<{ id: string; name: string; deletedAt: Date | null }[]>;
      update(args: {
        where: { id: string };
        data: { name?: string; deletedAt?: Date };
      }): Promise<unknown>;
    }

    const tablas: { nombre: string; modelo: ModeloConNombre }[] = [
      { nombre: "clientes", modelo: prisma.customer as unknown as ModeloConNombre },
      { nombre: "proveedores", modelo: prisma.supplier as unknown as ModeloConNombre },
      { nombre: "categorías", modelo: prisma.category as unknown as ModeloConNombre },
      { nombre: "productos", modelo: prisma.product as unknown as ModeloConNombre },
    ];

    for (const tabla of tablas) {
      const filas = await tabla.modelo.findMany({
        select: { id: true, name: true, deletedAt: true },
      });

      const rotas = filas.filter((f) => f.name.includes(ROTO));
      if (rotas.length === 0) continue;

      console.log(`\n${tabla.nombre.toUpperCase()}`);

      for (const fila of rotas) {
        const gemelaSana = filas.find(
          (o) =>
            o.id !== fila.id &&
            !o.name.includes(ROTO) &&
            o.deletedAt === null &&
            coincideSalvoRotos(fila.name, o.name),
        );

        if (gemelaSana) {
          console.log(
            `  duplicado  "${fila.name}"  →  ya existe "${gemelaSana.name}", se archiva`,
          );
          if (!soloVer && fila.deletedAt === null) {
            await tabla.modelo.update({
              where: { id: fila.id },
              data: { deletedAt: new Date() },
            });
          }
          tocados += 1;
          continue;
        }

        const arreglo = ARREGLOS[fila.name];
        if (arreglo) {
          console.log(`  reparado   "${fila.name}"  →  "${arreglo}"`);
          if (!soloVer) {
            await tabla.modelo.update({
              where: { id: fila.id },
              data: { name: arreglo },
            });
          }
          tocados += 1;
          continue;
        }

        console.log(
          `  SIN ARREGLO "${fila.name}"  →  añádelo al diccionario de este guion`,
        );
        sinResolver += 1;
      }
    }

    if (tocados === 0 && sinResolver === 0) {
      console.log("\n✓ No hay nombres rotos.");
    } else {
      console.log(
        `\n${soloVer ? "· Simulación." : "✓ Aplicado."}  ${tocados} arreglados, ${sinResolver} sin resolver.`,
      );
      if (soloVer) console.log("  Para aplicarlo: --aplicar");
    }

    if (sinResolver > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
