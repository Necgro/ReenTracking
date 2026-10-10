/* Test unitario: fechas como dd/mm/aaaa en toda la app.
 *
 * Funciones bajo prueba:
 * - fechaEs / mesEs (Reental-SPA/js/02-utilidades.js): cómo se enseña una
 *   fecha o un mes.
 * - ccFechaVer (js/15) y txFechaCorta (js/18): lo que pintan Revisión y
 *   Transacciones.
 * - Lo de dentro no cambia: ccFechaCorta y ccFechaDiaNorm siguen dando
 *   "AAAA-MM-DD" para comparar y filtrar.
 * - La búsqueda de 📒 Transacciones encuentra la fecha escrita como se ve.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_fechas_paso_fecha1.js
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

console.log("== 1. fechaEs y mesEs ==");
const casos = [
  [["2026-05-12"], "12/05/2026"],
  [["2026-05-12 09:50:55"], "12/05/2026"],
  [["2026-05-12 09:50:55", true], "12/05/2026 09:50"],
  [["2026-05-12", true], "12/05/2026"],
  [["2026-09-26T10:00:00"], "26/09/2026"],
  [[new Date(Date.UTC(2025, 0, 2, 3, 4, 5)), true], "02/01/2025 03:04"],
  [[null], ""], [[undefined], ""], [[""], ""],
  [["no-es-fecha"], "no-es-fecha"],
];
for (const [args, esperado] of casos) {
  const r = S.fechaEs(...args);
  assert("fechaEs(" + args.map(a => a instanceof Date ? "Date" : String(a)).join(", ") + ") -> «" + esperado + "»", r === esperado, r);
}
assert("fechasEnTextoEs: la nota del motor con sus fechas como dd/mm/aaaa",
  S.fechasEnTextoEs("ajuste del usuario (2026-02-19): 164.83 POL") === "ajuste del usuario (19/02/2026): 164.83 POL" &&
  S.fechasEnTextoEs(null) === "");
assert("mesEs: 2026-07 -> 07/2026; lo demás tal cual",
  S.mesEs("2026-07") === "07/2026" && S.mesEs("2026") === "2026" && S.mesEs(null) === "");

console.log("== 2. Revisión y Transacciones enseñan dd/mm/aaaa ==");
const reg = { clave: "k1", fecha: "2026-05-12 09:45:46", hash: "0x" + "ab".repeat(32), cantidad: 3.5,
  simbolo: "PALC1", categoria: "VENTA", subcategoria: "VENTA_SETTLEMENT", inmueble: "Prueba Alcazaba 1",
  nota: "", revisar: false, fuente: "ONCHAIN" };
assert("ccFechaVer -> 12/05/2026", S.ccFechaVer(reg) === "12/05/2026", S.ccFechaVer(reg));
assert("ccFechaVer sin fecha -> null", S.ccFechaVer({ fecha: null }) === null);
assert("ccFechaCorta sigue en AAAA-MM-DD (para comparar)", S.ccFechaCorta(reg) === "2026-05-12");
assert("ccFechaDiaNorm sigue en AAAA-MM-DD", S.ccFechaDiaNorm("2026-05-12 09:45:46") === "2026-05-12");
assert("txFechaCorta -> 12/05/2026 / «sin fecha»",
  S.txFechaCorta(reg.fecha) === "12/05/2026" && S.txFechaCorta(null) === "sin fecha");
const fila = S.txHtmlFila(Object.assign({}, reg, { importe_usdt: 350 }));
assert("la celda de la fecha: 12/05/2026 y la hora en la ayuda",
  fila.includes('<td class="tx-fecha" title="12/05/2026 09:45, hora española · 12/05/2026 07:45 UTC">12/05/2026</td>'), fila.slice(0, 200));
assert("ninguna fecha AAAA-MM-DD visible en la fila", !/\d{4}-\d{2}-\d{2}/.test(fila));
assert("la tarjeta de Revisión: 📅 12/05/2026",
  S.ccHtmlTarjeta(reg).includes("📅 12/05/2026") && !/\d{4}-\d{2}-\d{2}/.test(S.ccHtmlTarjeta(reg)));

console.log("== 3. La búsqueda encuentra la fecha como se ve ==");
assert("buscar «12/05/2026» encuentra el registro", S.txCoincideBusqueda(reg, "12/05/2026"));
assert("buscar «2026-05-12» también", S.txCoincideBusqueda(reg, "2026-05-12"));
assert("buscar «13/05/2026» no", !S.txCoincideBusqueda(reg, "13/05/2026"));

console.log("== 4. Filtros por fecha intactos (comparan AAAA-MM-DD) ==");
assert("en rango 2026-05-01..2026-05-31", S.ccEnRangoFechas(reg, "2026-05-01", "2026-05-31"));
assert("fuera de rango 2026-06-01..", !S.ccEnRangoFechas(reg, "2026-06-01", ""));
assert("ejercicio 2026", S.txEjercicio(reg) === "2026");

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
