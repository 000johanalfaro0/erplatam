"use client";

import { TooltipProvider } from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Toaster } from "sonner";

import { ApiError, setUnauthenticatedHandler } from "@/lib/api";

/**
 * Proveedores globales del cliente.
 *
 * TanStack Query se encarga de la caché, la deduplicación de peticiones y la
 * revalidación. Sin él, cada pantalla acabaría con su propio `useEffect` +
 * `useState` + control de carga y error: mucho código repetido y muchos
 * estados inconsistentes.
 */

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Un ERP con varias cajas activas necesita datos frescos. 15 segundos
        // es suficiente para no machacar el servidor y lo bastante corto para
        // que el inventario que ve un cajero no esté desfasado.
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        // Reintentar un 401 o un 403 no tiene sentido: el resultado será el
        // mismo y solo añade latencia antes de mostrar el error.
        retry: (failureCount, error) => {
          // Reintentar un error determinista no cambia el resultado: solo
          // retrasa el mensaje que el usuario necesita ver.
          const noRetry = [
            "UNAUTHENTICATED",
            "INVALID_CREDENTIALS",
            "FORBIDDEN",
            "NOT_FOUND",
            "VALIDATION_ERROR",
            "CONFLICT",
            "INSUFFICIENT_STOCK",
            "BUSINESS_RULE",
          ];

          if (error instanceof ApiError && noRetry.includes(error.code)) {
            return false;
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: true,
      },
      mutations: {
        // Las mutaciones NUNCA se reintentan solas: reintentar un cobro podría
        // duplicar una venta. La idempotencia se resuelve explícitamente en el
        // módulo de ventas, no con reintentos ciegos.
        retry: false,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  // `useState` con inicializador perezoso: el cliente se crea una sola vez por
  // montaje, no en cada render.
  const [queryClient] = React.useState(createQueryClient);
  const router = useRouter();

  React.useEffect(() => {
    // Cuando el servidor responde 401 (sesión caducada o revocada), se lleva
    // al usuario al login desde un único sitio.
    setUnauthenticatedHandler(() => {
      queryClient.clear();
      router.replace("/login?expirada=1");
    });
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300} skipDelayDuration={150}>
        {children}
        <Toaster
          position="bottom-right"
          // Discreto y consistente con el sistema de diseño; sin colores
          // chillones ni iconos gigantes.
          toastOptions={{
            classNames: {
              toast:
                "!bg-surface-raised !border-line !text-ink !shadow-overlay !rounded-md",
              description: "!text-ink-muted",
              actionButton: "!bg-accent !text-accent-ink",
            },
          }}
          duration={4000}
          closeButton
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
