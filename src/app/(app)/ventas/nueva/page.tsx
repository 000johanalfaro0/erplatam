"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { MoneyInput, QuantityInput } from "@/components/ui/money-input";
import { Modal, ModalContent } from "@/components/ui/overlay";
import { Badge, EmptyState, PageHeader } from "@/components/ui/surface";
import { ApiError, api } from "@/lib/api";
import { UNIT_LABELS, money, quantity } from "@/lib/format";
import { useCustomers, useReference } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ProductSearch } from "@/modules/sales/product-search";
import { useCart } from "@/modules/sales/use-cart";

/**
 * PUNTO DE VENTA
 * ===========================================================================
 * La pantalla más usada del sistema. Todo lo demás puede tardar un segundo
 * más; esta no.
 *
 * Distribución: buscador y carrito ocupan el espacio principal, el resumen de
 * cobro va fijo a la derecha. En una jornada se repite el mismo gesto cientos
 * de veces, así que nada se mueve de sitio entre venta y venta.
 *
 * Atajos de teclado (un cajero con práctica no toca el ratón):
 *   F2       cobrar
 *   Escape   limpiar el carrito
 */
export default function PuntoDeVentaPage() {
  const { business } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: reference } = useReference();

  const cart = useCart(business.settings.pricesIncludeTax);

  const [customerId, setCustomerId] = React.useState("");

  /**
   * Clientes del desplegable.
   *
   * Faltaban por completo: el `<select>` solo tenía "Público en general" y un
   * comentario que decía "los clientes se cargan del catálogo". No los
   * cargaba nadie. Para quien vendía, los clientes que había dado de alta
   * simplemente no existían al cobrar.
   */
  const { data: clientesPagina } = useCustomers({ pageSize: 100 });
  const clientes = clientesPagina?.items ?? [];
  const [notes, setNotes] = React.useState("");
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [paymentMethodId, setPaymentMethodId] = React.useState("");
  const [receivedCents, setReceivedCents] = React.useState(0);

  /**
   * Clave de idempotencia.
   *
   * Se genera UNA por intento de cobro y se mantiene durante los reintentos.
   * Si la red falla después de que el servidor confirmó la venta, reenviar la
   * misma clave devuelve la venta existente en lugar de cobrar dos veces.
   */
  const idempotencyKey = React.useRef<string>(crypto.randomUUID());

  const cash = reference?.paymentMethods.find((m) => m.code === "CASH");
  const selectedMethod = reference?.paymentMethods.find(
    (m) => m.id === paymentMethodId,
  );

  // El efectivo queda preseleccionado: es el método mayoritario en México.
  React.useEffect(() => {
    if (!paymentMethodId && cash) setPaymentMethodId(cash.id);
  }, [cash, paymentMethodId]);

  const createSale = useMutation({
    mutationFn: () =>
      api.post<{ id: string; folio: string; totalCents: number }>("/sales", {
        items: cart.lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          discountCents: line.discountCents,
        })),
        payments: [
          {
            paymentMethodId,
            amountCents: cart.totals.totalCents,
            ...(selectedMethod?.requiresChange && receivedCents > 0
              ? { receivedCents }
              : {}),
          },
        ],
        customerId: customerId || null,
        discountCents: cart.documentDiscountCents,
        notes: notes || null,
        idempotencyKey: idempotencyKey.current,
      }),
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });

      const cambio = selectedMethod?.requiresChange
        ? Math.max(0, receivedCents - sale.totalCents)
        : 0;

      toast.success(`Venta ${sale.folio} registrada`, {
        description:
          cambio > 0
            ? `Cambio a entregar: ${money(cambio, business.settings)}`
            : money(sale.totalCents, business.settings),
        duration: 8000,
      });

      // Se prepara la siguiente venta: carrito limpio y clave nueva.
      cart.clear();
      setCustomerId("");
      setNotes("");
      setReceivedCents(0);
      setCheckoutOpen(false);
      idempotencyKey.current = crypto.randomUUID();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast.error(error.message, {
          description:
            error.code === "INSUFFICIENT_STOCK"
              ? "Otra caja pudo haber vendido las últimas piezas. Revisa el carrito."
              : undefined,
          duration: 10000,
        });
      }
    },
  });

  // --- Atajos de teclado ---------------------------------------------------
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "F2" && !cart.isEmpty && !checkoutOpen) {
        event.preventDefault();
        setCheckoutOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cart.isEmpty, checkoutOpen]);

  const changeCents = Math.max(0, receivedCents - cart.totals.totalCents);
  const insufficientCash =
    selectedMethod?.requiresChange &&
    receivedCents > 0 &&
    receivedCents < cart.totals.totalCents;

  return (
    <>
      <PageHeader
        title="Punto de venta"
        description="Escanea o busca productos para armar el ticket."
        actions={
          !cart.isEmpty && (
            <Button variant="ghost" onClick={cart.clear}>
              <X />
              Vaciar carrito
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ---------------- Buscador y carrito ---------------- */}
        <div className="lg:col-span-2">
          <ProductSearch
            onSelect={cart.addProduct}
            disabled={createSale.isPending}
          />

          <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
            {cart.isEmpty ? (
              <EmptyState
                icon={<ShoppingCart />}
                title="El carrito está vacío"
                description="Escanea un código de barras o escribe el nombre de un producto para empezar."
              />
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Productos en el carrito</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-sunken text-[12px] text-ink-muted">
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      Producto
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-center font-medium">
                      Cantidad
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-right font-medium">
                      Precio
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Importe
                    </th>
                    <th scope="col" className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {cart.lines.map((line) => {
                    const excede =
                      line.product.tracksInventory &&
                      line.quantity > line.product.stock;
                    const unitLabel = UNIT_LABELS[line.product.unit] ?? "";

                    return (
                      <tr
                        key={line.product.id}
                        className={cn(
                          "border-b border-line last:border-0",
                          excede && "bg-danger-soft/40",
                        )}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">
                            {line.product.name}
                          </p>
                          <p className="numeric mt-0.5 text-[12px] text-ink-subtle">
                            {line.product.sku}
                            {line.product.tracksInventory &&
                              ` · ${quantity(line.product.stock)} ${unitLabel} disp.`}
                          </p>
                          {excede && (
                            <p
                              role="alert"
                              className="mt-1 flex items-center gap-1 text-[12px] font-medium text-danger"
                            >
                              <AlertTriangle className="size-3" aria-hidden />
                              Solo hay {quantity(line.product.stock)} {unitLabel}
                            </p>
                          )}
                        </td>

                        <td className="px-2 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Quitar una unidad de ${line.product.name}`}
                              onClick={() =>
                                cart.setQuantity(
                                  line.product.id,
                                  line.quantity - 1000,
                                )
                              }
                            >
                              <Minus />
                            </Button>
                            <QuantityInput
                              valueMilli={line.quantity}
                              onValueChange={(milli) =>
                                cart.setQuantity(line.product.id, milli)
                              }
                              aria-label={`Cantidad de ${line.product.name}`}
                              className="w-20 text-center"
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Agregar una unidad de ${line.product.name}`}
                              onClick={() =>
                                cart.setQuantity(
                                  line.product.id,
                                  line.quantity + 1000,
                                )
                              }
                            >
                              <Plus />
                            </Button>
                          </div>
                        </td>

                        <td className="px-2 py-3">
                          {/* El precio es editable: los precios negociados
                              existen en cualquier mostrador. Queda registrado
                              en la venta y en la auditoría. */}
                          <MoneyInput
                            valueCents={line.unitPriceCents}
                            onValueChange={(cents) =>
                              cart.setUnitPrice(line.product.id, cents)
                            }
                            aria-label={`Precio unitario de ${line.product.name}`}
                            className="w-28"
                          />
                        </td>

                        <td className="numeric px-4 py-3 text-right font-medium text-ink">
                          {money(cart.lineTotal(line), business.settings)}
                        </td>

                        <td className="px-2 py-3">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Quitar ${line.product.name} del carrito`}
                            onClick={() => cart.removeLine(line.product.id)}
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ---------------- Resumen de cobro ---------------- */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-subtle">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-ink">Resumen</h2>
            </div>

            <div className="space-y-3 p-5">
              <Field label="Cliente">
                {(props) => (
                  <Select
                    {...props}
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                  >
                    {/* Sin cliente la venta es válida: en mostrador, la
                        mayoría lo son. Por eso va primero y es el valor por
                        defecto. */}
                    <option value="">Público en general</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.name}
                        {cliente.rfc ? ` · ${cliente.rfc}` : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <div className="space-y-1.5 border-t border-line pt-3 text-sm">
                <div className="flex justify-between text-ink-muted">
                  <span>Subtotal</span>
                  <span className="numeric">
                    {money(cart.totals.subtotalCents, business.settings)}
                  </span>
                </div>

                {cart.totals.discountCents > 0 && (
                  <div className="flex justify-between text-ink-muted">
                    <span>Descuento</span>
                    <span className="numeric text-danger">
                      −{money(cart.totals.discountCents, business.settings)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-ink-muted">
                  <span>
                    IVA
                    {business.settings.pricesIncludeTax && (
                      <span className="ml-1 text-[11px] text-ink-subtle">
                        (incluido)
                      </span>
                    )}
                  </span>
                  <span className="numeric">
                    {money(cart.totals.taxCents, business.settings)}
                  </span>
                </div>
              </div>

              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-sm font-medium text-ink">Total</span>
                <span
                  className="numeric text-2xl font-semibold tracking-[-0.02em] text-ink"
                  // aria-live: un lector de pantalla anuncia el nuevo total al
                  // cambiar el carrito, sin tener que navegar hasta aquí.
                  aria-live="polite"
                >
                  {money(cart.totals.totalCents, business.settings)}
                </span>
              </div>

              {cart.stockWarnings.length > 0 && (
                <p
                  role="alert"
                  className="flex gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-[12px] text-ink"
                >
                  <AlertTriangle
                    className="mt-px size-3.5 shrink-0 text-danger"
                    aria-hidden
                  />
                  Hay {cart.stockWarnings.length}{" "}
                  {cart.stockWarnings.length === 1 ? "producto" : "productos"} sin
                  existencia suficiente. El cobro será rechazado.
                </p>
              )}

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={cart.isEmpty}
                onClick={() => setCheckoutOpen(true)}
              >
                Cobrar
                <kbd className="ml-1 rounded-xs bg-white/20 px-1 font-sans text-[10px]">
                  F2
                </kbd>
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------------- Diálogo de cobro ---------------- */}
      <Modal open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <ModalContent
          title="Cobrar venta"
          description={`${cart.itemCount} ${cart.itemCount === 1 ? "producto" : "productos"} en el ticket`}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setCheckoutOpen(false)}
                disabled={createSale.isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={createSale.isPending}
                disabled={!paymentMethodId || insufficientCash}
                onClick={() => createSale.mutate()}
              >
                <Check />
                Confirmar cobro
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface-sunken px-4 py-3.5 text-center">
              <p className="text-[12px] text-ink-muted">Total a cobrar</p>
              <p className="numeric mt-0.5 text-3xl font-semibold tracking-[-0.02em] text-ink">
                {money(cart.totals.totalCents, business.settings)}
              </p>
            </div>

            <Field label="Método de pago" required>
              {(props) => (
                <Select
                  {...props}
                  value={paymentMethodId}
                  onChange={(event) => {
                    setPaymentMethodId(event.target.value);
                    setReceivedCents(0);
                  }}
                >
                  {reference?.paymentMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {selectedMethod?.requiresChange && (
              <>
                <Field
                  label="¿Con cuánto paga?"
                  hint="Opcional. Si lo capturas, calculamos el cambio."
                >
                  {(props) => (
                    <MoneyInput
                      {...props}
                      valueCents={receivedCents}
                      onValueChange={setReceivedCents}
                      autoFocus
                    />
                  )}
                </Field>

                {/* Atajos de billetes: en efectivo se paga casi siempre con
                    denominaciones redondas. */}
                <div className="flex flex-wrap gap-1.5">
                  {[10000, 20000, 50000, 100000]
                    .filter((amount) => amount >= cart.totals.totalCents)
                    .slice(0, 4)
                    .map((amount) => (
                      <Button
                        key={amount}
                        variant="secondary"
                        size="sm"
                        onClick={() => setReceivedCents(amount)}
                      >
                        {money(amount, business.settings)}
                      </Button>
                    ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setReceivedCents(cart.totals.totalCents)}
                  >
                    Exacto
                  </Button>
                </div>

                {receivedCents > 0 && (
                  <div
                    className={cn(
                      "flex items-baseline justify-between rounded-md border px-4 py-3",
                      insufficientCash
                        ? "border-danger/20 bg-danger-soft"
                        : "border-positive/20 bg-positive-soft",
                    )}
                  >
                    <span className="text-sm font-medium text-ink">
                      {insufficientCash ? "Falta" : "Cambio"}
                    </span>
                    <span
                      className={cn(
                        "numeric text-xl font-semibold",
                        insufficientCash ? "text-danger" : "text-positive",
                      )}
                      aria-live="polite"
                    >
                      {money(
                        insufficientCash
                          ? cart.totals.totalCents - receivedCents
                          : changeCents,
                        business.settings,
                      )}
                    </span>
                  </div>
                )}
              </>
            )}

            <Field label="Notas" hint="Opcional. Queda en el ticket.">
              {(props) => (
                <Textarea
                  {...props}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  placeholder="Entrega a domicilio, pedido especial…"
                />
              )}
            </Field>

            {cart.stockWarnings.length > 0 && (
              <p
                role="alert"
                className="flex gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-ink"
              >
                <AlertTriangle
                  className="mt-px size-4 shrink-0 text-danger"
                  aria-hidden
                />
                <span>
                  <span className="font-medium">
                    Existencia insuficiente en {cart.stockWarnings.length}{" "}
                    {cart.stockWarnings.length === 1 ? "producto" : "productos"}.
                  </span>{" "}
                  El servidor rechazará el cobro. Ajusta las cantidades o
                  registra primero una entrada de inventario.
                </span>
              </p>
            )}
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}
