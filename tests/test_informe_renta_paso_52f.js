/* Test unitario del informe para la Renta de la app (js/22).
 * Las cifras las comprueba la paridad
 * (tests/paridad_informe_renta_paso_52f.js, con las cifras de referencia).
 *
 * - aniosDelInforme: una fecha futura no rellena anos.
 * - Sincronizar pide tambien el tipo del BCE del 31/12 de cada ano ya
 *   pasado y el de ayer; sin movimientos, ninguno.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/test_informe_renta_paso_52f.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, log: () => {}, toast: () => {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js",
  "09-sincronizacion.js", "10-csv-descubrimiento.js", "14-clasificador.js", "21-fiscal.js",
  "22-informe-renta.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
vm.runInContext("log = () => {}; toast = () => {};", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* Una cache con un movimiento en cada fecha (00:00 UTC). */
function cacheCon(...fechas) {
  return { tipos_bce: {}, transacciones: { normal: fechas.map(f => ({ timeStamp: String(Date.parse(f + "T00:00:00Z") / 1000) })) } };
}

console.log("== aniosDelInforme (como _anios_del_informe) ==");
assert("una fecha futura no rellena anos", igual(S.aniosDelInforme(["2025-01-01", "2062-01-01"], "2026-10-02"), [2025, 2062]));
assert("los anos sin movimientos de en medio cuentan", igual(S.aniosDelInforme(["2024-01-01", "2026-01-01"], "2026-10-02"), [2024, 2025, 2026]));
assert("sin fechas, ningun ano", igual(S.aniosDelInforme([], "2026-10-02"), []));
assert("con fechas repetidas, una vez cada ano (y no rellena hasta hoy)", igual(S.aniosDelInforme(new Set(["2024-05-01", "2024-06-01"]), "2026-10-02"), [2024]));

console.log("== A20. Tipos del BCE del 31/12 de cada ano y de ayer ==");
const nec = (cache, csv, hoy) => [...S.fechasBceNecesarias(cache, csv, hoy)].sort();
assert("31/12 de cada ano ya pasado (tambien sin movimientos) y ayer",
  igual(nec(cacheCon("2023-05-01", "2025-03-02"), [], "2026-10-04"),
    ["2023-05-01", "2023-12-31", "2024-12-31", "2025-03-02", "2025-12-31", "2026-10-03"]),
  nec(cacheCon("2023-05-01", "2025-03-02"), [], "2026-10-04"));
assert("el 01/01 (UTC), ayer es el 31/12 y sale una vez",
  igual(nec(cacheCon("2025-03-02"), [], "2026-01-01"), ["2025-03-02", "2025-12-31"]),
  nec(cacheCon("2025-03-02"), [], "2026-01-01"));
assert("una fecha futura no pide los 31/12 hasta ella",
  igual(nec(cacheCon("2025-03-02", "2062-01-01"), [], "2026-10-04"), ["2025-03-02", "2025-12-31", "2026-10-03", "2062-01-01"]),
  nec(cacheCon("2025-03-02", "2062-01-01"), [], "2026-10-04"));
assert("los repartos del archivo de Reental tambien cuentan",
  igual(nec(cacheCon(), [{ fecha_reparto: new Date("2024-06-30T00:00:00Z") }], "2026-10-04"),
    ["2024-06-30", "2024-12-31", "2025-12-31", "2026-10-03"]));
assert("sin movimientos ni repartos, ninguna fecha (ni ayer)", igual(nec(cacheCon(), [], "2026-10-04"), []));

console.log("== 5.3 A1. Categoria con nombre de algo de todo objeto ==");
assert("categoriaAMostrar no da lo heredado", S.categoriaAMostrar("constructor") === "constructor" &&
  S.categoriaAMostrar("toString") === "toString" && S.categoriaAMostrar("__proto__") === "__proto__" &&
  S.categoriaAMostrar("REWARD") === "RECOMPENSA");
for (const categoria of ["constructor", "hasOwnProperty", null, 5]) {
  const r = { clave: "x1", fecha: "2025-03-01 10:00:00", hash: "0x1", categoria, subcategoria: "",
    contrato: "", token: "RNT", cantidad: 1, revisar: true, nota: "categoria desconocida" };
  let concepto;
  try {
    const inf = S.informesRentaAnuales([r], S.resumenFiscalAnual([r]), {}, { hoy: "2026-10-04" });
    concepto = inf[2025].avisos.find(a => a.detalle === "categoria desconocida").concepto;
  } catch (e) { concepto = "error: " + e.message; }
  const esperado = { constructor: "Constructor RNT", hasOwnProperty: "Hasownproperty RNT", null: "None RNT", 5: "5 RNT" };
  assert("el informe sale con la categoria " + categoria, concepto === esperado[categoria], concepto);
}

console.log("== A20. Sincronizar pide esas fechas ==");
vm.runInContext(`
  var __pedidas = null;
  actualizarTiposBce = async (cache, fechas) => { __pedidas = fechas; return 0; };
  state.cache = { tipos_bce: {}, transacciones: { normal: [{ timeStamp: String(Date.parse("2024-05-01T00:00:00Z") / 1000) }] } };
  state.filasCsv = [];
`, S);
vm.runInContext("pasoBce()", S).then(() => {
  const pedidas = vm.runInContext("__pedidas", S);
  const ayer = S.sumarDias(vm.runInContext("hoyEspana()", S), -1); // ayer en España, como la app
  assert("pasoBce pide el 31/12/2024 y el de ayer", Array.isArray(pedidas) &&
    pedidas.includes("2024-05-01") && pedidas.includes("2024-12-31") && pedidas.includes(ayer), pedidas);

  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
});
