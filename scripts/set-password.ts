import "dotenv/config";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Cambia la contraseña de un usuario.
 *
 *   npx tsx scripts/set-password.ts admin@erp.local
 *
 * La contraseña se teclea de forma OCULTA y nunca aparece en pantalla, ni en
 * el historial del shell, ni en un argumento del comando (que sería visible
 * para cualquiera que liste los procesos con `ps`).
 *
 * Al cambiarla se revocan TODAS las sesiones activas del usuario. Si el motivo
 * del cambio es que alguien más conocía la contraseña, dejar viva su sesión
 * haría inútil el cambio.
 *
 * Para producción, apuntar DATABASE_URL a la base correcta:
 *   DATABASE_URL="<produccion>" npx tsx scripts/set-password.ts correo@negocio.mx
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Lee una línea sin mostrar lo que se escribe. */
function preguntarOculto(pregunta: string): Promise<string> {
  return new Promise((resolve) => {
    // Se envuelve la salida para suprimir el eco de los caracteres tecleados.
    let silenciar = false;
    const salida = new Writable({
      write(chunk, _encoding, callback) {
        if (!silenciar) process.stdout.write(chunk);
        callback();
      },
    });

    const rl = createInterface({
      input: process.stdin,
      output: salida,
      terminal: true,
    });

    rl.question(pregunta, (respuesta) => {
      silenciar = false;
      process.stdout.write("\n");
      rl.close();
      resolve(respuesta);
    });

    silenciar = true;
  });
}

/** Misma política que aplica la aplicación al crear contraseñas. */
function validar(password: string): string | null {
  if (password.length < 8) return "Debe tener al menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(password)) return "Debe incluir al menos una letra.";
  if (!/\d/.test(password)) return "Debe incluir al menos un número.";
  return null;
}

async function main() {
  const email = process.argv[2]?.toLowerCase();

  if (!email) {
    console.error("Uso: npx tsx scripts/set-password.ts <correo>");
    process.exitCode = 1;
    return;
  }

  const user = await db.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, name: true, email: true, business: { select: { name: true } } },
  });

  if (!user) {
    console.error(`✗ No existe ningún usuario con el correo ${email}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nUsuario: ${user.name} <${user.email}>`);
  console.log(`Negocio: ${user.business.name}\n`);

  const password = await preguntarOculto("Nueva contraseña (no se verá): ");
  const error = validar(password);

  if (error) {
    console.error(`✗ ${error}`);
    process.exitCode = 1;
    return;
  }

  const confirmacion = await preguntarOculto("Repítela para confirmar: ");

  if (password !== confirmacion) {
    console.error("✗ Las contraseñas no coinciden. No se cambió nada.");
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [, sesiones] = await Promise.all([
    db.user.update({
      where: { id: user.id },
      // Se limpia también el bloqueo por intentos fallidos: si estaba
      // bloqueado, cambiar la contraseña debe devolverle el acceso.
      data: { passwordHash, failedAttempts: 0, lockedUntil: null },
    }),
    db.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  console.log(`\n✓ Contraseña actualizada para ${user.email}`);
  console.log(
    `✓ ${sesiones.count} sesión(es) activa(s) revocada(s) — hay que volver a entrar en todos los dispositivos`,
  );
}

main()
  .catch((error) => {
    console.error("\n✗ Error:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
