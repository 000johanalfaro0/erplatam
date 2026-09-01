/**
 * API pública del módulo `auth`.
 *
 * REGLA DE MODULARIDAD (requisito del cliente): ningún otro módulo puede
 * importar archivos internos de este directorio. Solo lo que se re-exporta
 * aquí. Así, reescribir la implementación de sesiones — cambiar bcrypt por
 * argon2, o pasar a un proveedor externo — no obliga a tocar ni una línea del
 * resto del sistema.
 */

export {
  changePassword,
  getCurrentUser,
  login,
  register,
  logout,
  type LoginResult,
} from "./service";

export {
  SESSION_COOKIE_NAME,
  createSession,
  resolveSession,
  revokeAllUserSessions,
  revokeSession,
  type CreatedSession,
  type ResolvedSession,
} from "./session";

export {
  hashPassword,
  verifyPassword,
  PASSWORD_MIN_LENGTH,
  describePasswordRules,
} from "./password";

export {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  passwordSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
} from "./schema";
