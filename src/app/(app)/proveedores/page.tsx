"use client";

import { ClipboardList } from "lucide-react";

import { CatalogPage } from "@/modules/catalog/catalog-page";

/**
 * Proveedores (requisito 10).
 *
 * El campo "Persona de contacto" está antes que el correo a propósito: cuando
 * hay que resurtir, lo primero que se busca es a quién llamar.
 */

interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  rfc: string | null;
  address: string | null;
  notes: string | null;
}

export default function ProveedoresPage() {
  return (
    <CatalogPage<Supplier>
      title="Proveedores"
      description="A quién le compras la mercancía."
      resource="suppliers"
      singular="proveedor"
      writePermission="suppliers:write"
      searchPlaceholder="Buscar por nombre, contacto o RFC…"
      emptyIcon={<ClipboardList />}
      emptyDescription="Registra a tus proveedores para poder asociarlos a productos y compras."
      fields={[
        {
          name: "name",
          label: "Nombre o razón social",
          required: true,
          fullWidth: true,
          placeholder: "Distribuidora del Centro",
        },
        {
          name: "contact",
          label: "Persona de contacto",
          hint: "A quién le hablas para pedir",
          placeholder: "Laura Méndez",
        },
        { name: "phone", label: "Teléfono", type: "tel", placeholder: "55 1234 5678" },
        {
          name: "email",
          label: "Correo",
          type: "email",
          placeholder: "ventas@proveedor.mx",
        },
        {
          name: "rfc",
          label: "RFC",
          hint: "Opcional",
          uppercase: true,
          placeholder: "DCE010203AB4",
        },
        {
          name: "address",
          label: "Dirección",
          fullWidth: true,
          type: "textarea",
        },
        { name: "notes", label: "Notas", type: "textarea" },
      ]}
      columns={[
        {
          key: "contact",
          header: "Contacto",
          cell: (supplier) => (
            <span className="text-[13px] text-ink-muted">
              {supplier.contact ?? "—"}
            </span>
          ),
        },
        {
          key: "phone",
          header: "Teléfono",
          hideOnMobile: true,
          cell: (supplier) => (
            <span className="numeric text-[13px] text-ink-muted">
              {supplier.phone ?? "—"}
            </span>
          ),
        },
        {
          key: "rfc",
          header: "RFC",
          hideOnMobile: true,
          cell: (supplier) => (
            <span className="numeric text-[13px] text-ink-muted">
              {supplier.rfc ?? "—"}
            </span>
          ),
        },
      ]}
      deleteDescription={(supplier) =>
        `"${supplier.name}" dejará de aparecer al registrar compras y al asignar productos. Las compras ya registradas lo conservan intacto.`
      }
    />
  );
}
