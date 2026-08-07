"use client";

import { useQuery } from "@tanstack/react-query";
import { Package, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { ALL_NAV_ITEMS } from "@/config/navigation";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useSession } from "../session-provider";
import { Modal } from "../ui/overlay";
import * as DialogPrimitive from "@radix-ui/react-dialog";

/**
 * Búsqueda global (Ctrl+K / ⌘K).
 *
 * Combina dos fuentes:
 *   1. Secciones de la aplicación — resultado inmediato, sin red.
 *   2. Productos — consulta al servidor con retardo.
 *
 * Es la vía rápida para quien ya conoce el sistema: escribir "leche" y llegar
 * al producto sin pasar por el menú. Un ERP se usa muchas horas al día; los
 * atajos de teclado no son un lujo.
 */

interface ProductHit {
  id: string;
  name: string;
  sku: string;
  priceCents: number;
  stock: number;
}

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const router = useRouter();
  const { can, formatSettings } = useSession();

  // Atajo global de teclado.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Retardo antes de consultar: no se lanza una petición por cada tecla.
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 180);
    return () => clearTimeout(timer);
  }, [term]);

  const navMatches = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    const visible = ALL_NAV_ITEMS.filter(
      (item) => !item.permission || can(item.permission),
    );

    if (!needle) return visible.slice(0, 6);

    return visible
      .filter(
        (item) =>
          item.label.toLowerCase().includes(needle) ||
          item.keywords?.some((keyword) => keyword.includes(needle)),
      )
      .slice(0, 5);
  }, [term, can]);

  const { data: products = [] } = useQuery({
    queryKey: ["search-products", debounced],
    queryFn: () =>
      api.get<{ items: ProductHit[] }>("/products", {
        search: debounced,
        pageSize: 6,
      }),
    select: (result) => result.items,
    enabled: open && debounced.length >= 2 && can("products:read"),
  });

  const results = React.useMemo(
    () => [
      ...navMatches.map((item) => ({
        type: "nav" as const,
        id: item.href,
        item,
      })),
      ...products.map((product) => ({
        type: "product" as const,
        id: product.id,
        product,
      })),
    ],
    [navMatches, products],
  );

  React.useEffect(() => setHighlighted(0), [results.length]);

  function go(index: number) {
    const result = results[index];
    if (!result) return;

    setOpen(false);
    setTerm("");

    if (result.type === "nav") {
      router.push(result.item.href);
    } else {
      router.push(`/inventario/${result.product.id}`);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((value) => Math.min(value + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(highlighted);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border border-line bg-surface-sunken px-2.5",
          "text-[13px] text-ink-subtle transition-colors hover:border-line-strong hover:text-ink-muted",
          "w-40 lg:w-64",
        )}
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="hidden rounded-xs border border-line bg-surface px-1 font-sans text-[10px] text-ink-subtle lg:inline">
          Ctrl K
        </kbd>
      </button>

      <Modal open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={cn(
              "fixed left-1/2 top-[15vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2",
              "overflow-hidden rounded-lg border border-line bg-surface-raised shadow-overlay",
              "duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
            )}
          >
            <DialogPrimitive.Title className="sr-only">
              Búsqueda global
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Busca secciones y productos. Navega con las flechas y abre con
              Enter.
            </DialogPrimitive.Description>

            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden />
              <input
                autoFocus
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar secciones o productos…"
                aria-label="Buscar"
                role="combobox"
                aria-expanded
                aria-controls="search-results"
                className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
              />
            </div>

            <ul
              id="search-results"
              role="listbox"
              className="scroll-slim max-h-80 overflow-y-auto p-1.5"
            >
              {results.length === 0 && (
                <li className="px-3 py-8 text-center text-[13px] text-ink-subtle">
                  Sin coincidencias para “{term}”.
                </li>
              )}

              {results.map((result, index) => (
                <li key={`${result.type}-${result.id}`} role="option" aria-selected={index === highlighted}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => go(index)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left transition-colors",
                      index === highlighted && "bg-surface-sunken",
                    )}
                  >
                    {result.type === "nav" ? (
                      <>
                        <result.item.icon
                          className="size-4 shrink-0 text-ink-subtle"
                          aria-hidden
                        />
                        <span className="text-sm text-ink">
                          {result.item.label}
                        </span>
                        <span className="ml-auto text-[11px] text-ink-subtle">
                          Sección
                        </span>
                      </>
                    ) : (
                      <>
                        <Package
                          className="size-4 shrink-0 text-ink-subtle"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">
                            {result.product.name}
                          </span>
                          <span className="block truncate text-[11px] text-ink-subtle">
                            {result.product.sku}
                          </span>
                        </span>
                        <span className="numeric shrink-0 text-[13px] text-ink-muted">
                          {money(result.product.priceCents, formatSettings)}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Modal>
    </>
  );
}
