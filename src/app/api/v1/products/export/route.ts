import {
  aPesos,
  aUnidades,
  construirExcel,
  respuestaExcel,
} from "@/server/core/excel";
import { MAX_EXPORT_SIZE } from "@/server/core/pagination";
import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { route } from "@/server/http/response";
import {
  list,
  listProductsSchema,
  type ProductListItem,
} from "@/server/modules/products";

/**
 * GET /api/v1/products/export?…  → .xlsx
 *
 * El inventario completo, con los mismos filtros de la pantalla.
 *
 * Incluye una columna "Valor a costo" ya multiplicada: es la pregunta que
 * todo el mundo acaba haciéndole a esta hoja —cuánto dinero tengo parado en
 * el almacén— y no tiene sentido obligar a escribirla en Excel cada vez.
 */
export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  // Se valida con el esquema —que mantiene su tope de 100— y se sube después.
  const filtros = {
    ...listProductsSchema.parse(params),
    pageSize: MAX_EXPORT_SIZE,
  };
  const pagina = await list(ctx, filtros);
  const productos = pagina.items as ProductListItem[];

  const datos = await construirExcel<ProductListItem>({
    hoja: "Inventario",
    titulo: "Inventario",
    subtitulo: `${productos.length} ${productos.length === 1 ? "producto" : "productos"} · generado el ${new Date().toLocaleString("es-MX")}`,
    columnas: [
      { titulo: "SKU", valor: (p) => p.sku, ancho: 14 },
      { titulo: "Producto", valor: (p) => p.name },
      { titulo: "Categoría", valor: (p) => p.category?.name ?? "Sin categoría" },
      { titulo: "Proveedor", valor: (p) => p.supplier?.name ?? "" },
      {
        titulo: "Existencia",
        tipo: "cantidad",
        valor: (p) => aUnidades(p.stock),
        ancho: 12,
      },
      {
        titulo: "Mínimo",
        tipo: "cantidad",
        // `minStock` es opcional: sin mínimo propio manda el umbral global
        // del negocio, y aquí se deja la celda vacía en vez de inventar un 0
        // que se leería como "no quiero tener ninguno".
        valor: (p) => (p.minStock === null ? null : aUnidades(p.minStock)),
        ancho: 10,
      },
      {
        titulo: "Costo",
        tipo: "dinero",
        valor: (p) => aPesos(p.costCents),
        ancho: 12,
      },
      {
        titulo: "Precio",
        tipo: "dinero",
        valor: (p) => aPesos(p.priceCents),
        ancho: 12,
      },
      {
        titulo: "Valor a costo",
        tipo: "dinero",
        valor: (p) => aPesos(p.costCents) * aUnidades(p.stock),
        totaliza: true,
        ancho: 15,
      },
      {
        titulo: "Impuesto",
        valor: (p) => p.taxRate?.name ?? "Sin impuesto",
        ancho: 13,
      },
      {
        titulo: "Estado",
        valor: (p) => (p.status === "ACTIVE" ? "Activo" : "Inactivo"),
        ancho: 10,
      },
    ],
    filas: productos,
  });

  return respuestaExcel(
    datos,
    `inventario-${new Date().toISOString().slice(0, 10)}`,
  );
});
