/* PARIDAD de apartar (🚫 «Mandar al spam» y ↩ «Quitar del spam»).
 *
 * Lee los escenarios de los casos (base, apartado y deshecho, con los datos
 * del usuario), pasa cada uno por la clasificacion de la app (js/01, 02,
 * 05, 10 y 14 en una VM de Node, como ejecutarClasificacion sin DOM) y
 * compara con las cifras de referencia de la app (tests/cifras_referencia.js)
 * registro a registro, campo a campo. Comprueba además que los ajustes del
 * escenario apartado son exactamente los que escribe la app
 * (txAjustesConSpam de js/18) y que deshacer (txAjustesSinSpam) los deja
 * como estaban.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_apartar_paso_apartar1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const BASE = path.join(RAIZ, "Reental-SPA", "js");
const { leerCasos, referencia, diferencias, comoGrabado, minimo } = require("./cifras_referencia.js");
const datos = leerCasos("paridad_apartar1.json");

function contexto(archivos) {
  const sb = { console, log: () => {}, toast: () => {}, state: {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sb);  // los casos son en UTC
  vm.runInContext("log = () => {}; toast = () => {};", sb);
  return sb;
}

const eqVal = (a, b) => !diferencias(comoGrabado(a), comoGrabado(b)).length;

function ejecutarApp(cacheRaw) {
  const sb = contexto(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"]);
  Object.assign(sb, { __cache: structuredClone(cacheRaw), __config: structuredClone(datos.config), __csv: datos.csv_texto });
  vm.runInContext(`
    state.config = __config;
    __csvRes = cargarCsvRendimientos(__csv);
    __c = asegurarEstructuraCache(__cache);
    descubrimientoDinamico(__c, __csvRes.filas, __csvRes.indicePorHash,
      normalizarDireccion(__config.wallet), normalizarDireccion(__config.vault));
    __regs = clasificarTransacciones(__c, __csvRes.filas, __csvRes.indicePorHash, __config, {});
  `, sb);
  return sb.__regs;
}

minimo(datos.escenarios, 3, "escenarios");
let fallos = 0;
function comprobar(nombre, cond, extra) {
  console.log((cond ? "  OK   " : "  FALLO ") + nombre + (!cond && extra ? " -> " + extra : ""));
  if (!cond) fallos++;
}

console.log("=== Los ajustes que escribe la app ===");
const tx = contexto(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"]);
const [base, apartado, deshecho] = datos.escenarios;
let ajustes = base.cache.ajustes_usuario || {};
for (const c of datos.polvo) ajustes = tx.txAjustesConSpam(ajustes, c, "spam", datos.fecha + "T10:00:00Z");
for (const c of datos.spam_app) ajustes = tx.txAjustesConSpam(ajustes, c, "sacar", datos.fecha + "T10:00:00Z");
comprobar("son los del escenario apartado", eqVal(ajustes, apartado.cache.ajustes_usuario));
let vuelta = ajustes;
for (const c of datos.polvo.concat(datos.spam_app)) vuelta = tx.txAjustesSinSpam(vuelta, c);
comprobar("deshacer los deja como estaban", eqVal(vuelta, deshecho.cache.ajustes_usuario));

for (const e of datos.escenarios) {
  console.log(`=== ${e.nombre} ===`);
  const regs = ejecutarApp(e.cache);
  const diffs = referencia(e, "salida", regs);
  comprobar(`igual a lo grabado registro a registro (${regs.length} registros, ${regs.filter(r => r.revisar).length} a revisar)`,
    diffs.length === 0, diffs.slice(0, 5).join(" | "));
  if (e.nombre !== "base") {
    const estados = regs.map(r => tx.txEstadoSpam(r, e.cache.ajustes_usuario));
    const n = est => estados.filter(x => x === est).length;
    console.log(`    en la tabla: 🚫 mandar ${n("mandar")} · ↩ quitar ${n("quitar")} · ↩ sacar ${n("sacar")} · 🚫 devolver ${n("devolver")}`);
    if (e.nombre === "apartado") {
      comprobar("cada movimiento lleva el icono para deshacerlo",
        n("quitar") === datos.polvo.length && n("devolver") === datos.spam_app.length);
    }
  }
}

console.log(fallos ? `\nRESULTADO: ${fallos} fallo(s) ✘` : "\nRESULTADO: verde al mandar al spam, sacar y deshacer, igual a lo grabado ✔");
process.exit(fallos ? 1 : 0);
