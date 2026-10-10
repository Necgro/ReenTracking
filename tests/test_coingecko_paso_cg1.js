/* Test de CoinGecko en el navegador, fecha a fecha.
 *
 * Bajo prueba (Reental-SPA/js/08-coingecko.js · precioRntHistorico):
 * - el 429 llega SIN cabecera CORS → fetch lanza error de red: se trata como
 *   límite (espera larga de 30 s, no 5 s) y el ritmo pasa a ser más lento;
 * - fechas de más de 365 días: se marcan «no disponible» SIN llamar, con el
 *   mismo motivo y bloque (precios_rnt_no_disponibles) que el 10012;
 * - 10012: un solo intento; 429 visible: límite, como siempre;
 * - fecha que agota los intentos: las siguientes no llaman durante unos
 *   minutos (sin reintentos inútiles); sin conexión real: sin esperas.
 *
 * DATOS 100% SINTÉTICOS, sin red (fetch y reloj simulados).
 * Ejecución (desde la raíz): node tests/test_coingecko_paso_cg1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const AHORA = Date.UTC(2026, 8, 28, 10); // 28/09/2026
const MOTIVO = "más de 365 días: CoinGecko no lo da";

function nuevoSandbox(respuestas, opciones = {}) {
  const sb = { console: Object.assign({}, console, { error: () => {} }), document: { getElementById: () => null },
               URLSearchParams, __llamadas: [], __esperas: [], __logs: [], __t: AHORA };
  if (opciones.offline) sb.navigator = { onLine: false };
  sb.globalThis = sb;
  sb.fetch = async url => {
    // La serie diaria llega vacía → se prueba la vía fecha a fecha.
    if (url.includes("/market_chart")) return { status: 200, json: async () => ({ prices: [] }) };
    sb.__llamadas.push(url);
    const r = respuestas.shift();
    if (r === undefined) throw new Error("llamada no prevista");
    if (r === "RED") throw new TypeError("Failed to fetch");
    return { status: r.status, json: async () => { if (r.malJson) throw new SyntaxError("JSON inválido"); return r.body; } };
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
const ok200 = usd => ({ status: 200, body: { market_data: { current_price: { usd } } } });
const e10012 = { status: 401, body: { error: { status: { error_code: 10012 } } } };
const cacheVacia = () => ({ precios_rnt: {}, precios_rnt_no_disponibles: {} });

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

(async () => {
  console.log("1) Precio normal: una llamada, pausa de 6 s, se guarda");
  { const sb = nuevoSandbox([ok200(0.25)]); const c = cacheVacia(); sb.c = c;
    const p = await R(sb, "precioRntHistorico('2026-09-01', c)");
    assert("devuelve el precio", p === 0.25, p);
    assert("una sola llamada", sb.__llamadas.length === 1);
    assert("fecha en formato DD-MM-YYYY", sb.__llamadas[0].includes("date=01-09-2026"), sb.__llamadas[0]);
    assert("guardado en precios_rnt", c.precios_rnt["2026-09-01"] === 0.25);
    assert("pausa 6 s", JSON.stringify(sb.__esperas) === "[6000]", sb.__esperas);
    const p2 = await R(sb, "precioRntHistorico('2026-09-01', c)");
    assert("segunda vez sale de la cache sin llamar", p2 === 0.25 && sb.__llamadas.length === 1); }

  console.log("2) T28: 429 sin CORS (error de red) → espera larga y ritmo lento");
  { const sb = nuevoSandbox(["RED", ok200(0.3), ok200(0.31)]); const c = cacheVacia(); sb.c = c;
    const p = await R(sb, "precioRntHistorico('2026-09-02', c)");
    assert("recupera el precio al segundo intento", p === 0.3, p);
    assert("espera 30 s (no 5 s) tras el error de red", sb.__esperas[0] === 30000, sb.__esperas);
    assert("después pausa lenta de 15 s", sb.__esperas[1] === 15000, sb.__esperas);
    assert("log explica el probable límite", sb.__logs.some(l => /probable límite/.test(l.m)));
    await R(sb, "precioRntHistorico('2026-09-03', c)");
    assert("la fecha siguiente mantiene el ritmo lento", sb.__esperas[2] === 15000, sb.__esperas);
    assert("nada marcado como no disponible", Object.keys(c.precios_rnt_no_disponibles).length === 0); }

  console.log("3) Más de 365 días: marcada sin llamar, mismo motivo que el 10012");
  { const sb = nuevoSandbox([]); const c = cacheVacia(); sb.c = c;
    const p = await R(sb, "precioRntHistorico('2025-09-27', c)"); // 366 días
    assert("devuelve null", p === null);
    assert("ninguna llamada", sb.__llamadas.length === 0);
    assert("ninguna espera", sb.__esperas.length === 0);
    assert("motivo = el del 10012", c.precios_rnt_no_disponibles["2025-09-27"] === MOTIVO, c.precios_rnt_no_disponibles);
    const antigua = await R(sb, "precioRntHistorico('2023-01-15', c)");
    assert("fecha muy antigua tampoco llama", antigua === null && sb.__llamadas.length === 0);
    c.precios_rnt["2024-05-05"] = 0.9;
    assert("precio antiguo YA en cache se respeta", (await R(sb, "precioRntHistorico('2024-05-05', c)")) === 0.9
      && !("2024-05-05" in c.precios_rnt_no_disponibles)); }

  console.log("4) Justo 365 días: se llama (límite exacto, decide CoinGecko)");
  { const sb = nuevoSandbox([e10012]); const c = cacheVacia(); sb.c = c;
    const p = await R(sb, "precioRntHistorico('2025-09-28', c)");
    assert("una sola llamada ante el 10012", sb.__llamadas.length === 1 && p === null);
    assert("marcada con el mismo motivo", c.precios_rnt_no_disponibles["2025-09-28"] === MOTIVO); }

  console.log("5) 429 visible (con CORS): se sigue esperando 30 s");
  { const sb = nuevoSandbox([{ status: 429, body: {} }, ok200(0.4)]); const c = cacheVacia(); sb.c = c;
    const p = await R(sb, "precioRntHistorico('2026-08-01', c)");
    assert("precio tras el 429", p === 0.4);
    assert("esperas 30 s y luego 15 s", JSON.stringify(sb.__esperas) === "[30000,15000]", sb.__esperas); }

  console.log("6) Fecha que agota los intentos → las siguientes no llaman unos minutos");
  { const sb = nuevoSandbox(["RED", "RED", "RED", "RED", ok200(0.5)]); const c = cacheVacia(); sb.c = c;
    const p = await R(sb, "precioRntHistorico('2026-07-01', c)");
    assert("null tras 4 intentos", p === null && sb.__llamadas.length === 4);
    assert("3 esperas de 30 s (sin espera inútil tras el último)", JSON.stringify(sb.__esperas) === "[30000,30000,30000]", sb.__esperas);
    assert("NO se marca como no disponible (se reintenta otro día)", !("2026-07-01" in c.precios_rnt_no_disponibles));
    const p2 = await R(sb, "precioRntHistorico('2026-07-02', c)");
    assert("siguiente fecha: null sin llamar", p2 === null && sb.__llamadas.length === 4);
    R(sb, "__t += 181000");
    const p3 = await R(sb, "precioRntHistorico('2026-07-02', c)");
    assert("pasados 3 min vuelve a llamar", p3 === 0.5 && sb.__llamadas.length === 5); }

  console.log("7) Sin conexión real: ni esperas ni reintentos");
  { const sb = nuevoSandbox(["RED"], { offline: true }); const c = cacheVacia(); sb.c = c;
    const p = await R(sb, "precioRntHistorico('2026-09-10', c)");
    assert("null", p === null);
    assert("una llamada y cero esperas", sb.__llamadas.length === 1 && sb.__esperas.length === 0, sb.__esperas); }

  console.log("8) Sin precio en la respuesta / JSON roto");
  { const sb = nuevoSandbox([{ status: 200, body: {} }, { status: 200, malJson: true }, ok200(0.7)]); const c = cacheVacia(); sb.c = c;
    assert("sin market_data → null, una llamada", (await R(sb, "precioRntHistorico('2026-09-11', c)")) === null && sb.__llamadas.length === 1);
    assert("JSON roto → reintenta tras 5 s", (await R(sb, "precioRntHistorico('2026-09-12', c)")) === 0.7 && sb.__esperas[0] === 5000, sb.__esperas); }

  console.log("\n" + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})();
