/* Test: números a la española en la app.
 *
 * - numEs / cantidadEs (js/02): punto para los miles, coma para los
 *   decimales y cantidades sin ceros de relleno.
 * - El resumen de Puesta en marcha (js/19), el mensaje al cargar el archivo
 *   de rendimientos (js/12) y el registro de la sincronización (js/09).
 * - Las cantidades de las notas de los registros (js/14).
 * - Que no vuelva un número «a la inglesa»: sin toFixed en esos textos.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_numeros_paso_fmt1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS = path.join(__dirname, "..", "Reental-SPA", "js");
const fuente = f => fs.readFileSync(path.join(JS, f), "utf8");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

function nuevoSandbox(archivos) {
  const elementos = {};
  const elemento = id => (elementos[id] = elementos[id] || {
    id, value: "", open: false, innerHTML: "", textContent: "", dataset: {}, style: {}, children: [],
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    appendChild(h) { this.children.push(h); }, setAttribute() {}, querySelector() { return null; },
  });
  const sb = {
    console: Object.assign({}, console, { error: () => {} }),
    document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }) },
    setTimeout, Promise, Date, JSON, Math, Object, Array, Set, Map, BigInt,
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of archivos) vm.runInContext(fuente(f), sb, { filename: f });
  return sb;
}
const ev = (sb, expr) => vm.runInContext(expr, sb);

/* [valor, decimales, signo, recortar, esperado]. Una línea por caso, en
   JSON, entre las marcas CASOS-INICIO y CASOS-FIN. */
// CASOS-INICIO
const CASOS = [
  [0, 2, false, false, "0,00"],
  [12.08, 2, false, false, "12,08"],
  [1234.5, 2, false, false, "1.234,50"],
  [1234567.891, 2, false, false, "1.234.567,89"],
  [-2.35, 2, false, false, "-2,35"],
  [-1234.5, 2, false, false, "-1.234,50"],
  [0.25, 2, true, false, "+0,25"],
  [-2.5, 2, true, false, "-2,50"],
  [0, 2, true, false, "+0,00"],
  [-0.001, 2, false, false, "0,00"],
  [0.1234, 4, false, false, "0,1234"],
  [400, 6, false, true, "400"],
  [1000, 6, false, true, "1.000"],
  [1, 6, false, true, "1"],
  [10, 6, false, true, "10"],
  [0.281837, 6, false, true, "0,281837"],
  [479.4321, 6, false, true, "479,4321"],
  [1234567.891, 6, false, true, "1.234.567,891"],
  [-0.000001, 6, true, true, "-0,000001"],
  [-0.0000001, 6, false, true, "0"],
  [0, 6, true, true, "+0"]
];
// CASOS-FIN

/* ============ A) numEs y cantidadEs (js/02) ============ */
console.log("A) numEs y cantidadEs: números a la española");
let sb = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "19-arranque.js"]);
for (const [x, dec, signo, recortar, esperado] of CASOS) {
  const sale = sb.numEs(x, dec, signo, recortar);
  assert("numEs(" + x + ", " + dec + (signo ? ", con signo" : "") + (recortar ? ", sin relleno" : "") + ") → «" + esperado + "»",
    sale === esperado, sale);
}
assert("cantidadEs: 1 → «1», nunca «1.000000» (que parece un millón)",
  sb.cantidadEs(1) === "1" && sb.cantidadEs(400) === "400" && sb.cantidadEs(1234.5) === "1.234,5");
assert("lo que no es un número → «?»",
  sb.numEs(null) === "?" && sb.numEs(undefined) === "?" && sb.numEs(NaN) === "?" && sb.cantidadEs("12") === "?");

/* ============ B) Resumen de Puesta en marcha (js/19) ============ */
console.log("B) Resumen de Puesta en marcha (js/19)");
const base = { clasificacion: { registros: 10, revisar: 0, inmuebles: 2 }, csvOk: true, configOk: true,
  prep: { sincronizado: true, erroresSync: [], nuevas: 0, total: 1 }, keyOk: true, vaultConfigurado: true,
  fechasSinPrecio: 0, candidatas: 0, cacheOk: true, dirty: false, conArchivo: true, nombreArchivo: "reental_cache.json" };
const textos = d => sb.arrResumen(Object.assign({}, base, d)).lineas.map(l => l.texto);
let t = textos({ vault: { coincide: true, saldo_calculado_usdt: 1234.5, saldo_onchain_usdt: 1234.5, diferencia_usdt: 0 } });
assert("vault que cuadra: «el saldo cuadra (1.234,50 USDT)»", t.includes("Vault: el saldo cuadra (1.234,50 USDT)."), t);
t = textos({ vault: { coincide: false, saldo_calculado_usdt: 12.08, saldo_onchain_usdt: 1012.33, diferencia_usdt: -1000.25 } });
assert("vault que no cuadra: calculado, en la red y diferencia a la española",
  t.some(x => x.startsWith("Vault: el saldo NO cuadra. Calculado 12,08 USDT, en la red 1.012,33 USDT (diferencia -1.000,25 USDT).")), t);
