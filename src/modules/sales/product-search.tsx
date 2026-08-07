"use client";

import { useQuery } from "@tanstack/react-query";
import { Barcode, Search } from "lucide-react";
import * as React from "react";

import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/surface";
import { api } from "@/lib/api";
import { money, quantity } from "@/lib/format";
import type { Product } from "@/lib/queries";
import { cn } from "@/lib/utils";

import type { CartProduct } from "./use-cart";

/**
 * Buscador de productos del punto de venta.
 *
 * DISEÑADO PARA LA REALIDAD DE UN MOSTRADOR, no para verse bonito:
 *
 *   - El campo recupera el foco solo. Un lector de código de barras es un
 *     teclado: escribe el código y pulsa Enter. Si el foco está en otro sitio,
 *     el código se pierde. Este detalle es la diferencia entre un punto de
 *     venta usable y uno que desespera.
 *   - Enter con coincidencia exacta de SKU o código de barras agrega el
 *     producto directamente, sin pasar por la lista.
 *   - Flechas arriba/abajo y Enter para elegir de la lista, sin tocar el ratón.
 *   - Tras agregar, el campo se limpia y queda listo para el siguiente. Una
 *     venta de veinte artículos son veinte escaneos sin un solo clic.
 */

export function ProductSearch({
  onSelect,
  disabled,
}: {
  onSelect: (product: CartProduct) => void;
  disabled?: boolean;
}) {
  const { business } = useSession();
  const [term, setTerm] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 150);
    return () => clearTimeout(timer);
  }, [term]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["pos-search", debounced],
    queryFn: () =>
      api.get<{ items: Product[] }>("/products", {
        search: debounced,
        status: "ACTIVE",
        pageSize: 8,
      }),
    select: (result) => result.items,
    enabled: debounced.length >= 2,
  });

  React.useEffect(() => setHighlighted(0), [results.length]);

  // Recuperación del foco: el lector de código de barras necesita que el
  // campo esté activo para que sus pulsaciones lleguen aquí.
  React.useEffect(() => {
    if (disabled) return;

    function refocus(event: MouseEvent) {
      const target = event.target as HTMLElement;
      // No se roba el foco si el usuario está escribiendo en otro campo o
      // pulsando un botón: eso sería peor que el problema que resuelve.
      if (target.closest("input, textarea, select, button, [role='dialog']")) {
        return;
      }
      inputRef.current?.focus();
    }

    document.addEventListener("click", refocus);
    return () => document.removeEventListener("click", refocus);
  }, [disabled]);

  function toCartProduct(product: Product): CartProduct {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      priceCents: product.priceCents,
      stock: product.stock,
      unit: product.unit,
      tracksInventory: product.tracksInventory,
      taxRateBps:
        product.taxRate?.rateBps ?? business.settings.defaultTaxRateBps,
    };
  }

  function pick(product: Product) {
    onSelect(toCartProduct(product));
    setTerm("");
    setDebounced("");
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((value) => Math.min(value + 1, results.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((value) => Math.max(value - 1, 0));
      return;
    }

    if (event.key === "Escape") {
      setTerm("");
      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();

    // Coincidencia EXACTA de código de barras o SKU: es lo que envía el
    // lector, y debe agregarse sin ambigüedad aunque haya otros resultados.
    const code = term.trim();
    const exact = results.find(
      (product) =>
        product.barcode === code ||
        product.sku.toUpperCase() === code.toUpperCase(),
    );

    if (exact) {
      pick(exact);
      return;
    }

    const chosen = results[highlighted];
    if (chosen) pick(chosen);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Barcode
          className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoFocus
          autoComplete="off"
          // `role=combobox` y `aria-expanded` permiten a un lector de pantalla
          // —y a una prueba automatizada— entender que hay sugerencias.
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="pos-resultados"
          aria-label="Escanear o buscar producto"
          placeholder="Escanea un código o escribe el nombre del producto…"
          className={cn(
            "h-14 w-full rounded-lg border-2 border-line-strong bg-surface pl-11 pr-4",
            "text-base text-ink placeholder:text-ink-subtle",
            "transition-colors focus:outline-none focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15",
            "disabled:opacity-60",
          )}
        />
        {isFetching && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-ink-subtle">
            buscando…
          </span>
        )}
      </div>

      {/* Sugerencias */}
      {debounced.length >= 2 && (
        <ul
          id="pos-resultados"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-line bg-surface-raised p-1.5 shadow-overlay scroll-slim"
        >
          {results.length === 0 && !isFetching && (
            <li className="px-3 py-6 text-center text-[13px] text-ink-subtle">
              No hay productos activos que coincidan con “{debounced}”.
            </li>
          )}

          {results.map((product, index) => {
            const sinExistencia =
              product.tracksInventory && product.stock <= 0;

            return (
              <li key={product.id} role="option" aria-selected={index === highlighted}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => pick(product)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                    index === highlighted && "bg-surface-sunken",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {product.name}
                    </p>
                    <p className="numeric mt-0.5 truncate text-[12px] text-ink-subtle">
                      {product.sku}
                      {product.barcode && ` · ${product.barcode}`}
                    </p>
                  </div>

                  {product.tracksInventory && (
                    <span className="shrink-0">
                      {sinExistencia ? (
                        <Badge tone="danger">Sin existencia</Badge>
                      ) : (
                        <span className="numeric text-[12px] text-ink-subtle">
                          {quantity(product.stock)} disp.
                        </span>
                      )}
                    </span>
                  )}

                  <span className="numeric shrink-0 text-sm font-semibold text-ink">
                    {money(product.priceCents, business.settings)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {debounced.length < 2 && term.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-subtle">
          <Search className="size-3" aria-hidden />
          Escribe al menos 2 caracteres, o escanea directamente con el lector.
        </p>
      )}
    </div>
  );
}
