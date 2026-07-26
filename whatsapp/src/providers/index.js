/**
 * Capa de proveedores financieros.
 * Wallbit es el proveedor actual. Para integrar otro neobanco/broker,
 * crear un módulo en src/providers/ sin modificar la lógica del sistema.
 */
export { default as wallbit } from "../wallbit/index.js";
