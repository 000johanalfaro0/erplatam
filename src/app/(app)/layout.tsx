import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { SessionProvider } from "@/components/session-provider";
import { getOptionalContext } from "@/server/http/context";
import { getCurrentUser } from "@/server/modules/auth";

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

  const user = await getCurrentUser(ctx);

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
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
