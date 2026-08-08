import { aPesos, construirExcel, respuestaExcel } from "@/server/core/excel";
import { MAX_EXPORT_SIZE } from "@/server/core/pagination";
import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { route } from "@/server/http/response";
import { listSales, listSalesSchema } from "@/server/modules/sales";

/**
 * GET /api/v1/sales/export?…  → .xlsx
 *
 * Las ventas del periodo que se esté mirando, una fila por ticket.
 *
 * Se incluyen las canceladas con su estado a la vista, y no se excluyen: una
 * hoja de ventas donde faltan las canceladas es justo la que hace que los
 * números no cuadren con la caja y nadie sepa por qué.
 */
interface Venta {
  folio: string;
  status: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  createdAt: string | Date;
  customer: { name: string } | null;
  user: { name: string } | null;
  _count: { items: number };
  payments: { method: { name: string } }[];
}

const ESTADOS: Record<string, string> = {
  COMPLETED: "Completada",
  VOIDED: "Cancelada",
  PENDING: "Pendiente",
};

export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  // Se valida con el esquema —que mantiene su tope de 100— y se sube después.
  const filtros = {
    ...listSalesSchema.parse(params),
    pageSize: MAX_EXPORT_SIZE,
  };
  const pagina = await listSales(ctx, filtros);
  const ventas = pagina.items as unknown as Venta[];

  const datos = await construirExcel<Venta>({
    hoja: "Ventas",
    titulo: "Ventas",
    subtitulo: `${ventas.length} ${ventas.length === 1 ? "ticket" : "tickets"} · generado el ${new Date().toLocaleString("es-MX")}`,
    columnas: [
      { titulo: "Folio", valor: (v) => v.folio, ancho: 14 },
      {
        titulo: "Fecha",
        tipo: "fecha",
        valor: (v) => new Date(v.createdAt),
        ancho: 18,
      },
      {
        titulo: "Cliente",
        valor: (v) => v.customer?.name ?? "Público en general",
      },
      { titulo: "Atendió", valor: (v) => v.user?.name ?? "" },
      {
        titulo: "Artículos",
        tipo: "entero",
        valor: (v) => v._count.items,
        ancho: 10,
      },
      {
        titulo: "Pago",
        valor: (v) =>
          [...new Set(v.payments.map((p) => p.method.name))].join(" + "),
        ancho: 16,
      },
      {
        titulo: "Subtotal",
        tipo: "dinero",
        valor: (v) => aPesos(v.subtotalCents),
        totaliza: true,
        ancho: 13,
      },
      {
        titulo: "Impuesto",
        tipo: "dinero",
        valor: (v) => aPesos(v.taxCents),
        totaliza: true,
        ancho: 13,
      },
      {
        titulo: "Total",
        tipo: "dinero",
        valor: (v) => aPesos(v.totalCents),
        totaliza: true,
        ancho: 14,
      },
      {
        titulo: "Estado",
        valor: (v) => ESTADOS[v.status] ?? v.status,
        ancho: 13,
      },
    ],
    filas: ventas,
  });

  return respuestaExcel(
    datos,
    `ventas-${new Date().toISOString().slice(0, 10)}`,
  );
});
