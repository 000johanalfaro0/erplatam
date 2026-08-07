import bcrypt from "bcryptjs";

/**
 * Hashing de contraseñas.
 *
 * Algoritmo: bcrypt con coste 10.
 *
 * Por qué bcrypt y no argon2, que es la recomendación actual:
 * `bcryptjs` es JavaScript puro, sin binarios nativos. Eso significa que
 * funciona idéntico en Windows (desarrollo) y en las funciones serverless de
 * Vercel (producción), sin compilación cruzada ni sorpresas en el despliegue.
 * Para un MVP, esa previsibilidad vale más que el margen de seguridad extra.
 *
 * Por qué coste 10 y no 12: al ser JS puro, bcrypt es ~4× más lento que la
 * implementación nativa. Coste 12 añadiría cerca de un segundo a cada inicio
 * de sesión. Coste 10 mantiene el hashing en el orden de 200-300 ms, que sigue
 * siendo inviable para fuerza bruta y no degrada la experiencia.
 *
 * Ruta de mejora documentada en docs/security.md: migrar a `@node-rs/argon2`
 * cuando el proyecto salga de MVP. El campo `passwordHash` guarda el prefijo
 * del algoritmo, así que se pueden rehashear las contraseñas al vuelo en el
 * siguiente inicio de sesión de cada usuario, sin forzar un cambio masivo.
 */

const COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/**
 * Verifica una contraseña.
 *
 * `bcrypt.compare` es de tiempo constante respecto al contenido del hash, así
 * que no filtra información por temporización.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // Un hash corrupto en base de datos no debe tumbar el login: se trata
    // como contraseña incorrecta y el intento queda en la bitácora.
    return false;
  }
}

/**
 * Hash de descarte con el mismo coste que uno real.
 *
 * Se ejecuta cuando el email no existe, para que un atacante no distinga
 * "usuario inexistente" de "contraseña incorrecta" midiendo el tiempo de
 * respuesta. Sin esto, enumerar cuentas válidas es trivial.
 */
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function wastePasswordTime(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
}

/** Reglas mínimas de contraseña. Se validan también con Zod en la capa HTTP. */
export const PASSWORD_MIN_LENGTH = 8;

export function describePasswordRules(): string {
  return `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con al menos una letra y un número.`;
}
