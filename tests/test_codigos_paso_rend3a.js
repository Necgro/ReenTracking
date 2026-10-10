/* Test de los códigos internos con las
 * palabras del glosario, en la app.
 *
 * - Códigos de hoy: RENDIMIENTO, RCM_REINVERTIDO, RCM_RECLAMADO, RCM_MIXTO
 *   y GPP_INMUEBLE. Los antiguos solo quedan en CODIGOS_ANTIGUOS (js/02) y
 *   en la plantilla de la cache (js/05: la cache no cambia).
 * - aplicarAjustesUsuario (js/14): un ajuste con un código antiguo (el
 *   panel antiguo los escribe así) vale como el de hoy.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_codigos_paso_rend3a.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const JS = path.join(RAIZ, "Reental-SPA", "js");
const sb = { console, state: {} };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), sb, { filename: f });
}
vm.runInContext("log = function () {}; toast = function () {};", sb);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const ANTIGUOS = { DIVIDENDO: "RENDIMIENTO", RCM_DIVIDENDO: "RCM_RENDIMIENTO", RCM_VAULT: "RCM_REINVERTIDO",
                   RCM_WALLET: "RCM_RECLAMADO", GPP_PROPIEDAD: "GPP_INMUEBLE" };

console.log("== 1. Tabla de códigos ==");
const tabla = vm.runInContext("CODIGOS_ANTIGUOS", sb);
assert("CODIGOS_ANTIGUOS: los cinco de antes", JSON.stringify(tabla) === JSON.stringify(ANTIGUOS), tabla);
assert("codigoVigente traduce los antiguos y deja los de hoy",
  Object.entries(ANTIGUOS).every(([v, n]) => sb.codigoVigente(v) === n && sb.codigoVigente(n) === n));
assert("lo que no ha cambiado se queda (también nombres de Object.prototype)",
  ["REWARD", "RCM_PENDIENTE", "PENDIENTE", "VENTA", "toString", "constructor"].every(c => sb.codigoVigente(c) === c) &&
  sb.codigoVigente(null) === null && sb.codigoVigente(undefined) === undefined && sb.codigoVigente(3) === 3);

console.log("== 2. El código no usa los antiguos ==");
const archivos = fs.readdirSync(JS).filter(f => f.endsWith(".js"));
const usos = [];
for (const f of archivos) {
  let t = fs.readFileSync(path.join(JS, f), "utf8");
  if (f === "02-utilidades.js") t = t.replace(/const CODIGOS_ANTIGUOS = \{[\s\S]*?\};/, "");
  if (f === "05-cache.js") t = t.replace(/RCM_DIVIDENDO/g, ""); // plantilla de la cache
  t = t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // sin comentarios
  for (const v of Object.keys(ANTIGUOS)) {
    if (new RegExp("(?<![A-Z_])" + v + "(?![A-Z_])").test(t)) usos.push(f + ": " + v);
  }
}
assert("ningún módulo de la app usa un código antiguo", usos.length === 0, usos);
assert("la plantilla de una cache nueva conserva RCM_DIVIDENDO (R8)",
  "RCM_DIVIDENDO" in sb.cacheVacia().leyenda_casillas && !("RCM_RENDIMIENTO" in sb.cacheVacia().leyenda_casillas));
assert("la categoría de hoy se enseña tal cual; REWARD, como «RECOMPENSA»",
  sb.categoriaAMostrar("RENDIMIENTO") === "RENDIMIENTO" && sb.categoriaAMostrar("REWARD") === "RECOMPENSA");
const ops = vm.runInContext("TX_OPERACIONES", sb);
assert("operaciones en llano con los códigos de hoy",
  ops.RCM_REINVERTIDO === "Rendimiento reinvertido" && ops.RCM_RECLAMADO === "Rendimiento reclamado" &&
  ops.RCM_MIXTO === "Rendimiento mixto (a revisar)" && ops.GPP_INMUEBLE === "Venta de tokens" &&
  ops.PENDIENTE === "A revisar" && !("RCM_VAULT" in ops) && !("GPP_PROPIEDAD" in ops), ops);
assert("paleta de colores con RENDIMIENTO", "RENDIMIENTO" in vm.runInContext("TX_COLORES_CATEGORIA", sb) &&
  sb.txClaseCategoria("RENDIMIENTO") === "tx-c-RENDIMIENTO" && sb.txClaseCategoria("DIVIDENDO") === "tx-c-otra");

console.log("== 3. Ajustes del usuario con códigos antiguos ==");
const reg = o => Object.assign({ clave: "k1", categoria: "REVISAR", subcategoria: "PENDIENTE", nota: "", revisar: true, token: "x" }, o);
const ajustar = (r, ajuste) => { sb.aplicarAjustesUsuario([r], { ajustes_usuario: { [r.clave]: ajuste } }); return r; };
let r = ajustar(reg(), { categoria: "VENTA", subcategoria: "GPP_PROPIEDAD", revisar: false });
assert("el ajuste del panel antiguo (VENTA / GPP_PROPIEDAD) → GPP_INMUEBLE",
  r.categoria === "VENTA" && r.subcategoria === "GPP_INMUEBLE" && r.revisar === false, r);
r = ajustar(reg(), { categoria: "DIVIDENDO", subcategoria: "RCM_VAULT" });
assert("DIVIDENDO / RCM_VAULT → RENDIMIENTO / RCM_REINVERTIDO", r.categoria === "RENDIMIENTO" && r.subcategoria === "RCM_REINVERTIDO", r);
r = ajustar(reg(), { categoria: "DIVIDENDO", subcategoria: "RCM_WALLET" });
assert("RCM_WALLET → RCM_RECLAMADO", r.subcategoria === "RCM_RECLAMADO", r);
r = ajustar(reg(), { categoria: "RENDIMIENTO", subcategoria: "RCM_RECLAMADO" });
assert("con los códigos de hoy, igual", r.categoria === "RENDIMIENTO" && r.subcategoria === "RCM_RECLAMADO", r);
r = ajustar(reg(), { categoria: "DIVIDENDO" });
assert("el PENDIENTE de un rendimiento es su mixto (RCM_MIXTO)", r.categoria === "RENDIMIENTO" && r.subcategoria === "RCM_MIXTO", r);
r = ajustar(reg(), { nota: "sigue a revisar" });
assert("en lo demás, PENDIENTE se queda", r.categoria === "REVISAR" && r.subcategoria === "PENDIENTE", r);
r = ajustar(reg(), { token: "DIVIDENDO", nota: "RCM_VAULT" });
assert("los demás campos no se traducen", r.token === "DIVIDENDO" && r.nota === "RCM_VAULT", r);

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
