import { requireContext } from "@/server/http/context";
import { ok, route } from "@/server/http/response";
import { getCurrentUser } from "@/server/modules/auth";

/**
 * GET /api/v1/auth/me
 *
 * Devuelve el usuario autenticado junto con sus permisos y la configuración
 * del negocio (moneda, zona horaria, impuestos). La interfaz lo consulta una
 * vez al arrancar y lo mantiene en caché: evita que cada componente tenga que
 * pedir la configuración por su cuenta.
 */
export const GET = route(async () => {
  const ctx = await requireContext();
  const user = await getCurrentUser(ctx);

  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    lastLoginAt: user.lastLoginAt,
    role: {
      key: user.role.key,
      name: user.role.name,
      permissions: user.role.permissions,
    },
    business: {
      id: user.business.id,
      name: user.business.name,
      settings: user.business.settings,
    },
  });
});
