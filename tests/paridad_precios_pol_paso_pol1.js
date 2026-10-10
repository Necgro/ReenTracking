/* PARIDAD de los precios de POL.
 *
 * Lee los escenarios de los casos, clasifica su cache con js/14 y compara
 * con las cifras de referencia de la app (tests/cifras_referencia.js),
 * escenario a escenario:
 *   - las fechas que se piden (fechasConMovimientoPol, js/08);
 *   - las fechas que se quedan sin valorar por falta del precio de POL
 *     (pnFechasSinPrecioPol, js/11).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz):
 *   node tests/paridad_precios_pol_paso_pol1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const { leerCasos, referencia, minimo } = require("./cifras_referencia.js");
const datos = leerCasos("paridad_pol1.json");
const AHORA = Date.UTC(2026, 9, 3, 12, 0, 0);

const nodo = () => ({ children: [], dataset: {}, style: {}, appendChild(c) { this.children.push(c); return c; },
  setAttribute() {}, addEventListener() {}, querySelectorAll() { return []; } });
minimo(Object.keys(datos.escenarios), 4, "escenarios");
let fallos = 0;
for (const [nombre, esc] of Object.entries(datos.escenarios)) {
  const sb = { console, URLSearchParams, document: { getElementById: () => nodo(), createElement: () => nodo() } };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "08-coingecko.js", "10-csv-descubrimiento.js",
    "14-clasificador.js", "15-correcciones.js", "18-transacciones.js", "11-panel.js"])
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  Object.assign(sb, { __cache: esc.cache, __config: datos.config });
  vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sb);  // los casos son en UTC
  vm.runInContext(`log = () => {}; toast = () => {};
    state.config = __config;
    __c = asegurarEstructuraCache(__cache);
    __regs = clasificarTransacciones(__c, [], {}, __config, {});`, sb);
  const mov = vm.runInContext("fechasConMovimientoPol(__c)", sb).slice().sort();
  const sin = vm.runInContext(`pnFechasSinPrecioPol(__c, __regs, ${AHORA})`, sb).map(x => x[0]);
  const difs = referencia(esc, "salida", { movimientos: mov, sin_precio: sin });
  if (!difs.length) console.log("  OK   " + nombre + ": pide " + JSON.stringify(mov) + "; sin precio " + JSON.stringify(sin));
  else { fallos++; console.error("  FALLO " + nombre + ": " + difs.join(" | ")); }
}
console.log("\nRESULTADO: " + (fallos ? fallos + " escenarios distintos de lo grabado ✘"
  : "verde en " + Object.keys(datos.escenarios).length + " escenarios de los precios de POL, iguales a lo grabado ✔"));
process.exit(fallos ? 1 : 0);
