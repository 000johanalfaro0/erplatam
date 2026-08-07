"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { QuantityInput } from "@/components/ui/money-input";
import { Modal, ModalContent } from "@/components/ui/overlay";
import { ApiError, api } from "@/lib/api";
import { UNIT_LABELS, quantity } from "@/lib/format";
import type { Product } from "@/lib/queries";

/**
 * Movimiento de existencia: entrada, salida o ajuste por conteo.
 *
 * DECISIÓN DE DISEÑO IMPORTANTE
 * ---------------------------------------------------------------------------
 * El ajuste pide la cantidad CONTADA, no la diferencia. Quien hace inventario
 * físico cuenta piezas en el anaquel; pedirle que calcule "me sobran 3" es
 * pedirle que se equivoque. El sistema hace la resta y la muestra antes de
 * confirmar.
 *
 * El motivo es obligatorio en los tres casos. El servidor lo exige igualmente,
 * pero pedirlo aquí evita el viaje de ida y vuelta.
 */

type MovementKind = "ENTRY" | "EXIT" | "ADJUSTMENT";

const KIND_LABELS: Record<MovementKind, { title: string; help: string }> = {
  ENTRY: {
    title: "Entrada",
    help: "Mercancía que llega sin compra registrada: devolución de cliente, traspaso, hallazgo en conteo.",
  },
  EXIT: {
    title: "Salida",
    help: "Mercancía que se pierde: merma, caducidad, rotura, consumo interno.",
  },
  ADJUSTMENT: {
    title: "Ajuste por conteo",
    help: "Corrige el sistema para que coincida con lo que hay realmente en el anaquel.",
  },
};

export function StockMovementDialog({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = React.useState<MovementKind>("ENTRY");
  const [amount, setAmount] = React.useState(0);
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Se reinicia al abrir con otro producto, para no arrastrar el motivo
  // escrito para el anterior.
  React.useEffect(() => {
    if (product) {
      setKind("ENTRY");
      setAmount(0);
      setReason("");
      setErrors({});
    }
  }, [product]);

  const unitLabel = product ? (UNIT_LABELS[product.unit] ?? "") : "";

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) return;

      return kind === "ADJUSTMENT"
        ? api.post("/inventory/adjust", {
            productId: product.id,
            countedQuantity: amount,
            reason,
          })
        : api.post("/inventory/movement", {
            direction: kind,
            productId: product.id,
            quantity: amount,
            reason,
          });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      toast.success("Movimiento registrado", {
        description: "Quedó asentado en el historial del producto.",
      });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        if (Object.keys(error.fieldErrors).length === 0) {
          toast.error(error.message);
        }
      }
    },
  });

  if (!product) return null;

  // Vista previa del resultado. Ver el número final ANTES de confirmar es lo
  // que evita el ajuste equivocado.
  const resultingStock =
    kind === "ADJUSTMENT"
      ? amount
      : kind === "ENTRY"
        ? product.stock + amount
        : product.stock - amount;

  const difference = resultingStock - product.stock;
  const wouldGoNegative = resultingStock < 0;

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title={`Mover existencia · ${product.name}`}
        description={`Existencia actual: ${quantity(product.stock)} ${unitLabel}`}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={submit.isPending}
              disabled={reason.trim().length < 3 || (kind !== "ADJUSTMENT" && amount <= 0)}
              onClick={() => submit.mutate()}
            >
              Registrar movimiento
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Tipo de movimiento">
            {(props) => (
              <Select
                {...props}
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as MovementKind);
                  // Al pasar a ajuste se precarga la existencia actual: lo
                  // habitual es corregir un poco, no partir de cero.
                  setAmount(
                    event.target.value === "ADJUSTMENT" ? product.stock : 0,
                  );
                }}
              >
                <option value="ENTRY">Entrada — agregar mercancía</option>
                <option value="EXIT">Salida — descontar mercancía</option>
                <option value="ADJUSTMENT">Ajuste — corregir por conteo</option>
              </Select>
            )}
          </Field>

          <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-[13px] leading-relaxed text-ink-muted">
            {KIND_LABELS[kind].help}
          </p>

          <Field
            label={
              kind === "ADJUSTMENT"
                ? "¿Cuántas piezas hay realmente?"
                : "Cantidad"
            }
            required
            error={errors.quantity ?? errors.countedQuantity}
            hint={
              kind === "ADJUSTMENT"
                ? "Escribe lo que contaste en el anaquel; el sistema calcula la diferencia."
                : undefined
            }
          >
            {(props) => (
              <QuantityInput
                {...props}
                valueMilli={amount}
                onValueChange={setAmount}
                unitLabel={unitLabel}
                autoFocus
              />
            )}
          </Field>

          {/* Vista previa del resultado */}
          <div className="rounded-md border border-line bg-surface-sunken px-3 py-2.5">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-ink-muted">Quedará en</span>
              <span
                className={
                  wouldGoNegative
                    ? "numeric text-base font-semibold text-danger"
                    : "numeric text-base font-semibold text-ink"
                }
              >
                {quantity(resultingStock)} {unitLabel}
              </span>
            </div>

            {difference !== 0 && (
              <p className="mt-1 text-right text-[12px] text-ink-subtle">
                {difference > 0 ? "+" : ""}
                {quantity(difference)} respecto a la existencia actual
              </p>
            )}

            {wouldGoNegative && (
              <p role="alert" className="mt-1.5 text-[12px] text-danger">
                La existencia no puede quedar en negativo. El servidor
                rechazará el movimiento.
              </p>
            )}
          </div>

          <Field
            label="Motivo"
            required
            error={errors.reason}
            hint="Obligatorio. Quedará en la bitácora junto con tu nombre."
          >
            {(props) => (
              <Textarea
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  kind === "EXIT"
                    ? "Dos envases rotos en el almacén"
                    : kind === "ENTRY"
                      ? "Devolución del cliente García"
                      : "Conteo físico mensual"
                }
                rows={2}
              />
            )}
          </Field>
        </div>
      </ModalContent>
    </Modal>
  );
}
