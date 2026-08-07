import "dotenv/config";

// Los tests corren contra la misma instancia de Postgres que el desarrollo,
// pero marcados como entorno de test para que los módulos que consultan
// NODE_ENV se comporten en consecuencia.
//
// La aserción es necesaria porque @types/node declara NODE_ENV como readonly:
// aquí la escritura es deliberada y ocurre antes de que se cargue ningún
// módulo de la aplicación.
(process.env as Record<string, string>).NODE_ENV = "test";

// Red de seguridad para el entorno de test: si falta el secreto, se inyecta
// uno determinista en lugar de hacer fallar la carga de `env.ts`.
process.env.SESSION_SECRET ??=
  "test-secret-not-used-in-production-0123456789abcdef";
