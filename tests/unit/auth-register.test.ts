import { describe, expect, it } from "vitest";

import { registerSchema } from "@/server/modules/auth";

const valid = {
  businessName: "Bodega Lima",
  name: "Johan Alfaro",
  email: "JOHAN@EXAMPLE.COM",
  countryCode: "PE",
  password: "segura123",
  confirmPassword: "segura123",
};

describe("registerSchema", () => {
  it("normaliza el correo y acepta un país soportado", () => {
    const result = registerSchema.parse(valid);
    expect(result.email).toBe("johan@example.com");
    expect(result.countryCode).toBe("PE");
  });

  it("rechaza contraseñas que no coinciden", () => {
    const result = registerSchema.safeParse({
      ...valid,
      confirmPassword: "distinta123",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza países fuera del catálogo multipaís", () => {
    const result = registerSchema.safeParse({ ...valid, countryCode: "US" });
    expect(result.success).toBe(false);
  });
});
