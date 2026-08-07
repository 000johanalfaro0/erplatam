"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import {
  LogOut,
  Menu,
  Moon,
  Sun,
  User as UserIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FeedbackLayer } from "@/modules/feedback/feedback-layer";
import { GuidedTour } from "@/modules/tour/guided-tour";

import { ThemeSwitcher } from "../theme-switcher";

import { useSession } from "../session-provider";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Modal,
} from "../ui/overlay";
import { GlobalSearch } from "./global-search";
import { Sidebar } from "./sidebar";

/**
 * Estructura visual de la aplicación.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ Logo       Buscar...             Usuario     │
 *   ├──────────────┬───────────────────────────────┤
 *   │ Navegación   │          CONTENIDO            │
 *   └──────────────┴───────────────────────────────┘
 *
 * En escritorio la barra lateral es fija. Por debajo de `lg` se convierte en
 * un panel deslizante, porque en tablet 240px de menú permanente se comen el
 * espacio que necesita una tabla de inventario.
 */

function useTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const stored = localStorage.getItem("erp-theme");
    const preferred =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    setTheme(preferred);
    document.documentElement.dataset.theme = preferred;
  }, []);

  const toggle = React.useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("erp-theme", next);
      return next;
    });
  }, []);

  return { theme, toggle };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, business } = useSession();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { theme, toggle } = useTheme();
  const router = useRouter();

  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      // `replace` y no `push`: volver atrás no debe devolver a una pantalla
      // autenticada con datos en caché.
      router.replace("/login");
      router.refresh();
    },
    onError: () => toast.error("No pudimos cerrar la sesión. Inténtalo de nuevo."),
  });

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {/* Barra lateral fija — escritorio */}
      <Sidebar className="hidden lg:flex" />

      {/* Barra lateral deslizante — tablet y móvil */}
      <Modal open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-y-0 left-0 z-50 lg:hidden",
              "duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
              "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
            )}
          >
            <DialogPrimitive.Title className="sr-only">
              Navegación
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Secciones disponibles del sistema
            </DialogPrimitive.Description>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Modal>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Abrir navegación"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>

          <GlobalSearch />

          <div className="ml-auto flex items-center gap-1">
            <ThemeSwitcher />
            <GuidedTour />

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label={
                theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
              }
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Menú de usuario"
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-sunken"
                >
                  <span
                    aria-hidden
                    className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent"
                  >
                    {initials}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-32 truncate text-[13px] font-medium leading-tight text-ink">
                      {user.name}
                    </span>
                    <span className="block text-[11px] leading-tight text-ink-subtle">
                      {user.role.name}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {user.name}
                  </span>
                  <span className="block truncate font-normal text-ink-subtle">
                    {user.email}
                  </span>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem onSelect={() => router.push("/cuenta")}>
                  <UserIcon />
                  Mi cuenta
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  tone="danger"
                  onSelect={() => logout.mutate()}
                  aria-label="Cerrar sesión"
                >
                  <LogOut />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Contenido */}
        <main
          id="contenido"
          className="scroll-slim min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {/*
        Capa de anotaciones. Vive fuera del <main> para que su barra flotante
        no se vea afectada por el desplazamiento del contenido.
      */}
      <FeedbackLayer />

      {/* Nombre del negocio para lectores de pantalla al entrar */}
      <span className="sr-only">{business.name}</span>
    </div>
  );
}
