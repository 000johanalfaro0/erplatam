/**
 * API pública del módulo `products`.
 *
 * Otros módulos consumen SOLO lo que aparece aquí. El repositorio, en
 * particular, queda deliberadamente fuera: si el módulo de ventas pudiera
 * escribir directamente en la tabla de productos, se saltaría las reglas de
 * inventario y auditoría que este módulo garantiza.
 */

export {
  create,
  getByCode,
  getById,
  list,
  remove,
  update,
} from "./service";

export {
  createProductSchema,
  listProductsSchema,
  updateProductSchema,
  type CreateProductInput,
  type ListProductsInput,
  type UpdateProductInput,
} from "./schema";

export { countLowStock, type ProductListItem } from "./repository";
