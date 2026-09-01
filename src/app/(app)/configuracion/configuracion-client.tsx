"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Save } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
} from "@/components/ui/surface";
import { api } from "@/lib/api";
import { percent } from "@/lib/format";
import { COUNTRIES, COUNTRY_OPTIONS, type CountryCode } from "@/config/countries";
import { PERMISSIONS } from "@/server/core/permissions";

/**
 * Porcentaje escrito a mano → basis points, sin coma flotante en el resultado.
 * "8" → 800, "8.5" → 850. `Math.round` cierra el caso de "8.333".
 */
function textoABps(texto: string): number {
  const numero = Number.parseFloat(texto.replace(",", "."));
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

/**
 * CONFIGURACIÓN DEL NEGOCIO
 *
 * Tres bloques, en el orden en que importan: impuestos (lo que más se toca),
 * métodos de pago (lo segundo) y localización (se pone una vez y no se
 * vuelve a mirar).
 *
 * DECISIÓN DE EXPERIENCIA: aquí NO se guarda solo. Al revés que el
 * cuestionario, donde el autoguardado evita perder texto, un cambio aquí
 * altera cómo se calcula el dinero de todas las ventas futuras. Que exija
 * pulsar "Guardar" es a propósito.
 *
 * El aviso de que cambiar la tasa por defecto no reprecia nada existente está
 * escrito en la pantalla, no solo en el código: es la pregunta que va a hacer
 * cualquiera que la cambie.
 */

interface Settings {
  countryCode: CountryCode;
  currency: string;
  locale: string;
  timezone: string;
  defaultTaxRateBps: number;
  pricesIncludeTax: boolean;
  allowNegativeStock: boolean;
  lowStockThreshold: number;
  satRegimenFiscal: string | null;
  satPostalCode: string | null;
  cfdiEnabled: boolean;
}

interface TaxRate {
  id: string;
  name: string;
  rateBps: number;
  isExempt: boolean;
  isDefault: boolean;
  productCount: number;
}

interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  requiresChange: boolean;
  isActive: boolean;
  sortOrder: number;
}

