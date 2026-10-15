/* A8 (auditoría de CANJE-1 y HORA-1): la «primera aparición» de un token
 * del catálogo guardada con el día UTC (cache de antes de pasar las fechas
 * a la hora española) pasa a su día español si su primera llegada fue de
 * 00:00 a 01:00 (02:00 en verano). Una fecha guardada más antigua se
 * queda (la descarga puede no tener todo).
 *
 * Bajo prueba (js/10): primerasApariciones y registrarInmueble.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_catalogo_hora_paso_a8.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sb = { console, document: { getElementById: () => null } };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
const g = n => vm.runInContext(n, sb);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const P = "0x" + "a1".repeat(20);
const tx = iso => ({ timeStamp: String(Date.parse(iso) / 1000), contractAddress: P });
const primera = (iso, guardada) => {
  const primeras = g("primerasApariciones")({ transacciones: { wallet_tokens: [tx(iso)], vault_tokens: [] } });
  const catalogo = guardada === undefined ? {} : { [P]: { estado: "CONFIRMADA", via: "A", refuerzos: [], primera_aparicion: guardada } };
  g("registrarInmueble")(catalogo, P, "Casa", "RC1", "A", primeras[P], null, []);
  return catalogo[P].primera_aparicion;
};

assert("la primera llegada lleva su hora española", g("primerasApariciones")({ transacciones: {
  wallet_tokens: [tx("2025-03-01T23:30:00Z")], vault_tokens: [] } })[P] === "2025-03-02 00:30:00");
assert("token nuevo: se guarda el día español", primera("2025-03-01T23:30:00Z") === "2025-03-02");
assert("guardado el día UTC (01/03): pasa al 02/03", primera("2025-03-01T23:30:00Z", "2025-03-01") === "2025-03-02");
assert("en verano (00:30 española = 22:30 UTC del día antes): igual", primera("2025-06-30T22:30:00Z", "2025-06-30") === "2025-07-01");
assert("guardada una fecha más antigua: se queda", primera("2025-03-01T23:30:00Z", "2025-01-15") === "2025-01-15");
assert("a mediodía no hay día UTC distinto: lo guardado igual o más antiguo se queda",
  primera("2025-03-02T11:00:00Z", "2025-03-02") === "2025-03-02" && primera("2025-03-02T11:00:00Z", "2025-03-01") === "2025-03-01");
assert("guardada una más nueva: pasa a la de la llegada", primera("2025-03-02T11:00:00Z", "2025-05-01") === "2025-03-02");

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
