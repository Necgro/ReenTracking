/* PARIDAD de la clasificacion con pagos diferidos.
 *
 * Lee los escenarios de los casos (cache de entrada + config), pasa cada
 * uno por la clasificacion de la app (Reental-SPA/js) y
 * compara con las cifras de referencia de la app (tests/cifras_referencia.js)
 * registro a registro: categorias, subcategorias, importes, revisar,
 * notas, marcadores pago_diferido... e informe (aplicados/problemas/
 * conflictos). CON y SIN vinculos.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_pagos_diferidos_paso_24.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const { leerCasos, referencia, minimo } = require("./cifras_referencia.js");
const escenarios = leerCasos("paridad_paso_24.json");

function ejecutarApp(cacheRaw, config) {
  const sandbox = { console, log: () => {}, toast: () => {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "14-clasificador.js"]) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
  }
  vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sandbox);  // los casos son en UTC
  sandbox.__cache = structuredClone(cacheRaw);
  sandbox.__config = structuredClone(config);
  sandbox.__informe = {};
  vm.runInContext(`
    state.config = __config;
    __regs = clasificarTransacciones(
      asegurarEstructuraCache(__cache), [], {}, __config, __informe);
  `, sandbox);
  return { registros: sandbox.__regs, informe: sandbox.__informe };
}

minimo(escenarios, 5, "escenarios");
let fallos = 0;
for (const e of escenarios) {
  const app = ejecutarApp(e.cache, e.config);
  console.log(`\n=== ${e.nombre} ===\n  registros: ${app.registros.length} · aplicados: ${(app.informe.aplicados || []).length}`);
  const difs = referencia(e, "salida", app);
  if (!difs.length) console.log("  OK: igual a lo grabado (registros + informe) ✔");
  else {
    fallos++;
    const maxD = parseInt(process.env.PARIDAD_MAX_DIFFS || "6", 10);
    for (const d of difs.slice(0, maxD)) console.log("  DIFF " + d);
    if (difs.length > maxD) console.log(`  ... y ${difs.length - maxD} diferencia(s) mas`);
  }
}

console.log(fallos === 0
  ? `\nRESULTADO: verde en ${escenarios.length} escenarios (con y sin vinculos), iguales a lo grabado ✔`
  : `\nRESULTADO: ${fallos} escenario(s) con diferencias ✘`);
process.exit(fallos === 0 ? 0 : 1);
