/* A4 (auditoría de CANJE-1 y HORA-1): un precio de RNT o POL guardado con
 * el día UTC (antes de pasar las fechas a la hora española) vale para los
 * movimientos de las 00:00 a la 01:00 (02:00 en verano) de hora española,
 * cuyo día UTC es el anterior: no quedan «sin precio histórico» ni salen
 * en «Fechas sin precio».
 *
 * Bajo prueba: diaUtcSiOtro (js/02), fiscPrecioDelDia (js/21),
 * fechasConMovimientoRnt / fechasConMovimientoPol (js/08),
 * pnFechasSinPrecioRnt / pnFechasSinPrecioPol (js/11).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_precio_dia_utc_paso_a4.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "07-bce.js", "08-coingecko.js", "14-clasificador.js", "15-correcciones.js",
  "18-transacciones.js", "11-panel.js", "21-fiscal.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
S.log = () => {};

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const json = x => JSON.stringify(x);

console.log("== 1. El día UTC ==");
assert("02/03/2025 00:30 (invierno) → 01/03 en UTC", S.diaUtcSiOtro("2025-03-02 00:30:00") === "2025-03-01");
assert("02/07/2025 01:30 (verano) → 01/07 en UTC", S.diaUtcSiOtro("2025-07-02 01:30:00") === "2025-07-01");
assert("a las 10:00, el mismo día: null", S.diaUtcSiOtro("2025-03-02 10:00:00") === null);
assert("sin hora: null", S.diaUtcSiOtro("2025-03-02") === null && S.diaUtcSiOtro(null) === null);

console.log("== 2. El motor ==");
const viejo = { "2025-03-01": 0.05 };
assert("sin el de su día, el de su día UTC", S.fiscPrecioDelDia(viejo, "2025-03-02 00:30:00") === 0.05);
assert("con el de su día, el suyo", S.fiscPrecioDelDia({ "2025-03-01": 0.05, "2025-03-02": 0.07 }, "2025-03-02 00:30:00") === 0.07);
assert("a las 10:00 el del día anterior no vale", S.fiscPrecioDelDia(viejo, "2025-03-02 10:00:00") === null);
assert("un precio de 0 en el día UTC no vale", S.fiscPrecioDelDia({ "2025-03-01": 0 }, "2025-03-02 00:30:00") === null);

console.log("== 3. Lo que se descarga y lo que se pide a mano ==");
const W = "0x" + "11".repeat(20), RNT = vm.runInContext("RNT", S);
const ts = (iso) => String(Date.parse(iso) / 1000);
const tx = iso => ({ timeStamp: ts(iso), contractAddress: RNT, from: "0x" + "77".repeat(20), to: W, value: "1", hash: "0x" + "ab".repeat(32) });
const cache = (txs, precios, noDisp) => ({ transacciones: { wallet_tokens: txs, vault_tokens: [] }, precios_rnt: precios,
  precios_rnt_no_disponibles: noDisp || {} });
const lejos = Date.parse("2026-10-16T12:00:00Z"); // más de 365 días después
let c = cache([tx("2025-03-01T23:30:00Z")], { "2025-03-01": 0.05 });
assert("su día UTC tiene precio: no hace falta el 02/03", json(S.fechasConMovimientoRnt(c)) === "[]", S.fechasConMovimientoRnt(c));
assert("y no sale en «Fechas sin precio»", json(S.pnFechasSinPrecioRnt(c, lejos)) === "[]", S.pnFechasSinPrecioRnt(c, lejos));
c = cache([tx("2025-03-01T23:30:00Z")], { "2025-03-01": 0.05 }, { "2025-03-02": "más de 365 días: CoinGecko no lo da" });
assert("ni aunque una sincronización de antes lo marcara «no disponible»", json(S.pnFechasSinPrecioRnt(c, lejos)) === "[]", S.pnFechasSinPrecioRnt(c, lejos));
c = cache([tx("2025-03-01T23:30:00Z")], {});
assert("sin ningún precio: hace falta el 02/03", json(S.fechasConMovimientoRnt(c)) === '["2025-03-02"]' &&
  S.pnFechasSinPrecioRnt(c, lejos).length === 1 && S.pnFechasSinPrecioRnt(c, lejos)[0][0] === "2025-03-02", S.pnFechasSinPrecioRnt(c, lejos));
c = cache([tx("2025-03-01T23:30:00Z"), tx("2025-03-02T11:00:00Z")], { "2025-03-01": 0.05 });
assert("con otro movimiento el 02/03 a mediodía, ese día sí hace falta", json(S.fechasConMovimientoRnt(c)) === '["2025-03-02"]', S.fechasConMovimientoRnt(c));

// Auditoría O5: solo vale para fechas de más de 365 días; en las recientes
// CoinGecko da el precio de su día y se pide (si no, el precio dependería
// de cómo se fue sincronizando).
const haceDias = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const reciente = haceDias(30), antesReciente = haceDias(31);
c = cache([tx(antesReciente + "T23:30:00Z")], { [antesReciente]: 0.05 });
assert("O5: un movimiento de hace 30 días a las 00:30 pide su día aunque el día UTC tenga precio",
  json(S.fechasConMovimientoRnt(c)) === json([reciente]), S.fechasConMovimientoRnt(c));

// CACHE-MEDIAS (B25): una cache a medio escribir no hace fallar el cálculo.
assert("CACHE-MEDIAS: sin vault_tokens, cuenta la wallet",
  json(S.fechasConMovimientoRnt({ transacciones: { wallet_tokens: [tx("2025-03-02T11:00:00Z")] }, precios_rnt: {} })) === '["2025-03-02"]');
assert("CACHE-MEDIAS: sin wallet_tokens ni transacciones, nada que pedir",
  json(S.fechasConMovimientoRnt({ transacciones: {} })) === "[]" && json(S.fechasConMovimientoRnt({})) === "[]");

const regPol ={ contrato: "pol", fecha: "2025-03-02 00:30:00", categoria: "DEPOSITO", subcategoria: "COSTE_BASE" };
assert("POL: un depósito sin coste de las 00:30 con el precio de su día UTC no se pide",
  json(S.pnFechasSinPrecioPol({ precios_pol: { "2025-03-01": 0.3 } }, [regPol], lejos)) === "[]");
assert("POL: sin él, se pide el 02/03", S.pnFechasSinPrecioPol({ precios_pol: {} }, [regPol], lejos)[0][0] === "2025-03-02");

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
