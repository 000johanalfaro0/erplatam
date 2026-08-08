import type { RequestContext } from "@/server/core/context";
import { db } from "@/server/core/db";

/**
 * ACCESO LIBRE PARA ENSEÑAR LA DEMO
 * ===========================================================================
 * Con `DEMO_ACCESO_LIBRE` puesta al correo de un usuario, la aplicación deja
 * de pedir credenciales: cualquiera que abra la URL entra directamente como
 * ese usuario.
 *
 * ESTO ES UN AGUJERO, Y ESTÁ HECHO A PROPÓSITO
 * Sirve para enseñarle el sistema a alguien sin dictarle una contraseña por
 * teléfono. Fuera de ese momento, no debería estar puesta. Tres decisiones
 * la hacen lo menos peligrosa posible:
 *
 *   1. APAGADA POR DEFECTO. Sin la variable, no existe. No hay una casilla
 *      en ninguna pantalla que alguien pueda dejarse marcada sin querer:
 *      encenderla exige entrar en Vercel a propósito.
 *
 *   2. ENTRA COMO EL USUARIO QUE SE LE DIGA, NO COMO ADMINISTRADOR. Lo
 *      recomendado es un "Invitado" con rol de Encargado: recorre y usa todo
 *      el sistema, pero no puede crear usuarios, cambiar el IVA ni tocar la
 *      configuración. Quien mira la demo no necesita nada de eso, y así una
 *      visita curiosa no puede dejar el negocio sin administradores.
 *
 *   3. SE VE. Mientras está activa, la aplicación muestra un aviso fijo en
 *      pantalla. Un agujero de seguridad que no se nota es el que se queda
 *      abierto seis meses.
 *
 * NO CREA SESIÓN EN BASE DE DATOS. Se construye el contexto al vuelo. Si
 * creara sesiones, cada visita dejaría una fila, y al apagar la variable
 * seguirían siendo válidas: el agujero sobreviviría a su propio interruptor.
 * Así, quitar la variable cierra la puerta en el acto.
 */

/** Marca reconocible en el contexto y en la bitácora. */
export const SESION_ACCESO_LIBRE = "acceso-libre";

export function accesoLibreActivo(): boolean {
  return Boolean(process.env.DEMO_ACCESO_LIBRE?.trim());
}

/**
 * ¿Este contexto viene de la puerta abierta y no de unas credenciales?
 *
 * Lo usa la pantalla de acceso para NO redirigir al panel. Sin esta
 * distinción, con la puerta abierta el login redirige siempre —porque
 * siempre hay contexto— y el dueño se queda sin forma de entrar como
 * administrador en su propio sistema. Es decir: abrir la demo al público
 * dejaría fuera justo a quien la está enseñando.
 */
export function esAccesoLibre(ctx: { sessionId: string } | null): boolean {
  return ctx?.sessionId === SESION_ACCESO_LIBRE;
}

/** Contexto del usuario de acceso libre, o null si no está configurado. */
export async function contextoAccesoLibre(
  ip: string | null,
  userAgent: string | null,
): Promise<RequestContext | null> {
  const correo = process.env.DEMO_ACCESO_LIBRE?.trim().toLowerCase();
  if (!correo) return null;

  const usuario = await db.user.findFirst({
    where: { email: correo, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      businessId: true,
      role: { select: { key: true, permissions: true } },
    },
  });

  // Si el correo no existe o está desactivado, NO se degrada a "entra
  // igualmente". Se comporta como si la variable no estuviera: sin sesión.
  if (!usuario) return null;

  return {
    userId: usuario.id,
    userName: usuario.name,
    businessId: usuario.businessId,
    roleKey: usuario.role.key,
    permissions: usuario.role.permissions,
    // Identificador reconocible en la bitácora: si alguien ve esto en la
    // auditoría, sabe que esa acción vino de la puerta abierta.
    sessionId: SESION_ACCESO_LIBRE,
    ip,
    userAgent,
  };
}
