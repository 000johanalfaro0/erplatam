import {
  aPesos,
  construirExcel,
  respuestaExcel,
} from "@/server/core/excel";
import { MAX_EXPORT_SIZE } from "@/server/core/pagination";
import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { route } from "@/server/http/response";
import { listExpenses, listExpensesSchema } from "@/server/modules/expenses";

/**
 * GET /api/v1/expenses/export?…  → .xlsx
 *
 * Respeta los MISMOS filtros que la pantalla. Exportar "todo" cuando el
 * usuario está mirando los gastos de marzo filtrados por categoría es
 * regalarle trabajo: se lleva un archivo que no se parece a lo que tenía
 * delante y tiene que volver a filtrar en Excel.
 */
interface Gasto {
  description: string;
  amountCents: number;
  spentAt: string | Date;
  reference: string | null;
  notes: string | null;
  category: { name: string } | null;
  method: { name: string } | null;
  user: { name: string } | null;
}

export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  // Se valida primero y se sube el tope DESPUÉS: el esquema mantiene su
  // máximo de 100 para la API pública, y la exportación se lleva todo lo que
  // cumple el filtro, no solo la página visible.
  const filtros = {
    ...listExpensesSchema.parse(params),
    pageSize: MAX_EXPORT_SIZE,
  };
  const pagina = await listExpenses(ctx, filtros);
  const gastos = pagina.items as Gasto[];

  const datos = await construirExcel<Gasto>({
    hoja: "Gastos",
    titulo: "Gastos",
    subtitulo: `${gastos.length} ${gastos.length === 1 ? "registro" : "registros"} · generado el ${new Date().toLocaleString("es-MX")}`,
    columnas: [
      {
        titulo: "Fecha",
        tipo: "fecha",
        valor: (g) => new Date(g.spentAt),
        ancho: 18,
      },
      { titulo: "Descripción", valor: (g) => g.description },
      { titulo: "Categoría", valor: (g) => g.category?.name ?? "Sin categoría" },
      { titulo: "Método de pago", valor: (g) => g.method?.name ?? "—" },
      { titulo: "Referencia", valor: (g) => g.reference ?? "" },
      {
        titulo: "Importe",
        tipo: "dinero",
        valor: (g) => aPesos(g.amountCents),
        totaliza: true,
        ancho: 14,
      },
      { titulo: "Capturó", valor: (g) => g.user?.name ?? "" },
      { titulo: "Notas", valor: (g) => g.notes ?? "" },
    ],
    filas: gastos,
  });

  return respuestaExcel(
    datos,
    `gastos-${new Date().toISOString().slice(0, 10)}`,
  );
});
