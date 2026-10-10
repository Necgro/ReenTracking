/* PARIDAD de los pagos diferidos: pasa cada escenario de los casos por
 * aplicarPagosDiferidos y logPagosDiferidos de js/14 y compara registros,
 * informe (aplicados, problemas y conflictos), log o el error si se para,
 * con las cifras de referencia de la app (tests/cifras_referencia.js).
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_arreglos_paso_arreglos7.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const lineas = [];
const sandbox = { console, state: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sandbox);  // los casos son en UTC
sandbox.log = t => lineas.push(t);

const { leerCasos, referencia, minimo } = require("./cifras_referencia.js");
const datos = leerCasos("paridad_arreglos7.json");
minimo(datos, 32, "escenarios");
let fallos = 0;
for (const e of datos) {
  const regs = JSON.parse(JSON.stringify(e.regs));
  const cache = JSON.parse(JSON.stringify(e.cache));
  lineas.length = 0;
  let app;
  try {
    const info = sandbox.aplicarPagosDiferidos(regs, cache);
    sandbox.logPagosDiferidos(info);
    app = { ok: true, regs, info, log: lineas.map(l => l + "\n").join("") };
  } catch (ex) { app = { ok: false, error: String(ex) }; }
  const difs = app.ok ? referencia(e, "salida", app) : ["la app se para: " + app.error];   // nunca vale como referencia
  if (difs.length) {
    fallos++;
    console.log("  FALLO " + e.nombre);
    for (const d of difs.slice(0, 12)) console.log("     " + d);
  } else {
    console.log("  ok " + e.nombre);
  }
}
console.log("");
console.log(fallos
  ? `RESULTADO: ${fallos} de ${datos.length} escenarios distintos de lo grabado — HAY FALLOS`
  : `RESULTADO: verde en ${datos.length} escenarios de ARREGLOS-7, iguales a lo grabado ✔`);
process.exit(fallos ? 1 : 0);
