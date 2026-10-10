/* Test: un USDT falso de nombre limpio no para el descubrimiento.
 *
 * Bajo prueba (Reental-SPA/js/10-csv-descubrimiento.js):
 * - descubrirInmuebles(): la Vía B registra como CANDIDATA un token
 *   desconocido que llega a la wallet con nombre limpio («Tether USD»,
 *   símbolo «USDT»); la limpieza de stablecoins lo retira del catálogo y
 *   también de la lista de nuevas del resumen.
 * - descubrimientoDinamico(): no lee del catálogo una nueva ya retirada
 *   (fallaría con TypeError y js/14 clasificaría sin el descubrimiento);
 *   termina y la clasificación se hace con él.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_descubrimiento_paso_desc2.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const errores = [];
const sb = { console: Object.assign({}, console, { error: e => errores.push(e) }),
             document: { getElementById: () => null } };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js",
                 "10-csv-descubrimiento.js", "14-clasificador.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
vm.runInContext(`
  var __log = [];
  log = function (m) { __log.push(String(m)); };
  toast = function () {};
  marcarCacheDirty = function () { state.cacheDirty = true; };
  autoGuardarCache = async function () {};
`, sb);
const g = expr => vm.runInContext(expr, sb);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20), ORIGEN = "0x" + "a8".repeat(20);
const FALSO = "0x" + "f5".repeat(20), NUEVO = "0x" + "c3".repeat(20);
const Hh = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 12) / 1000));
const token = (h, contrato, nombre, simbolo, t) => ({
  blockNumber: "10", timeStamp: t, hash: h, from: ORIGEN, to: W, contractAddress: contrato,
  value: (5n * 10n ** 18n).toString(), tokenName: nombre, tokenSymbol: simbolo, tokenDecimal: "18",
});

g("state.config = " + JSON.stringify({ wallet: W, vault: V,
  compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST" }));
const cache = sb.cacheVacia();
cache.transacciones.wallet_tokens.push(
  token(Hh(1), FALSO, "Tether USD", "USDT", ts(2026, 9, 1)),
  token(Hh(2), NUEVO, "Mystery Asset", "MYS", ts(2026, 9, 2)));
// Sin archivo de rendimientos no se clasifica: uno de una fila, sin relación.
const csv = sb.cargarCsvRendimientos("dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet\n" +
  "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,4,0,4,0,\"['0x" + "99".repeat(32) + "']\"," + W);
if (csv.error) throw new Error(csv.error);
sb.__c = cache; sb.__csv = csv;
g("state.cache = __c; state.cacheHandle = null; state.cacheDirty = false;" +
  "state.filasCsv = __csv.filas; state.indicePorHash = __csv.indicePorHash; state.csvCargado = true;");

console.log("== 1. El descubrimiento no falla ==");
let resumen = { nuevas: [], candidatas: [], avisos: [] };
try {
  resumen = g("descubrimientoDinamico(state.cache, state.filasCsv, state.indicePorHash, " +
    "normalizarDireccion(state.config.wallet), normalizarDireccion(state.config.vault))");
  assert("termina", true);
} catch (e) { assert("termina", false, String(e)); }
assert("el USDT falso no queda en el catálogo", !(FALSO in cache.catalogo_propiedades));
assert("ni en las nuevas ni en las candidatas",
  !resumen.nuevas.includes(FALSO) && !resumen.candidatas.includes(FALSO), resumen);
assert("aviso de la limpieza con su dirección",
  resumen.avisos.some(a => /Limpieza automática/.test(a) && a.includes(FALSO)), resumen.avisos);
assert("lo demás se descubre igual (CANDIDATA y en las nuevas)",
  cache.catalogo_propiedades[NUEVO] && cache.catalogo_propiedades[NUEVO].estado === "CANDIDATA" &&
  JSON.stringify(resumen.nuevas) === JSON.stringify([NUEVO]), resumen.nuevas);
assert("y sale en el registro", g("__log").some(m => m.includes(NUEVO)));

console.log("== 2. La clasificación termina con el descubrimiento hecho ==");
g("state.cache.catalogo_propiedades = {}; __log.length = 0");
assert("clasifica", g("ejecutarClasificacion()") !== false);
assert("sin errores en la consola", errores.length === 0, errores.map(String));
assert("sin el aviso «el descubrimiento automático falló»",
  !g("__log").some(m => /descubrimiento automático falló/.test(m)), g("__log"));
assert("el catálogo queda sin el falso y con el nuevo",
  !(FALSO in cache.catalogo_propiedades) && NUEVO in cache.catalogo_propiedades);
const hashes = new Set((g("state.registros") || []).map(r => r.hash));
assert("los dos movimientos clasificados", hashes.has(Hh(1)) && hashes.has(Hh(2)), [...hashes]);

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
