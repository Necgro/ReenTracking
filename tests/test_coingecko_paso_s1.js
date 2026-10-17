/* S1 (auditoría de CANJE-1 y HORA-1): un movimiento de RNT o POL de las
 * 00:00 a las 01:00 (02:00 en verano) españolas cae en un día que en UTC
 * aún no ha empezado. CoinGecko todavía no lo tiene (la serie diaria llega
 * hasta las 00:00 UTC de hoy y el día siguiente da el error 10014): no se
 * pide, ni se avisa de «365 días» ni de ponerlo a mano; lo coge la
 * siguiente sincronización.
 *
 * Bajo prueba: diaUtcSinEmpezar (js/08), pasoRnt y pasoPol (js/09).
 * Las respuestas de CoinGecko imitan las reales del 17/10/2026.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_coingecko_paso_s1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, URLSearchParams, setTimeout };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "08-coingecko.js", "14-clasificador.js", "09-sincronizacion.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const D = iso => Date.parse(iso);
let logs, toasts, llamadas, ahora, serie;
S.fetch = async url => {
  url = String(url);
  llamadas.push(url);
  if (url.includes("market_chart")) return { status: 200, json: async () => ({ prices: serie.map(([d, v]) => [D(d + "T00:00:00Z"), v]).concat([[ahora, 0.3385]]) }) };
  return { status: 200, json: async () => ({ status: { error_code: 10014, error_message: "Invalid value provided for the date parameter." } }) };
};
S.log = (m, t) => logs.push((t || "info") + ": " + m);
S.toast = m => toasts.push(m);
S.marcarCacheDirty = () => {};
S.autoGuardarCache = async () => {};
S.renderPanel = () => {};
vm.runInContext("var pasoPolReal = pasoPol;", S); // pasoRnt la llama al final: aquí, aparte
const RNT = vm.runInContext("RNT", S);
const tx = iso => ({ timeStamp: String(D(iso) / 1000), contractAddress: RNT, from: "0x" + "77".repeat(20), to: "0x" + "11".repeat(20), value: "1", hash: "0x" + "ab".repeat(32) });

async function sincronizarRnt(ahoraIso, puntos) {
  logs = []; toasts = []; llamadas = []; ahora = D(ahoraIso); serie = puntos;
  S.cacheS1 = { transacciones: { wallet_tokens: [tx("2026-10-17T22:30:00Z")], vault_tokens: [] }, precios_rnt: {}, precios_rnt_no_disponibles: {} };
  vm.runInContext("coingeckoRitmo.ahora = () => " + ahora + "; coingeckoRitmo.dormir = async () => {}; coingeckoRitmo.serie = null;" +
    "pasoPol = async () => {}; state.sync = {}; state.cache = cacheS1;", S);
  await vm.runInContext("pasoRnt()", S);
  return S.cacheS1;
}

(async () => {
  console.log("== 1. ¿Ha empezado su día en UTC? ==");
  assert("el 18/10 a las 00:30 españolas (22:30 UTC del 17): aún no", S.diaUtcSinEmpezar("2026-10-18", D("2026-10-17T22:30:00Z")));
  assert("a las 02:00 españolas (00:00 UTC): ya sí", !S.diaUtcSinEmpezar("2026-10-18", D("2026-10-18T00:00:00Z")));
  assert("un día pasado: ya sí", !S.diaUtcSinEmpezar("2026-10-16", D("2026-10-17T22:30:00Z")));

  console.log("== 2. RNT de las 00:30 del 18/10, sincronizado al momento ==");
  let c = await sincronizarRnt("2026-10-17T22:30:00Z", [["2026-10-16", 0.3375], ["2026-10-17", 0.3359]]);
  assert("no se pregunta a CoinGecko por ese día", llamadas.length === 0, llamadas);
  assert("ni «ATENCIÓN… 365 días» ni el aviso de ponerlo a mano",
    !logs.some(l => /365|ATENCIÓN/.test(l)) && toasts.length === 0, { logs, toasts });
  assert("un solo mensaje: se pedirá en la próxima sincronización",
    logs.some(l => l === "info: Precio RNT de 18/10/2026: CoinGecko aún no lo tiene; se pedirá en la próxima sincronización."), logs);
  assert("no queda como «no disponible» ni cuenta como fecha sin precio",
    JSON.stringify(c.precios_rnt_no_disponibles) === "{}" && vm.runInContext("state.sync.fechasSinPrecio", S) === 0, c);

  console.log("== 3. La siguiente sincronización, ya con el 18 en UTC ==");
  c = await sincronizarRnt("2026-10-18T09:00:00Z", [["2026-10-17", 0.3359], ["2026-10-18", 0.34]]);
  assert("coge el precio del 18 de la serie, sin avisos", c.precios_rnt["2026-10-18"] === 0.34 && toasts.length === 0, { precios: c.precios_rnt, toasts });

  console.log("== 4. POL, igual ==");
  llamadas = []; ahora = D("2026-10-17T22:30:00Z"); serie = [["2026-10-17", 0.2]];
  S.cacheS1 = { precios_pol: {} };
  vm.runInContext("coingeckoRitmo.ahora = () => " + ahora + "; coingeckoRitmo.seriePol = null; fechasConMovimientoPol = () => ['2026-10-18'];" +
    "pnFechasSinPrecioPol = undefined; state.cache = cacheS1;", S);
  await vm.runInContext("pasoPolReal()", S);
  assert("POL de las 00:30 del 18/10: no se pregunta a CoinGecko", llamadas.length === 0, llamadas);

  console.log("\n" + ok + " OK, " + fallos + " FALLOS");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
