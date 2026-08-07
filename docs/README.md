# Documentación

Sistema de gestión empresarial para el mercado mexicano: ventas, inventario,
compras, gastos y reportes.

## Por dónde empezar

| Si eres… | Empieza por |
|---|---|
| Desarrollador nuevo en el proyecto | [development.md](development.md) → [architecture.md](architecture.md) |
| Quien va a desplegar | [deployment.md](deployment.md) |
| Quien audita la seguridad | [security.md](security.md) |
| El cliente o quien lo capacita | [user-guide.md](user-guide.md) |
| Quien se pregunta "¿por qué está hecho así?" | [decisions.md](decisions.md) |

## Índice

- **[architecture.md](architecture.md)** — Cómo está organizado el sistema y por qué. Las tres reglas de modularidad.
- **[database.md](database.md)** — Modelo de datos, convenciones de dinero y cantidades, el libro mayor de inventario.
- **[api.md](api.md)** — Endpoints, formato de respuestas y errores.
- **[security.md](security.md)** — Seguridad por capas, amenaza por amenaza. Incluye lo que **no** está cubierto.
- **[deployment.md](deployment.md)** — Despliegue en Vercel, variables de entorno, copias de seguridad.
- **[development.md](development.md)** — Cómo levantar el proyecto y trabajar en él.
- **[user-guide.md](user-guide.md)** — Guía para quien usa el sistema en el mostrador.
- **[decisions.md](decisions.md)** — Registro de decisiones técnicas, con sus alternativas descartadas.

## Lo esencial en un minuto

**El dinero y las cantidades son enteros.** Nunca decimales. Los importes van en
centavos, las cantidades en mili-unidades, las tasas en puntos básicos. Es lo
que hace que los cortes de caja cuadren siempre. Ver [database.md](database.md).

**El inventario es un libro mayor, no un número.** `Product.stock` es solo una
caché; la verdad es la suma de `InventoryMovement`. Toda existencia procede de
un movimiento registrado, con motivo y responsable.

**Las operaciones críticas son atómicas.** Una venta crea documento, líneas,
pagos, movimientos de inventario y auditoría en una sola transacción, con
bloqueo pesimista de las filas de producto. Es imposible que la venta se cree
y el inventario no se actualice.

**El dominio no conoce el framework.** `src/server/` no importa nada de
Next.js. Hay tests que lo verifican.
