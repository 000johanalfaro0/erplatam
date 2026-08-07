"use client";

import * as React from "react";

import type { FormatSettings } from "@/lib/format";
import { hasPermission } from "@/server/core/permissions";

/**
 * Sesión del lado del cliente.
 *
 * El servidor ya resolvió quién es el usuario antes de renderizar el layout
 * protegido, así que los datos llegan como props desde un Server Component —
 * no hay parpadeo de "cargando sesión" ni una petición extra al arrancar.
 *
 * Nota importante sobre `can()`: sirve para OCULTAR controles que el usuario
 * no puede usar. NO es una medida de seguridad. La autorización real ocurre en
 * el servidor, en cada servicio de dominio. Ocultar un botón solo evita que el
 * usuario descubra por error que no tiene permiso.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: { key: string; name: string; permissions: string[] };
}

export interface SessionBusiness {
  id: string;
  name: string;
  settings: FormatSettings & {
    defaultTaxRateBps: number;
    pricesIncludeTax: boolean;
    allowNegativeStock: boolean;
    lowStockThreshold: number;
  };
}

interface SessionValue {
  user: SessionUser;
  business: SessionBusiness;
  /** Configuración de formato (moneda, locale, zona horaria). */
  formatSettings: FormatSettings;
  can: (permission: string) => boolean;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({
  user,
  business,
  children,
}: {
  user: SessionUser;
  business: SessionBusiness;
  children: React.ReactNode;
}) {
  const value = React.useMemo<SessionValue>(
    () => ({
      user,
      business,
      formatSettings: {
        currency: business.settings.currency,
        locale: business.settings.locale,
        timezone: business.settings.timezone,
      },
      can: (permission: string) =>
        hasPermission(user.role.permissions, permission),
    }),
    [user, business],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const context = React.useContext(SessionContext);
  if (!context) {
    throw new Error(
      "useSession debe usarse dentro de <SessionProvider>. " +
        "Comprueba que el componente esté bajo el layout protegido.",
    );
  }
  return context;
}

/** Atajo para formatear importes con la configuración del negocio. */
export function useFormatSettings(): FormatSettings {
  return useSession().formatSettings;
}

/** Atajo para condicionar la interfaz a un permiso. */
export function useCan(permission: string): boolean {
  return useSession().can(permission);
}