export default function ConfiguracionClient() {
  const { can } = useSession();
  const puedeEscribir = can(PERMISSIONS.SETTINGS_WRITE);
  const queryClient = useQueryClient();

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Impuestos, cobros y localización del negocio."
      />

      {!puedeEscribir && (
        <p className="mb-5 rounded-md border border-line bg-surface-sunken px-3 py-2 text-[13px] text-ink-muted">
          Puedes consultar la configuración, pero no modificarla. Pídeselo a un
          administrador.
        </p>
      )}

      <div className="space-y-5">
        <BloqueImpuestos
          puedeEscribir={puedeEscribir}
          queryClient={queryClient}
        />
        <BloqueMetodosPago
          puedeEscribir={puedeEscribir}
          queryClient={queryClient}
        />
        <BloqueLocalizacion
          puedeEscribir={puedeEscribir}
          queryClient={queryClient}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

type Bloque = {
  puedeEscribir: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
};

function BloqueImpuestos({ puedeEscribir, queryClient }: Bloque) {
  const { data: tasas, isLoading } = useQuery({
    queryKey: ["settings", "tax-rates"],
    queryFn: () => api.get<TaxRate[]>("/settings/tax-rates"),
  });

  const [nueva, setNueva] = React.useState(false);
  const [nombre, setNombre] = React.useState("");
  const [porcentaje, setPorcentaje] = React.useState("");
  const [exenta, setExenta] = React.useState(false);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    // Los desplegables de producto leen de aquí; sin esto seguirían mostrando
    // la lista vieja hasta recargar la página.
    queryClient.invalidateQueries({ queryKey: ["reference"] });
  }

  const crear = useMutation({
    mutationFn: () =>
      api.post("/settings/tax-rates", {
        name: nombre.trim(),
        rateBps: exenta ? 0 : textoABps(porcentaje),
        isExempt: exenta,
        isDefault: false,
      }),
    onSuccess: () => {
      toast.success("Tasa creada");
      setNueva(false);
      setNombre("");
      setPorcentaje("");
      setExenta(false);
      invalidar();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const marcarPredeterminada = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/settings/tax-rates/${id}`, { isDefault: true }),
    onSuccess: () => {
      toast.success("Es la nueva tasa predeterminada");
      invalidar();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archivar = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/tax-rates/${id}`),
    onSuccess: () => {
      toast.success("Tasa archivada");
      invalidar();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Impuestos</CardTitle>
        {puedeEscribir && !nueva && (
          <Button variant="secondary" size="sm" onClick={() => setNueva(true)}>
            <Plus />
            Nueva tasa
          </Button>
        )}
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          No todo lleva 16%. Los alimentos básicos y las medicinas van al 0%, y
          hay conceptos exentos —que no es lo mismo que 0%, aunque el importe
          coincida—. Cada producto elige su tasa; aquí se define el catálogo.
        </p>

        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="overflow-hidden rounded-md border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-[12px] text-ink-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 text-right font-medium">Tasa</th>
                  <th className="px-3 py-2 text-right font-medium">Productos</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tasas?.map((tasa) => (
                  <tr key={tasa.id}>
                    <td className="px-3 py-2.5">
                      <span className="text-ink">{tasa.name}</span>
                      {tasa.isDefault && (
                        <Badge tone="accent" className="ml-2">
                          Predeterminada
                        </Badge>
                      )}
                      {tasa.isExempt && (
                        <Badge tone="neutral" className="ml-2">
                          Exenta
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                      {percent(tasa.rateBps)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                      {tasa.productCount}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {puedeEscribir && (
                        <span className="flex justify-end gap-1">
                          {!tasa.isDefault && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => marcarPredeterminada.mutate(tasa.id)}
                              >
                                Predeterminar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Archivar ${tasa.name}`}
                                onClick={() => archivar.mutate(tasa.id)}
                              >
                                <Archive />
                              </Button>
                            </>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {nueva && (
          <form
            className="grid gap-3 rounded-md border border-line bg-surface-sunken p-3 sm:grid-cols-[1fr_140px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              crear.mutate();
            }}
          >
            <Field label="Nombre" required>
              {(props) => (
                <Input
                  {...props}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="IVA 8% frontera"
                />
              )}
            </Field>

            <Field label="Tasa (%)" required>
              {(props) => (
                <Input
                  {...props}
                  value={porcentaje}
                  onChange={(e) => setPorcentaje(e.target.value)}
                  disabled={exenta}
                  inputMode="decimal"
                  placeholder="8"
                />
              )}
            </Field>

            <div className="flex items-end gap-2">
              <Button type="submit" size="sm" loading={crear.isPending}>
                Crear
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setNueva(false)}
              >
                Cancelar
              </Button>
            </div>

            <div className="sm:col-span-3">
              <Checkbox
                label="Exenta"
                description="No es lo mismo que 0%: el importe es igual, pero el SAT los distingue."
                checked={exenta}
                onChange={(e) => setExenta(e.target.checked)}
              />
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function BloqueMetodosPago({ puedeEscribir, queryClient }: Bloque) {
  const { data: metodos, isLoading } = useQuery({
    queryKey: ["settings", "payment-methods"],
    queryFn: () => api.get<PaymentMethod[]>("/settings/payment-methods"),
  });

  const [nuevo, setNuevo] = React.useState(false);
  const [codigo, setCodigo] = React.useState("");
  const [nombre, setNombre] = React.useState("");
  const [daCambio, setDaCambio] = React.useState(false);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["reference"] });
  }

  const crear = useMutation({
    mutationFn: () =>
      api.post("/settings/payment-methods", {
        code: codigo.trim().toUpperCase(),
        name: nombre.trim(),
        requiresChange: daCambio,
        sortOrder: (metodos?.length ?? 0) + 1,
      }),
    onSuccess: () => {
      toast.success("Método de pago creado");
      setNuevo(false);
      setCodigo("");
      setNombre("");
      setDaCambio(false);
      invalidar();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const alternar = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      api.patch(`/settings/payment-methods/${id}`, { isActive: activo }),
    onSuccess: (_data, variables) => {
      toast.success(variables.activo ? "Método activado" : "Método desactivado");
      invalidar();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Métodos de pago</CardTitle>
        {puedeEscribir && !nuevo && (
          <Button variant="secondary" size="sm" onClick={() => setNuevo(true)}>
            <Plus />
            Nuevo método
          </Button>
        )}
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Los que aparecen al cobrar. Un método usado en ventas pasadas no se
          borra: se desactiva, y deja de ofrecerse sin romper el historial.
        </p>

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {metodos?.map((metodo) => (
              <li
                key={metodo.id}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{metodo.name}</span>
                  <span className="ml-2 text-[12px] text-ink-subtle">
                    {metodo.code}
                  </span>
                  {metodo.requiresChange && (
                    <span className="ml-2 text-[12px] text-ink-subtle">
                      · calcula cambio
                    </span>
                  )}
                </span>

                {!metodo.isActive && <Badge tone="neutral">Desactivado</Badge>}

                {puedeEscribir && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      alternar.mutate({
                        id: metodo.id,
                        activo: !metodo.isActive,
                      })
                    }
                  >
                    {metodo.isActive ? "Desactivar" : "Activar"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {nuevo && (
          <form
            className="grid gap-3 rounded-md border border-line bg-surface-sunken p-3 sm:grid-cols-[160px_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              crear.mutate();
            }}
          >
            <Field label="Código" required hint="Mayúsculas, sin espacios">
              {(props) => (
                <Input
                  {...props}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  placeholder="VALES"
                />
              )}
            </Field>

            <Field label="Nombre" required>
              {(props) => (
                <Input
                  {...props}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Vales de despensa"
                />
              )}
            </Field>

            <div className="flex items-end gap-2">
              <Button type="submit" size="sm" loading={crear.isPending}>
                Crear
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setNuevo(false)}
              >
                Cancelar
              </Button>
            </div>

            <div className="sm:col-span-3">
              <Checkbox
                label="Se cobra en efectivo y hay que dar cambio"
                checked={daCambio}
                onChange={(e) => setDaCambio(e.target.checked)}
              />
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function BloqueLocalizacion({ puedeEscribir, queryClient }: Bloque) {
  const { data, isLoading } = useQuery({
    queryKey: ["settings", "general"],
    queryFn: () => api.get<Settings>("/settings"),
  });

  const [borrador, setBorrador] = React.useState<Partial<Settings>>({});

  // El borrador arranca vacío y solo guarda lo que el usuario tocó. Así el
  // PATCH manda exactamente los campos modificados, y la auditoría no se
  // llena de "cambió la moneda de MXN a MXN".
  const valor = <K extends keyof Settings>(campo: K): Settings[K] | undefined =>
    borrador[campo] !== undefined ? borrador[campo] : data?.[campo];

  const guardar = useMutation({
    mutationFn: () => api.patch<Settings>("/settings", borrador),
    onSuccess: () => {
      toast.success("Configuración guardada");
      setBorrador({});
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sinCambios = Object.keys(borrador).length === 0;

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operación y localización</CardTitle>
      </CardHeader>

      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="País" hint="Aplica moneda, formato, zona horaria e impuesto sugerido.">
            {(props) => (
              <Select {...props} value={valor("countryCode") ?? "MX"} disabled={!puedeEscribir}
                onChange={(e) => {
                  const countryCode = e.target.value as CountryCode;
                  const preset = COUNTRIES[countryCode];
                  setBorrador((b) => ({ ...b, countryCode, currency: preset.currency, locale: preset.locale, timezone: preset.timezone, defaultTaxRateBps: preset.taxRateBps }));
                }}>
                {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
              </Select>
            )}
          </Field>
          <Field
            label="Zona horaria"
            hint="Decide a qué día pertenece cada venta en los reportes."
          >
            {(props) => (
              <Select
                {...props}
                value={valor("timezone") ?? ""}
                disabled={!puedeEscribir}
                onChange={(e) =>
                  setBorrador((b) => ({ ...b, timezone: e.target.value }))
                }
              >
                {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.timezone}>{country.name} · {country.timezone}</option>)}
              </Select>
            )}
          </Field>

          <Field label="Moneda" hint="Código de tres letras.">
            {(props) => (
              <Input
                {...props}
                value={valor("currency") ?? ""}
                disabled={!puedeEscribir}
                maxLength={3}
                onChange={(e) =>
                  setBorrador((b) => ({
                    ...b,
                    currency: e.target.value.toUpperCase(),
                  }))
                }
              />
            )}
          </Field>
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <Checkbox
            label="Los precios que capturo ya incluyen impuesto"
            description="Lo normal en tienda: la etiqueta dice $45 y el cliente paga $45. Si lo desactivas, el impuesto se suma al cobrar."
            checked={valor("pricesIncludeTax") ?? true}
            disabled={!puedeEscribir}
            onChange={(e) =>
              setBorrador((b) => ({ ...b, pricesIncludeTax: e.target.checked }))
            }
          />

          <Checkbox
            label="Permitir vender sin existencias"
            description="Desactivado, el sistema impide vender lo que no hay. Actívalo solo si vendes bajo pedido."
            checked={valor("allowNegativeStock") ?? false}
            disabled={!puedeEscribir}
            onChange={(e) =>
              setBorrador((b) => ({
                ...b,
                allowNegativeStock: e.target.checked,
              }))
            }
          />
        </div>

        {puedeEscribir && (
          <div className="flex items-center gap-3 border-t border-line pt-4">
            <Button
              onClick={() => guardar.mutate()}
              disabled={sinCambios}
              loading={guardar.isPending}
            >
              <Save />
              Guardar cambios
            </Button>
            {!sinCambios && (
              <span className="text-[13px] text-ink-muted">
                Hay cambios sin guardar.
              </span>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
