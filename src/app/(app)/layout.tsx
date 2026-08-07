import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { QueryHydrator } from "@/components/query-hydrator";
import { SessionProvider } from "@/components/session-provider";
import { getOptionalContext } from "@/server/http/context";
import { getCurrentUser } from "@/server/modules/auth";
import { getReferenceData } from "@/server/modules/reference";

/**
 * Layout protegido.
 *
 * Aquí se resuelve la sesión en el SERVIDOR antes de renderizar nada. Dos
 * consecuencias:
 *
 *   1. Seguridad real: sin sesión válida no se envía ni un byte de la
 *      aplicación al navegador. No es un "ocultar con CSS" ni una
 *      redirección tardía en el cliente.
 *   2. Sin parpadeo: el usuario y la configuración del negocio llegan ya
 *      resueltos al primer render, así que no hay estado intermedio de
 *      "cargando sesión".
 *
 * El middleware también protege estas rutas, pero eso es defensa en
 * profundidad: la comprobación que manda es esta, porque es la que consulta la
 * base de datos y detecta sesiones revocadas.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getOptionalContext();

  if (!ctx) {
    redirect("/login");
  }

  /*
   * El usuario y los catálogos de referencia se piden EN PARALELO y en el
   * mismo viaje que ya se estaba haciendo para validar la sesión.
   *
   * Los catálogos los necesita casi toda pantalla —los desplegables de
   * categoría, proveedor, impuesto y método de pago—, y antes cada una los
   * pedía por su cuenta al montarse. Eso añadía ~300 ms antes de poder pintar
   * cualquier formulario. Aquí son gratis.
   */
  const [user, reference] = await Promise.all([
    getCurrentUser(ctx),
    getReferenceData(ctx),
  ]);

  if (!user.business.settings) {
    // Estado imposible salvo que falte el seed. Mejor un mensaje claro que un
    // error de propiedad indefinida tres componentes más abajo.
    throw new Error(
      "El negocio no tiene configuración inicializada. Ejecuta `npm run db:seed`.",
    );
  }

  return (
    <SessionProvider
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: {
          key: user.role.key,
          name: user.role.name,
          permissions: user.role.permissions,
        },
      }}
      business={{
        id: user.business.id,
        name: user.business.name,
        settings: user.business.settings,
      }}
    >
      <QueryHydrator reference={reference}>
        <AppShell>{children}</AppShell>
      </QueryHydrator>
    </SessionProvider>
  );
}