t = textos({ vault: { coincide: false, saldo_calculado_usdt: 10.25, saldo_onchain_usdt: 10, diferencia_usdt: 0.25 } });
assert("diferencia a favor: con su signo «+0,25 USDT»", t.some(x => x.includes("(diferencia +0,25 USDT)")), t);

/* ============ C) Mensaje al cargar el archivo de rendimientos (js/12) ============ */
console.log("C) Mensaje al cargar el archivo de rendimientos (js/12)");
// Sin el resumen largo de #resumenCsv en 🚀; se comprueba que cargar sigue bien.
const s3 = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "10-csv-descubrimiento.js", "12-carga-archivos.js"]);
ev(s3, "toast = function () {}; actualizarChipEstado = function () {};");
const W = "0x" + "a1".repeat(20);
const CSV = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet\n" +
  "\"Prueba 1#2026-T1\",2026-06-10,1400.5,0,1400.5,0,\"['0x" + "99".repeat(32) + "']\"," + W;
assert("el archivo de rendimientos se carga (1 reparto)", s3.aplicarCsvTexto(CSV, true) === true && ev(s3, "state.filasCsv.length") === 1);

/* ============ D) Registro de la sincronización (js/09) ============ */
async function probarRegistro() {
  console.log("D) Registro de la sincronización (js/09)");
  const s2 = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "09-sincronizacion.js"]);
  ev(s2, "var __log = []; log = function (m) { __log.push(m); };" +
    "state.cache = cacheVacia(); state.config.vault = '0x" + "b2".repeat(20) + "'; state.config.etherscan_api_key = 'K';" +
    "var __v = null; verificarSaldoVaultOnchain = async function () { return __v; };");
  ev(s2, "__v = { coincide: true, saldo_calculado_usdt: 1234.5, saldo_onchain_usdt: 1234.5, diferencia_usdt: 0 };");
  await ev(s2, "pasoVault()");
  assert("saldo que cuadra: «1.234,5 USDT», sin ceros de relleno",
    ev(s2, "__log[0]") === "OK: saldo calculado 1.234,5 USDT = on-chain 1.234,5 USDT.", ev(s2, "__log"));
  ev(s2, "__log = []; __v = { coincide: false, saldo_calculado_usdt: 10, saldo_onchain_usdt: 12.345678, diferencia_usdt: -2.345678 };");
  await ev(s2, "pasoVault()");
  assert("saldo que no cuadra: «calculado 10 vs on-chain 12,345678 USDT (dif -2,345678)»",
    ev(s2, "__log[0]").startsWith("DIFERENCIA: calculado 10 vs on-chain 12,345678 USDT (dif -2,345678)."), ev(s2, "__log"));
  ev(s2, "__log = []; __v = { coincide: false, saldo_calculado_usdt: 10.5, saldo_onchain_usdt: 10, diferencia_usdt: 0.5 };");
  await ev(s2, "pasoVault()");
  assert("diferencia a favor: «(dif +0,5)»", ev(s2, "__log[0]").includes("(dif +0,5)."), ev(s2, "__log"));
}

(async () => {
  await probarRegistro();

  /* ============ E) Cantidades de las notas (js/14) ============ */
  console.log("E) Cantidades de las notas de los registros (js/14)");
  assert("cantidadNota: 100 → «100», 15 → «15», 1234.5 → «1.234,5»",
    sb.cantidadNota(100) === "100" && sb.cantidadNota(15) === "15" && sb.cantidadNota(1234.5) === "1.234,5");
  assert("cantidadNota: sin número sale «None»", sb.cantidadNota(null) === "None");
  assert("pagos diferidos: 400 → «400» y 1000 → «1.000», nunca «400.000000»",
    sb.pdFormatear6(400) === "400" && sb.pdFormatear6(1000) === "1.000" && sb.pdFormatear6(0.1 + 0.2) === "0,3");

  /* ============ F) Que no vuelva ============ */
  console.log("F) Sin números «a la inglesa» en los textos");
  const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const f of ["09-sincronizacion.js", "12-carga-archivos.js", "19-arranque.js"]) {
    assert(f + ": ningún toFixed", !/\.toFixed\(/.test(sinComentarios(fuente(f))));
  }
  const usos = (sinComentarios(fuente("14-clasificador.js")).match(/\.toFixed\(/g) || []).length;
  // El redondeo a 6 decimales usa dos (toFixed(30) para ver los decimales exactos de un empate).
  // Y pdFloatPython, que escribe un float como repr() de Python en los mensajes del motor.
  assert("js/14: toFixed solo en pyStr, en el redondeo a 6 decimales y en pdFloatPython (4 usos)", usos === 4, usos);

  console.log("");
  console.log("RESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})();
