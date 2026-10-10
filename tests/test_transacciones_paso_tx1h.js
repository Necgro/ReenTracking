/* Test unitario de 📒 Transacciones: filtro de fechas y colores de fila.
 *
 * Funciones bajo prueba (Reental-SPA/js/18-transacciones.js):
 * - txEntreFechas: desde y hasta incluidos, uno solo, al revés, sin fecha.
 * - txPasaFiltros / txFiltrar: Desde / Hasta junto a los demás filtros y en
 *   el recuento facetado del selector de categoría.
 * - txCssColoresCategoria: sin la franja de color de la fila.
 * - Nada cambia por dentro: las funciones no mutan los registros.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_tx1h.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
function reg(clave, fecha, categoria = "COMPRA", extra = {}) {
  return Object.assign({
    clave, fecha, hash: "0x" + clave.padStart(4, "0") + "ab".repeat(30), contrato: null, token: null, simbolo: null,
    cantidad: 1, categoria, subcategoria: "", inmueble: null, importe_usdt: null, coste_eur: null,
    origen: "", destino: "", fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}

console.log("== 1. txEntreFechas ==");
const r15 = reg("a", "2026-06-15 23:59:59");
assert("sin límites: pasa", S.txEntreFechas(r15, "", ""));
assert("los dos días incluidos", S.txEntreFechas(r15, "2026-06-15", "2026-06-15"));
assert("dentro", S.txEntreFechas(r15, "2026-06-01", "2026-06-30"));
assert("antes de desde: no", !S.txEntreFechas(r15, "2026-06-16", ""));
assert("después de hasta: no", !S.txEntreFechas(r15, "", "2026-06-14"));
assert("solo desde", S.txEntreFechas(r15, "2026-01-01", ""));
assert("solo hasta", S.txEntreFechas(r15, "", "2026-12-31"));
assert("al revés: se toman en su orden", S.txEntreFechas(r15, "2026-06-30", "2026-06-01"));
assert("sin fecha y con un límite: no", !S.txEntreFechas(reg("b", null), "2026-01-01", ""));
assert("sin fecha y sin límites: pasa", S.txEntreFechas(reg("b", null), "", ""));
assert("fecha rara: no", !S.txEntreFechas(reg("c", "ayer"), "2026-01-01", ""));

console.log("== 2. Junto a los demás filtros ==");
const regs = [
  reg("1", "2025-12-31 10:00:00"),
  reg("2", "2026-01-01 00:00:01", "RENDIMIENTO"),
  reg("3", "2026-03-10 12:00:00"),
  reg("4", "2026-06-20 08:00:00", "RENDIMIENTO"),
  reg("5", "2026-06-20 09:00:00", "SPAM"),
  reg("6", null),
];
const antes = JSON.stringify(regs);
const claves = f => S.txFiltrar(regs, Object.assign({ ocultarSpam: true }, f)).map(r => r.clave).join(",");
assert("sin fechas: todos menos el spam, recientes primero", claves({}) === "4,3,2,1,6", claves({}));
assert("desde 01/01/2026", claves({ desde: "2026-01-01" }) === "4,3,2", claves({ desde: "2026-01-01" }));
assert("hasta 10/03/2026 (incluido)", claves({ hasta: "2026-03-10" }) === "3,2,1", claves({ hasta: "2026-03-10" }));
assert("entre fechas y con categoría", claves({ desde: "2026-01-01", hasta: "2026-12-31", categoria: "RENDIMIENTO" }) === "4,2");
assert("entre fechas y con ejercicio 2025: nada", claves({ desde: "2026-01-01", ejercicio: "2025" }) === "");
assert("el spam sigue fuera aunque caiga entre las fechas", !claves({ desde: "2026-06-20", hasta: "2026-06-20" }).includes("5"));
assert("en el modo spam, también por fechas", claves({ categoria: "SPAM", desde: "2026-06-20" }) === "5");
const conteo = S.txConteoCategorias(regs, { ocultarSpam: true, desde: "2026-06-01" });
const n = c => (conteo.find(x => x.categoria === c) || {}).n || 0;
assert("selector de categoría: cuenta con las fechas puestas", n("RENDIMIENTO") === 1 && n("COMPRA") === 0 && n("SPAM") === 1, conteo);
assert("no muta los registros", JSON.stringify(regs) === antes);

console.log("== 3. Sin franja de color en la fila ==");
const css = S.txCssColoresCategoria();
assert("sin box-shadow ni :first-child", !css.includes("box-shadow") && !css.includes("first-child"));
assert("la etiqueta sigue con su color", css.includes(".tx-cat.tx-c-RENDIMIENTO{"));

console.log("");
console.log("RESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
