"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { useBrand } from "../theme-switcher";
import { NAVIGATION } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { useSession } from "../session-provider";

/**
 * Navegación lateral.
 *
 * Las entradas se filtran por permiso: un cajero no ve "Auditoría", y no
 * porque esté desactivada, sino porque no existe para él. Enseñar puertas
 * cerradas solo genera preguntas.
 */

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  onNavigate,
  className,
}: {
  /** Se invoca al navegar. En móvil sirve para cerrar el panel. */
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const { can, business } = useSession();
  const marca = useBrand();

  const sections = React.useMemo(
    () =>
      NAVIGATION.map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !item.permission || can(item.permission),
        ),
      })).filter((section) => section.items.length > 0),
    [can],
  );

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r border-line bg-surface",
        className,
      )}
    >
      {/* Identidad del negocio */}
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        {/* Icono de la direccion visual activa, no la inicial en un cuadrado. */}
        <div
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink [&_svg]:size-4"
          dangerouslySetInnerHTML={{ __html: marca.icono }}
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight text-ink">
            {business.name}
          </p>
          <p className="truncate text-[11px] leading-tight text-ink-subtle">
            {marca.descriptor}
          </p>
        </div>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto px-2.5 py-3">
        {sections.map((section, index) => (
          <div key={section.label ?? `s-${index}`} className={index > 0 ? "mt-5" : ""}>
            {section.label && (
              <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                {section.label}
              </p>
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      // aria-current es lo que permite a un lector de pantalla
                      // — y a una prueba automatizada — saber en qué sección
                      // está el usuario sin inspeccionar clases CSS.
                      aria-current={active ? "page" : undefined}
                      data-tour={item.tourId}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors duration-150",
                        active
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-accent" : "text-ink-subtle",
                        )}
                        aria-hidden
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
