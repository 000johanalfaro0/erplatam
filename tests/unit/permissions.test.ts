import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROLES,
  PERMISSIONS,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from "@/server/core/permissions";

describe("hasPermission", () => {
  it("concede el permiso exacto", () => {
    expect(hasPermission(["sales:create"], "sales:create")).toBe(true);
  });

  it("niega lo que no está concedido", () => {
    expect(hasPermission(["sales:create"], "sales:void")).toBe(false);
    expect(hasPermission([], "sales:create")).toBe(false);
  });

  it("respeta el comodín total", () => {
    expect(hasPermission(["*"], "settings:write")).toBe(true);
  });

  it("respeta el comodín por recurso", () => {
    expect(hasPermission(["sales:*"], "sales:void")).toBe(true);
    expect(hasPermission(["sales:*"], "products:write")).toBe(false);
  });

  it("no confunde recursos con prefijo común", () => {
    // "sale" no debe conceder nada sobre "sales".
    expect(hasPermission(["sale:*"], "sales:create")).toBe(false);
  });
});

describe("hasAllPermissions / hasAnyPermission", () => {
  const granted = ["sales:read", "sales:create"];

  it("exige todos", () => {
    expect(hasAllPermissions(granted, ["sales:read", "sales:create"])).toBe(true);
    expect(hasAllPermissions(granted, ["sales:read", "sales:void"])).toBe(false);
  });

  it("basta con uno", () => {
    expect(hasAnyPermission(granted, ["sales:void", "sales:read"])).toBe(true);
    expect(hasAnyPermission(granted, ["sales:void"])).toBe(false);
  });
});

describe("roles por defecto", () => {
  it("ADMIN puede todo", () => {
    const admin = DEFAULT_ROLES.ADMIN.permissions;
    for (const permission of Object.values(PERMISSIONS)) {
      expect(hasPermission(admin, permission)).toBe(true);
    }
  });

  it("el cajero puede vender pero NO cancelar ventas", () => {
    // Separación deliberada: cancelar es la operación con la que se roba.
    const cajero = DEFAULT_ROLES.EMPLOYEE.permissions;
    expect(hasPermission(cajero, PERMISSIONS.SALES_CREATE)).toBe(true);
    expect(hasPermission(cajero, PERMISSIONS.SALES_VOID)).toBe(false);
  });

  it("el cajero NO puede ajustar inventario ni ver reportes", () => {
    const cajero = DEFAULT_ROLES.EMPLOYEE.permissions;
    expect(hasPermission(cajero, PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
    expect(hasPermission(cajero, PERMISSIONS.REPORTS_READ)).toBe(false);
  });

  it("el encargado opera pero NO administra usuarios ni configuración", () => {
    const encargado = DEFAULT_ROLES.MANAGER.permissions;
    expect(hasPermission(encargado, PERMISSIONS.SALES_VOID)).toBe(true);
    expect(hasPermission(encargado, PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
    expect(hasPermission(encargado, PERMISSIONS.USERS_WRITE)).toBe(false);
    expect(hasPermission(encargado, PERMISSIONS.SETTINGS_WRITE)).toBe(false);
  });
});
