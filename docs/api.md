# API

Base: `/api/v1`. Autenticación por cookie de sesión (`httpOnly`), enviada
automáticamente por el navegador.

## Formato de respuestas

**Éxito**
```json
{ "data": { ... } }
```

**Error**
```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "No hay existencia suficiente de \"Cloro 1 L\".",
    "details": { "productName": "Cloro 1 L", "available": 4000, "requested": 5000 }
  }
}
```

`message` **siempre** es apto para mostrar al usuario: el servidor nunca envía
detalles técnicos ahí. `code` permite reaccionar de forma programática sin
parsear texto en español.

**Listados paginados**
```json
{ "data": { "items": [...], "total": 312, "page": 1, "pageSize": 25 } }
```

## Códigos de error

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Datos inválidos. `details` trae los errores por campo |
| `INVALID_CREDENTIALS` | 401 | Correo o contraseña incorrectos |
| `UNAUTHENTICATED` | 401 | Sesión ausente, caducada o revocada |
| `FORBIDDEN` | 403 | Sin permiso para la operación |
| `NOT_FOUND` | 404 | El recurso no existe o fue eliminado |
| `CONFLICT` | 409 | Choque con un dato existente (SKU duplicado) |
| `INSUFFICIENT_STOCK` | 409 | Existencia insuficiente |
| `BUSINESS_RULE` | 409 | Regla de negocio violada |
| `RATE_LIMITED` | 429 | Demasiadas peticiones. Cabecera `Retry-After` |
| `INTERNAL` | 500 | Fallo no previsto. El detalle solo va al log |

`INVALID_CREDENTIALS` está separado de `UNAUTHENTICATED` a propósito: el primero
debe quedarse en el formulario mostrando el error; el segundo debe redirigir al
login.

## Endpoints

### Autenticación
| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/auth/login` | Inicia sesión y fija la cookie |
| `POST` | `/auth/logout` | Cierra sesión. Idempotente |
| `GET` | `/auth/me` | Usuario, permisos y configuración del negocio |

### Referencia
| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/reference` | Categorías, proveedores, tasas, métodos de pago y categorías de gasto en una sola petición |

Endpoint agregado a propósito: un formulario de producto necesita tres de esas
listas, y pedirlas por separado serían tres peticiones en cascada.

### Productos
| Método | Ruta |
|---|---|
| `GET` | `/products` — filtros: `search`, `categoryId`, `status`, `lowStock`, `page`, `pageSize`, `sortBy`, `sortDir` |
| `POST` | `/products` |
| `GET` `PATCH` `DELETE` | `/products/:id` |

`DELETE` es **borrado lógico**. `PATCH` **no** acepta `stock`: cambiar
existencias exige el módulo de inventario, con motivo y registro.

### Inventario
| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/inventory/movements` | Kardex. Filtros: `productId`, `type`, `from`, `to` |
| `POST` | `/inventory/movement` | Entrada o salida manual. `reason` obligatorio |
| `POST` | `/inventory/adjust` | Ajuste por conteo. Se envía `countedQuantity`, no la diferencia |

### Ventas
| Método | Ruta |
|---|---|
| `GET` | `/sales` — filtros: `search`, `status`, `customerId`, `from`, `to` |
| `POST` | `/sales` |
| `GET` | `/sales/:id` |
| `POST` | `/sales/:id/void` |

Cancelar es `POST` y no `DELETE` deliberadamente: la venta no se borra, se
registra un hecho nuevo.

```json
POST /sales
{
  "items": [{ "productId": "uuid", "quantity": 3000, "discountCents": 0 }],
  "payments": [{ "paymentMethodId": "uuid", "amountCents": 6600, "receivedCents": 10000 }],
  "customerId": null,
  "discountCents": 0,
  "idempotencyKey": "uuid-por-intento-de-cobro"
}
```

`quantity` en **mili-unidades** (3000 = 3 piezas). Importes en **centavos**.

Los pagos deben sumar **exactamente** el total o la venta se rechaza.

`idempotencyKey`: reenviar la misma clave devuelve la venta existente en lugar
de cobrar dos veces.

### Compras
| Método | Ruta |
|---|---|
| `GET` `POST` | `/purchases` |
| `GET` | `/purchases/:id` |
| `POST` | `/purchases/:id/void` |

Registrar una compra recibe la mercancía **y actualiza el costo** del producto.
Cancelarla puede fallar con `BUSINESS_RULE` si la mercancía ya se vendió.

### Gastos, clientes, proveedores, categorías
| Método | Ruta |
|---|---|
| `GET` `POST` | `/expenses`, `/customers`, `/suppliers`, `/categories` |
| `PATCH` `DELETE` | `/expenses/:id`, `/customers/:id`, `/suppliers/:id`, `/categories/:id` |
| `GET` | `/customers/:id/history` — compras del cliente con total y ticket promedio |

`/categories` acepta `?kind=product|expense`.

`/expenses` devuelve además `totalAmountCents` con la suma de **todos** los
resultados del filtro, no solo de la página visible.

### Reportes
```
GET /reports?type=<tipo>&from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|csv
```

| `type` | Devuelve |
|---|---|
| `summary` | Estado de resultados del periodo |
| `sales` | Ventas por periodo. Acepta `granularity=day\|week\|month` |
| `products` | Productos vendidos, ordenados por utilidad |
| `expenses` | Gastos por categoría |
| `inventory` | Valor del inventario. No acepta rango: es una foto del momento |

`format=csv` devuelve una descarga con BOM UTF-8 y fórmulas neutralizadas.

Los cortes de día se calculan en la **zona horaria del negocio**, no en UTC.

### Feedback y cuestionario
| Método | Ruta |
|---|---|
| `GET` `POST` | `/feedback` |
| `GET` `PATCH` | `/feedback/:id` |
| `GET` | `/feedback/:id/screenshot` — imagen binaria |
| `GET` `PUT` | `/discovery` |

Cambiar el estado de una anotación requiere `feedback:manage`: el cliente puede
dejar feedback pero no marcarlo como implementado.

## Límites de peticiones

| Tipo | Límite |
|---|---|
| Login | 10 / minuto por IP+correo |
| Escrituras | 120 / minuto por usuario |
| Lecturas | 600 / minuto por usuario |
| Subidas | 20 / minuto por usuario |

⚠️ El contador vive en memoria del proceso. En serverless no es una defensa
sólida — ver [security.md](security.md).

## Permisos

Formato `recurso:acción`, con comodines `recurso:*` y `*`.

| Rol | Puede |
|---|---|
| `ADMIN` | Todo |
| `MANAGER` | Opera y consulta. **No** usuarios ni configuración |
| `EMPLOYEE` | Vende y consulta. **No** cancelar ventas ni ajustar inventario |
