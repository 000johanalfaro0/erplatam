import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/server/core/audit";
import {
  AUDIT_LABELS,
  SENSITIVE_ACTIONS,
  describeAuditAction,
} from "@/lib/audit-labels";

describe("Etiquetas de la bitácora", () => {
  it("TODA acción auditable tiene traducción al español", () => {
    /*
     * Este test es la razón de existir del módulo.
     *
     * Sin él, añadir una acción nueva a AUDIT_ACTIONS y olvidar su etiqueta
     * hace que en el panel aparezca "Administrador feedback.create" — que fue
     * exactamente lo que pasó y se detectó mirando una captura, no
     * compilando.
     *
     * Ahora el olvido rompe la suite en lugar de llegar a la demo.
     */
    const sinTraducir = Object.values(AUDIT_ACTIONS).filter(
      (action) => !(action in AUDIT_LABELS),
    );

    expect(
      sinTraducir,
      `Faltan etiquetas en AUDIT_LABELS para: ${sinTraducir.join(", ")}`,
    ).toEqual([]);
  });

  it("no hay etiquetas huérfanas apuntando a acciones inexistentes", () => {
    // El caso contrario: una etiqueta que sobra indica que se renombró o
    // eliminó una acción y quedó basura.
    const acciones = new Set<string>(Object.values(AUDIT_ACTIONS));
    const huerfanas = Object.keys(AUDIT_LABELS).filter(
      (key) => !acciones.has(key),
    );

    expect(
      huerfanas,
      `Etiquetas que ya no corresponden a ninguna acción: ${huerfanas.join(", ")}`,
    ).toEqual([]);
  });

  it("las traducciones están en español y en tercera persona", () => {
    // Todas deben poder completar la frase "El usuario ___".
    for (const [action, label] of Object.entries(AUDIT_LABELS)) {
      expect(label, `"${action}" no debería empezar en mayúscula`).toBe(
        label.charAt(0).toLowerCase() + label.slice(1),
      );
      expect(label.length, `"${action}" tiene una etiqueta vacía`).toBeGreaterThan(3);
    }
  });

  it("devuelve el verbo original si no hay traducción", () => {
    // Perder una entrada de la bitácora es peor que mostrarla fea.
    expect(describeAuditAction("algo.desconocido")).toBe("algo.desconocido");
  });

  it("las acciones sensibles existen todas", () => {
    const acciones = new Set<string>(Object.values(AUDIT_ACTIONS));
    for (const sensible of SENSITIVE_ACTIONS) {
      expect(acciones.has(sensible), `${sensible} no existe`).toBe(true);
    }
  });

  it("cancelar y ajustar están marcadas como sensibles", () => {
    // Son las operaciones con las que se roba en un negocio: cancelar una
    // venta ya cobrada, o ajustar inventario para tapar un faltante.
    expect(SENSITIVE_ACTIONS.has(AUDIT_ACTIONS.SALE_VOID)).toBe(true);
    expect(SENSITIVE_ACTIONS.has(AUDIT_ACTIONS.INVENTORY_ADJUST)).toBe(true);
  });
});
