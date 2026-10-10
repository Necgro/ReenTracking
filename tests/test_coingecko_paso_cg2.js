/* Test de los precios de RNT del último año en UNA sola llamada.
 *
 * Bajo prueba (Reental-SPA/js/08-coingecko.js · serieDiariaRnt +
 * precioRntHistorico): market_chart (days=365, interval=daily) se pide una
 * vez y sirve todas las fechas sin esperas; solo cuentan los puntos de las
 * 00:00 UTC (el último punto es «ahora»); la serie se memoriza unos minutos;
 * si falla (429, red, HTTP raro) o la fecha no está, se usa /history fecha a
 * fecha (test_coingecko_paso_cg1.js); las fechas de más de 365 días siguen sin llamar.
 *
 * DATOS 100% SINTÉTICOS, sin red. Ejecución: node tests/test_coingecko_paso_cg2.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const AHORA = Date.UTC(2026, 8, 28, 12, 50, 20); // 28/09/2026 12:50:20 UTC
const dia = iso => Date.parse(iso + "T00:00:00Z");

function nuevoSandbox(serie, historias) {
  const sb = { console: Object.assign({}, console, { error: () => {} }), document: { getElementById: () => null },
               URLSearchParams, __serie: 0, __hist: [], __esperas: [], __logs: [], __t: AHORA };
  sb.globalThis = sb;
  sb.fetch = async url => {
    if (url.includes("/market_chart")) {
      sb.__serie++;
      if (!url.includes("days=365") || !url.includes("interval=daily") || !url.includes("vs_currency=usd")) throw new Error("URL mal: " + url);
      if (serie === "RED") throw new TypeError("Failed to fetch");
      if (typeof serie === "number") return { status: serie, json: async () => ({}) };
      return { status: 200, json: async () => ({ prices: serie }) };
    }
    sb.__hist.push(url);
    const r = historias.shift();
    if (r === undefined) throw new Error("llamada /history no prevista");
    return { status: 200, json: async () => ({ market_data: { current_price: { usd: r } } }) };
  };
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "08-coingecko.js"])
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext(`
    log = function (m, t) { __logs.push({ m: String(m), t: t }); };
    coingeckoRitmo.ahora = () => __t;
    coingeckoRitmo.dormir = async ms => { __esperas.push(ms); __t += ms; };
  `, sb);
  return sb;
}
const R = (sb, code) => vm.runInContext(code, sb);
const cacheVacia = () => ({ precios_rnt: {}, precios_rnt_no_disponibles: {} });
const SERIE = [
  [dia("2025-09-29"), 0.20], [dia("2026-05-13"), 0.3127450918264531],
  [dia("2026-08-17"), 0.3051927364018275], [dia("2026-08-21"), 0.3184602957130486],
  [dia("2026-09-28"), 0.31], [AHORA, 0.999],
];

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

(async () => {
  console.log("1) Varias fechas: UNA llamada a la serie, cero /history, cero esperas");
  { const sb = nuevoSandbox(SERIE, []); const c = cacheVacia(); sb.c = c;
    const fechas = ["2026-05-13", "2026-08-17", "2026-08-21", "2025-09-29"];
    const res = [];
    for (const f of fechas) res.push(await R(sb, "precioRntHistorico('" + f + "', c)"));
    assert("precios exactos de la serie", JSON.stringify(res) === JSON.stringify([0.3127450918264531, 0.3051927364018275, 0.3184602957130486, 0.20]), res);
    assert("una sola llamada a market_chart", sb.__serie === 1, sb.__serie);
    assert("ninguna llamada a /history", sb.__hist.length === 0);
    assert("ninguna espera", sb.__esperas.length === 0, sb.__esperas);
    assert("guardados en precios_rnt", c.precios_rnt["2026-08-17"] === 0.3051927364018275 && Object.keys(c.precios_rnt).length === 4);
    assert("log «en una sola llamada»", sb.__logs.some(l => /una sola llamada/.test(l.m))); }

  console.log("2) El punto de «ahora» (no es 00:00 UTC) no se usa como precio del día");
  { const sb = nuevoSandbox([[AHORA, 0.999]], [0.5]); const c = cacheVacia(); sb.c = c;
    const p = await R(sb, "precioRntHistorico('2026-09-28', c)");
    assert("hoy sale de /history, no del punto de ahora", p === 0.5 && sb.__hist.length === 1, p); }

  console.log("3) Fecha que no está en la serie → /history como antes");
  { const sb = nuevoSandbox(SERIE, [0.42]); const c = cacheVacia(); sb.c = c;
    const p = await R(sb, "precioRntHistorico('2026-06-19', c)");
    assert("precio de /history", p === 0.42 && sb.__hist.length === 1);
    assert("fecha en formato DD-MM-YYYY", sb.__hist[0].includes("date=19-06-2026")); }

  console.log("4) Serie memorizada 10 min y renovada después");
  { const sb = nuevoSandbox(SERIE, []); const c = cacheVacia(); sb.c = c;
    await R(sb, "precioRntHistorico('2026-05-13', c)");
    R(sb, "__t += 5 * 60000"); await R(sb, "precioRntHistorico('2026-08-17', c)");
    assert("a los 5 min no se vuelve a pedir", sb.__serie === 1);
    R(sb, "__t += 6 * 60000"); await R(sb, "precioRntHistorico('2026-08-21', c)");
    assert("pasados 10 min se pide de nuevo", sb.__serie === 2); }

  console.log("5) La serie falla (429 / red / 500) → vía fecha a fecha, sin repetir la serie");
  for (const fallo of [429, "RED", 500]) {
    const sb = nuevoSandbox(fallo, [0.3, 0.31]); const c = cacheVacia(); sb.c = c;
    const a = await R(sb, "precioRntHistorico('2026-05-13', c)");
    const b = await R(sb, "precioRntHistorico('2026-08-17', c)");
    assert("fallo " + fallo + ": precios por /history", a === 0.3 && b === 0.31 && sb.__hist.length === 2);
    assert("fallo " + fallo + ": la serie se intentó UNA vez", sb.__serie === 1, sb.__serie);
    assert("fallo " + fallo + ": aviso en el log", sb.__logs.some(l => /fechas una a una/.test(l.m)));
  }

  console.log("6) Más de 365 días: ni serie ni /history; cache previa respetada");
  { const sb = nuevoSandbox(SERIE, []); const c = cacheVacia(); sb.c = c;
    c.precios_rnt["2026-05-13"] = 0.111;
    assert("precio ya en cache no se sobrescribe", (await R(sb, "precioRntHistorico('2026-05-13', c)")) === 0.111 && sb.__serie === 0);
    const p = await R(sb, "precioRntHistorico('2024-07-09', c)");
    assert("fecha de 2024: null sin ninguna llamada", p === null && sb.__serie === 0 && sb.__hist.length === 0);
    assert("marcada no disponible con el motivo de siempre", /365 días/.test(c.precios_rnt_no_disponibles["2024-07-09"])); }

  console.log("\n" + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})();
