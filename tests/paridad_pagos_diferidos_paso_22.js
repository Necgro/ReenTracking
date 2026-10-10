/* PARIDAD de los pagos diferidos: validación y referencias.
 *
 * Lee los escenarios sinteticos de los casos, los pasa por las funciones
 * de la app (Reental-SPA/js/14-clasificador.js) y compara con las cifras
 * de referencia de la app (tests/cifras_referencia.js):
 * - validarPagosDiferidos: las mismas cadenas EXACTAS, en el mismo orden.
 * - resolverReferenciaMovimiento: la misma clave de registro resuelta.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_pagos_diferidos_paso_22.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const { leerCasos, referencia, minimo } = require("./cifras_referencia.js");
const datos = leerCasos("paridad_paso_22.json");

const sandbox = { console, state: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sandbox);  // los casos son en UTC
const { resolverReferenciaMovimiento, validarPagosDiferidos } = sandbox;

minimo(datos.escenarios.concat(datos.resolver), 44, "comprobaciones");
let total = 0, fallos = 0;
function comprobar(nombre, difs, ok) {
  total++;
  if (!difs.length) { console.log("  OK   " + nombre + " " + ok); return; }
  fallos++;
  console.log("  FAIL " + nombre + ": " + difs.join(" | "));
}

console.log("Validacion · la misma lista de problemas (cadenas exactas, mismo orden)");
for (const e of datos.escenarios) {
  const problemas = validarPagosDiferidos(e.blk, e.regs);
  comprobar(e.nombre, referencia(e, "salida", problemas), "(" + problemas.length + " problema(s))");
}

console.log("Resolucion · la misma clave resuelta (o null)");
for (const r of datos.resolver) {
  const reg = resolverReferenciaMovimiento(r.ref, r.regs);
  const clave = reg === null ? null : reg.clave;
  comprobar(r.nombre, referencia(r, "salida", clave), "→ " + (clave === null ? "null" : clave.slice(0, 20) + "…"));
}

console.log(fallos === 0
  ? `\nRESULTADO: ${total} comprobaciones iguales a lo grabado, TODO VERDE ✔`
  : `\nRESULTADO: ${fallos} FALLO(S) de ${total} ✘`);
process.exit(fallos === 0 ? 0 : 1);
