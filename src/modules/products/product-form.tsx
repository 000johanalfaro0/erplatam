"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput, QuantityInput } from "@/components/ui/money-input";
import { Drawer, DrawerContent } from "@/components/ui/overlay";
import { ApiError, api } from "@/lib/api";
import { UNIT_LABELS, UNIT_OPTIONS, money } from "@/lib/format";
import {
  type ProductDetail,
  queryKeys,
  useProduct,
  useReference,
} from "@/lib/queries";

/**
 * Alta y edición de producto.
 *
 * Decisión: panel lateral en lugar de página aparte. Al dar de alta veinte
 * productos seguidos, no perder de vista la tabla ahorra mucha navegación.
 *
 * El stock NO es editable al editar. Solo se captura al crear, y aun entonces
 * genera un movimiento de inventario. Cambiar existencias después exige pasar
 * por Inventario, con motivo y registro. Es una restricción deliberada de la
 * interfaz que refleja una regla del servidor: nadie mueve inventario sin
 * dejar rastro.
 */

interface FormState {
  sku: string;
  name: string;
  description: string;
  barcode: string;
  categoryId: string;
  supplierId: string;
  taxRateId: string;
  priceCents: number;
  costCents: number;
  unit: string;
  initialStock: number;
  minStock: number;
  tracksInventory: boolean;
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY: FormState = {
  sku: "",
  name: "",
  description: "",
  barcode: "",
  categoryId: "",
  supplierId: "",
  taxRateId: "",
  priceCents: 0,
  costCents: 0,
  unit: "PIECE",
  initialStock: 0,
  minStock: 0,
  tracksInventory: true,
  status: "ACTIVE",
};

function toFormState(product: ProductDetail): FormState {
  return {
    sku: product.sku,
    name: product.name,
    description: product.description ?? "",
    barcode: product.barcode ?? "",
    categoryId: product.categoryId ?? "",
    supplierId: product.supplierId ?? "",
    taxRateId: product.taxRateId ?? "",
    priceCents: product.priceCents,
    costCents: product.costCents,
    unit: product.unit,
    initialStock: 0,
    minStock: product.minStock ?? 0,
    tracksInventory: product.tracksInventory,
    status: product.status,
  };
}

export function ProductFormDrawer({
  open,
  onOpenChange,
  productId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = alta; con id = edición. */
  productId: string | null;
}) {
  const isEditing = productId !== null;
  const queryClient = useQueryClient();
  const { business } = useSession();
  const { data: reference } = useReference();
  const { data: product, isLoading: loadingProduct } = useProduct(
    open ? productId : null,
  );

  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Al abrir, se carga el producto o se limpia el formulario. Sin esto, abrir
  // un alta después de una edición mostraría los datos del anterior.
  React.useEffect(() => {
    if (!open) return;

    if (product && productId) {
      setForm(toFormState(product));
    } else if (!productId) {
      setForm({
        ...EMPTY,
        // La tasa por defecto del negocio, ya seleccionada: es la que aplica a
        // la mayoría de los productos.
        taxRateId: reference?.taxRates.find((rate) => rate.isDefault)?.id ?? "",
      });
    }
    setFieldErrors({});
  }, [open, product, productId, reference]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: form.sku,
        name: form.name,
        description: form.description || null,
        barcode: form.barcode || null,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        taxRateId: form.taxRateId || null,
        priceCents: form.priceCents,
        costCents: form.costCents,
        unit: form.unit,
        minStock: form.minStock || null,
        tracksInventory: form.tracksInventory,
        status: form.status,
      };

      return isEditing
        ? api.patch(`/products/${productId}`, payload)
        : api.post("/products", {
            ...payload,
            initialStock: form.tracksInventory ? form.initialStock : 0,
          });
    },
    onSuccess: () => {
      // Se invalidan también el panel y la búsqueda global: un producto nuevo
      // afecta al conteo de stock bajo y debe aparecer en el buscador.
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["search-products"] });
      if (productId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.product(productId) });
      }

      toast.success(
        isEditing ? "Producto actualizado" : `"${form.name}" dado de alta`,
      );
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        // Si el error no es de un campo concreto (SKU duplicado, por ejemplo),
        // se muestra como aviso general.
        if (Object.keys(error.fieldErrors).length === 0) {
          toast.error(error.message);
        }
      }
    },
  });

  // Margen calculado en vivo: ayuda a detectar un precio mal capturado ANTES
  // de guardarlo, que es cuando cuesta barato.
  const marginBps =
    form.priceCents > 0 && form.costCents > 0
      ? Math.round(
          ((form.priceCents - form.costCents) * 10_000) / form.priceCents,
        )
      : null;

  const unitLabel = UNIT_LABELS[form.unit] ?? "";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={isEditing ? "Editar producto" : "Nuevo producto"}
        description={
          isEditing
            ? "Los cambios no afectan a las ventas ya registradas."
            : "Los campos marcados con * son obligatorios."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              {isEditing ? "Guardar cambios" : "Crear producto"}
            </Button>
          </>
        }
      >
        {loadingProduct && isEditing ? (
          <p className="text-sm text-ink-muted">Cargando…</p>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            {/* --- Identificación --- */}
            <div className="space-y-4">
              <Field label="Nombre" required error={fieldErrors.name}>
                {(props) => (
                  <Input
                    {...props}
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Refresco cola 600 ml"
                    autoFocus
                  />
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="SKU"
                  required
                  error={fieldErrors.sku}
                  hint="Código interno"
                >
                  {(props) => (
                    <Input
                      {...props}
                      value={form.sku}
                      onChange={(e) => update("sku", e.target.value.toUpperCase())}
                      placeholder="BEB-001"
                      className="numeric"
                    />
                  )}
                </Field>

                <Field
                  label="Código de barras"
                  error={fieldErrors.barcode}
                  hint="Opcional"
                >
                  {(props) => (
                    <Input
                      {...props}
                      value={form.barcode}
                      onChange={(e) => update("barcode", e.target.value)}
                      placeholder="7501055300013"
                      className="numeric"
                    />
                  )}
                </Field>
              </div>
            </div>

            {/* --- Precios --- */}
            <div className="rounded-lg border border-line bg-surface-sunken p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Precio de venta"
                  required
                  error={fieldErrors.priceCents}
                  hint={
                    business.settings.pricesIncludeTax
                      ? "Precio de anaquel, IVA incluido"
                      : "Sin IVA; se suma al cobrar"
                  }
                >
                  {(props) => (
                    <MoneyInput
                      {...props}
                      valueCents={form.priceCents}
                      onValueChange={(cents) => update("priceCents", cents)}
                    />
                  )}
                </Field>

                <Field
                  label="Costo"
                  error={fieldErrors.costCents}
                  hint="Lo que te cuesta a ti"
                >
                  {(props) => (
                    <MoneyInput
                      {...props}
                      valueCents={form.costCents}
                      onValueChange={(cents) => update("costCents", cents)}
                    />
                  )}
                </Field>
              </div>

              {marginBps !== null && (
                <p className="mt-3 text-[13px] text-ink-muted">
                  Ganancia por unidad:{" "}
                  <span
                    className={
                      marginBps > 0
                        ? "numeric font-medium text-positive"
                        : "numeric font-medium text-danger"
                    }
                  >
                    {money(form.priceCents - form.costCents, business.settings)}
                  </span>{" "}
                  <span className="text-ink-subtle">
                    (margen {(marginBps / 100).toFixed(1)}%)
                  </span>
                  {marginBps <= 0 && (
                    <span className="ml-1 text-danger">
                      — estás vendiendo a pérdida
                    </span>
                  )}
                </p>
              )}

              <div className="mt-3">
                <Field label="Impuesto" error={fieldErrors.taxRateId}>
                  {(props) => (
                    <Select
                      {...props}
                      value={form.taxRateId}
                      onChange={(e) => update("taxRateId", e.target.value)}
                    >
                      <option value="">Sin impuesto</option>
                      {reference?.taxRates.map((rate) => (
                        <option key={rate.id} value={rate.id}>
                          {rate.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </div>

            {/* --- Clasificación --- */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría" error={fieldErrors.categoryId}>
                {(props) => (
                  <Select
                    {...props}
                    value={form.categoryId}
                    onChange={(e) => update("categoryId", e.target.value)}
                  >
                    <option value="">Sin categoría</option>
                    {reference?.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Proveedor" error={fieldErrors.supplierId}>
                {(props) => (
                  <Select
                    {...props}
                    value={form.supplierId}
                    onChange={(e) => update("supplierId", e.target.value)}
                  >
                    <option value="">Sin proveedor</option>
                    {reference?.suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            {/* --- Inventario --- */}
            <div className="space-y-4 border-t border-line pt-5">
              <Checkbox
                label="Controlar inventario"
                description="Desactívalo para servicios o productos sin existencia física."
                checked={form.tracksInventory}
                onChange={(e) => update("tracksInventory", e.target.checked)}
              />

              {form.tracksInventory && (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Unidad">
                    {(props) => (
                      <Select
                        {...props}
                        value={form.unit}
                        onChange={(e) => update("unit", e.target.value)}
                      >
                        {UNIT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>

                  {!isEditing && (
                    <Field
                      label="Existencia inicial"
                      error={fieldErrors.initialStock}
                    >
                      {(props) => (
                        <QuantityInput
                          {...props}
                          valueMilli={form.initialStock}
                          onValueChange={(milli) => update("initialStock", milli)}
                          unitLabel={unitLabel}
                        />
                      )}
                    </Field>
                  )}

                  <Field
                    label="Avisar bajo"
                    hint="Punto de reorden"
                    error={fieldErrors.minStock}
                  >
                    {(props) => (
                      <QuantityInput
                        {...props}
                        valueMilli={form.minStock}
                        onValueChange={(milli) => update("minStock", milli)}
                        unitLabel={unitLabel}
                      />
                    )}
                  </Field>
                </div>
              )}

              {isEditing && form.tracksInventory && (
                <p className="rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-[13px] text-ink-muted">
                  La existencia no se edita aquí. Para modificarla usa{" "}
                  <span className="font-medium text-ink">Inventario</span>, donde
                  queda registrado el motivo y quién lo hizo.
                </p>
              )}
            </div>

            {/* --- Otros --- */}
            <div className="space-y-4 border-t border-line pt-5">
              <Field label="Descripción" error={fieldErrors.description}>
                {(props) => (
                  <Textarea
                    {...props}
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="Notas internas sobre el producto…"
                    rows={2}
                  />
                )}
              </Field>

              <Field label="Estado">
                {(props) => (
                  <Select
                    {...props}
                    value={form.status}
                    onChange={(e) =>
                      update("status", e.target.value as "ACTIVE" | "INACTIVE")
                    }
                  >
                    <option value="ACTIVE">Activo — se puede vender</option>
                    <option value="INACTIVE">Inactivo — no se puede vender</option>
                  </Select>
                )}
              </Field>
            </div>

            {/* Permite enviar con Enter desde cualquier campo. */}
            <button type="submit" className="hidden" tabIndex={-1} />
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
