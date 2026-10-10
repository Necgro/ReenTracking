/* PARIDAD de los rendimientos desde el CSV, con y sin vault.
 *
 * Lee los escenarios de los casos (cache de entrada + config + texto del
 * CSV), pasa cada uno por la clasificacion de la app (js/01, 02, 05, 10 y
 * 14 en una VM de Node: lector del CSV, descubrimiento y clasificacion,
 * como ejecutarClasificacion sin DOM) y compara con las cifras de
 * referencia de la app (tests/cifras_referencia.js) registro a registro,
 * campo a campo, e informe de vinculos. Escenarios: con vault, sin vault
 * con sus series y sin vault ni series, cada uno sin y con vinculos.
 * Ademas, todo RENDIMIENTO emitido desde el CSV lleva sus campos de
 * retencion.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_sin_vault_paso_div13.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const { leerCasos, referencia, minimo } = require("./cifras_referencia.js");
const { csv_texto: csvTexto, escenarios } = leerCasos("paridad_div13.json");

// Campos que la app pone en cada RENDIMIENTO del CSV.
const CAMPOS_RETENCION = ["integro_usdt", "retencion_usdt", "fecha_cobro"];

/* Los campos de retencion estan (no solo «coinciden por faltar») en todo
   RENDIMIENTO emitido desde el CSV. */
const sinCamposRetencion = regs => regs
  .filter(r => r.categoria === "RENDIMIENTO" && r.fuente === "CSV_REENTAL" && CAMPOS_RETENCION.some(k => !(k in r)))
  .map(r => `${r.clave}: RENDIMIENTO del CSV sin campos de retencion`);

// Clasificacion de la app (ejecutarClasificacion sin DOM).
function ejecutarApp(cacheRaw, config) {
  const sb = { console, log: () => {}, toast: () => {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js",
                   "10-csv-descubrimiento.js", "14-clasificador.js"]) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  }
  vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sb);  // los casos son en UTC
  sb.__cache = structuredClone(cacheRaw);
  sb.__config = structuredClone(config);
  sb.__csv = csvTexto;
  sb.__informe = {};
  // log() y toast() de js/02 pintan en la pagina: aqui no hay DOM.
  vm.runInContext(`
    log = () => {}; toast = () => {};
    state.config = __config;
    __csvRes = cargarCsvRendimientos(__csv);
    __c = asegurarEstructuraCache(__cache);
    descubrimientoDinamico(__c, __csvRes.filas, __csvRes.indicePorHash,
      normalizarDireccion(__config.wallet), normalizarDireccion(__config.vault));
    __regs = clasificarTransacciones(__c, __csvRes.filas, __csvRes.indicePorHash,
      __config, __informe);
  `, sb);
  return { registros: sb.__regs, informe: sb.__informe };
}

minimo(escenarios, 6, "escenarios");
let fallos = 0;
for (const e of escenarios) {
  console.log(`\n=== ${e.nombre} ===`);
  const app = ejecutarApp(e.cache, e.config);
  const regs = app.registros;
  const rendimientos = regs.filter(r => r.categoria === "RENDIMIENTO");
  console.log(`  registros: ${regs.length} · a revisar: ${regs.filter(r => r.revisar).length}` +
              ` · RENDIMIENTO: ${rendimientos.length} (con retencion: ${rendimientos.filter(r => (r.retencion_usdt || 0) > 0).length})`);
  const diffs = sinCamposRetencion(regs).concat(referencia(e, "salida", app));
  if (diffs.length === 0) {
    console.log("  OK: igual a lo grabado registro a registro (tambien integro, retencion y fecha de cobro) e informe ✔");
  } else {
    fallos++;
    const maxD = parseInt(process.env.PARIDAD_MAX_DIFFS || "6", 10);
    for (const d of diffs.slice(0, maxD)) console.log("  DIFF " + d);
    if (diffs.length > maxD) console.log(`  ... y ${diffs.length - maxD} diferencia(s) mas`);
  }
}

console.log(fallos === 0
  ? `\nRESULTADO: verde en ${escenarios.length} escenarios (con vault, sin vault con series y sin vault ni series), iguales a lo grabado ✔`
  : `\nRESULTADO: ${fallos} escenario(s) con diferencias ✘`);
process.exit(fallos === 0 ? 0 : 1);
