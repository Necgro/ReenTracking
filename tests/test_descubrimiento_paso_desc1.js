/* Test: la SPA ejecuta el Descubrimiento dinámico AUTOMÁTICAMENTE antes de
 * clasificar.
 *
 * Bajo prueba (Reental-SPA/js/14-clasificador.js):
 * - descubrimientoAntesDeClasificar() + su llamada en ejecutarClasificacion():
 *   con el catálogo vacío descubre y confirma las propiedades con refuerzo,
 *   deja como CANDIDATA las dudosas (avisando) y guarda con el patrón js/13;
 *   es idempotente (segunda clasificación: sin cambios y sin marcar la cache);
 *   respeta las decisiones del usuario (DESCARTADA sigue DESCARTADA); avisa si
 *   no se reconoce ninguna propiedad; y el resultado es IDÉNTICO a pulsar el
 *   Descubrimiento a mano y luego clasificar.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_descubrimiento_paso_desc1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
function nuevoSandbox() {
  const sb = { console: Object.assign({}, console, { error: () => {} }), document: { getElementById: () => null } };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js",
                   "10-csv-descubrimiento.js", "14-clasificador.js"]) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  }
  vm.runInContext(`
    var __toasts = [], __dirty = 0, __saves = 0;
    log = function () {};
    toast = function (m, t) { __toasts.push({ m: String(m), t: t }); };
    marcarCacheDirty = function () { __dirty++; state.cacheDirty = true; };
    autoGuardarCache = async function () { __saves++; };
  `, sb);
  return sb;
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), T = "0x" + "77".repeat(20);
const P1 = "0x" + "a1".repeat(20), P2 = "0x" + "a2".repeat(20), DUDA = "0x" + "d0".repeat(20);
const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 12) / 1000));
const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
const tok6 = u => BigInt(Math.trunc(u * 1e6)).toString();
const leg = (h, from, to, contrato, value, name, sym, dec, t, blk) => ({
  blockNumber: blk, timeStamp: t, hash: h, from, to, contractAddress: contrato,
  value, tokenName: name, tokenSymbol: sym, tokenDecimal: dec,
});

function montar(sb, conCatalogo) {
  vm.runInContext("state.config = " + JSON.stringify({ wallet: W, vault: V,
    compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST" }), sb);
  const cache = sb.cacheVacia();
  const USDT = vm.runInContext("USDT", sb);
  cache.transacciones.wallet_tokens.push(
    // Compra on-chain: USDT sale y entra la propiedad con el nombre del
    // archivo de Reental (refuerzo; el prefijo «Reental-» no basta)
    leg(Hh(1), W, T, USDT, tok6(1000), "Tether USD", "USDT", "6", ts(2026, 3, 1), "10"),
    leg(Hh(1), T, W, P1, tok18(10), "Prueba Alcazaba 1", "Reental-RALC1", "18", ts(2026, 3, 1), "10"),
    // Otra propiedad con prefijo, que el usuario había DESCARTADO
    leg(Hh(2), T, W, P2, tok18(3), "Reental-Prueba Duna 2", "RDUN2", "18", ts(2026, 4, 1), "11"),
    // Token dudoso: sin prefijo ni nombre del CSV → CANDIDATA
    leg(Hh(3), T, W, DUDA, tok18(5), "Mystery Asset", "MYS", "18", ts(2026, 5, 1), "12"));
  if (conCatalogo) cache.catalogo_propiedades = JSON.parse(JSON.stringify(conCatalogo));
  sb.__c = cache;
  vm.runInContext("state.cache = __c; state.cacheHandle = null; state.cacheDirty = false;", sb);
  const csv = sb.cargarCsvRendimientos("dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet\n" +
    "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,4,0,4,0,\"['0x" + "99".repeat(32) + "']\"," + W);
  if (csv.error) throw new Error(csv.error);
  sb.__csv = csv;
  vm.runInContext("state.filasCsv = __csv.filas; state.indicePorHash = __csv.indicePorHash; state.csvCargado = true;", sb);
  return cache;
}
const g = (sb, expr) => vm.runInContext(expr, sb);

// =========================================================================
console.log("== 1. Cache nueva (catálogo vacío): descubre sola antes de clasificar ==");
// =========================================================================
let sb = nuevoSandbox();
let cache = montar(sb, null);
assert("parte con el catálogo vacío", Object.keys(cache.catalogo_propiedades).length === 0);
g(sb, "ejecutarClasificacion()");
const cat = cache.catalogo_propiedades;
assert("propiedad con refuerzo → CONFIRMADA", cat[P1] && cat[P1].estado === "CONFIRMADA", cat[P1]);
assert("token dudoso → CANDIDATA (no se trata como propiedad)", cat[DUDA] && cat[DUDA].estado === "CANDIDATA");
assert("cache marcada como modificada y autoguardado lanzado",
  g(sb, "__dirty") === 1 && g(sb, "__saves") === 1, [g(sb, "__dirty"), g(sb, "__saves")]);
const regs = g(sb, "state.registros");
const compra = regs.find(r => r.contrato === P1);
assert("la compra de la propiedad se clasifica COMPRA (no REVISAR)", compra && compra.categoria === "COMPRA", compra && compra.categoria);
const toasts = g(sb, "__toasts");
// El dudoso y el de solo prefijo (P2, aquí sin descartar).
assert("aviso de 2 tokens con dudas con enlace al catálogo",
  toasts.some(t => /2 token\(s\) con dudas/.test(t.m) && t.t === "warn"), toasts.map(t => t.m));
assert("el de solo prefijo «Reental-» queda con dudas", cat[P2] && cat[P2].estado === "CANDIDATA", cat[P2]);

// =========================================================================
console.log("== 2. Idempotente: segunda clasificación sin cambios ==");
// =========================================================================
const huella1 = JSON.stringify(cache.catalogo_propiedades);
const regs1 = JSON.stringify(g(sb, "state.registros"));
g(sb, "ejecutarClasificacion()");
assert("catálogo idéntico", JSON.stringify(cache.catalogo_propiedades) === huella1);
assert("NO vuelve a marcar la cache ni a guardar", g(sb, "__dirty") === 1 && g(sb, "__saves") === 1);
assert("clasificación idéntica", JSON.stringify(g(sb, "state.registros")) === regs1);

// =========================================================================
console.log("== 3. Respeta las decisiones del usuario ==");
// =========================================================================
sb = nuevoSandbox();
cache = montar(sb, { [P2]: { estado: "DESCARTADA", nombre_etherscan: "Reental-Prueba Duna 2", simbolo: "RDUN2", refuerzos: [] } });
g(sb, "ejecutarClasificacion()");
assert("DESCARTADA por el usuario sigue DESCARTADA", cache.catalogo_propiedades[P2].estado === "DESCARTADA");
assert("y las demás se descubren igualmente", cache.catalogo_propiedades[P1].estado === "CONFIRMADA");

// =========================================================================
console.log("== 4. Mismo resultado que Descubrimiento manual + clasificar ==");
// =========================================================================
const sbA = nuevoSandbox(); const cA = montar(sbA, null);
g(sbA, "ejecutarClasificacion()");
const sbB = nuevoSandbox(); const cB = montar(sbB, null);
g(sbB, "descubrimientoDinamico(state.cache, state.filasCsv, state.indicePorHash, normalizarDireccion(state.config.wallet), normalizarDireccion(state.config.vault))");
const regsB = g(sbB, "clasificarTransacciones(state.cache, state.filasCsv, state.indicePorHash, state.config, {})");
assert("catálogo idéntico al del botón manual", JSON.stringify(cA.catalogo_propiedades) === JSON.stringify(cB.catalogo_propiedades));
assert("registros idénticos al flujo manual", JSON.stringify(g(sbA, "state.registros")) === JSON.stringify(regsB));

// =========================================================================
console.log("== 5. Sin transacciones: aviso honesto ==");
// =========================================================================
sb = nuevoSandbox();
montar(sb, null);
g(sb, "state.cache.transacciones.wallet_tokens.length = 0");
g(sb, "ejecutarClasificacion()");
assert("aviso «no se ha reconocido ningún inmueble» con enlace a Sincronización",
  g(sb, "__toasts").some(t => /ningún inmueble/.test(t.m)), g(sb, "__toasts").map(t => t.m));
assert("sin cambios no marca la cache", g(sb, "__dirty") === 0);

// =========================================================================
console.log("== 6. Un fallo del descubrimiento no impide clasificar ==");
// =========================================================================
sb = nuevoSandbox();
montar(sb, null);
g(sb, "descubrimientoDinamico = function () { throw new Error('simulado'); }");
g(sb, "ejecutarClasificacion()");
assert("clasifica igualmente con el catálogo actual", Array.isArray(g(sb, "state.registros")) && g(sb, "state.registros").length > 0);

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
