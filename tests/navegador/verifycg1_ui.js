/* Precios de CoinGecko en navegador real (Chrome headless, SPA servida en localhost:8765):
 * - la SPA carga sin errores con js/08;
 * - CoinGecko interceptado responde 429 SIN cabecera CORS →
 *   el fetch del navegador falla como error de red y la SPA lo trata como
 *   límite (espera de 30 s, ritmo lento) y recupera el precio al reintentar;
 * - fecha de más de 365 días: marcada sin ninguna petición;
 * - una petición REAL a CoinGecko para una fecha reciente devuelve precio.
 * Cache sintética en memoria; no se toca ningún archivo del usuario. */
"use strict";
const puppeteer = require("puppeteer-core"), path = require("path");
let ok = 0, fallos = 0;
const assert = (n, c, x) => { if (c) { ok++; console.log("  OK   " + n); } else { fallos++; console.error("  FALLO " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  const err = []; p.on("pageerror", e => err.push(String(e)));
  p.on("console", m => { const u = (m.location() || {}).url || ""; if (m.type() === "error" && !/favicon|coingecko|ERR_FAILED|CORS/i.test(u + " " + m.text())) err.push(m.text() + " @ " + u); });
  await p.goto((process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/") + "index.html", { waitUntil: "networkidle0" });
  assert("js/08 nuevo cargado", await p.evaluate(() => typeof coingeckoRitmo === "object" && typeof precioRntHistorico === "function"));

  // --- Límite simulado: primer intento 429 sin CORS, segundo 200 con CORS ---
  await p.setRequestInterception(true);
  let n = 0, simular = true;
  p.on("request", req => {
    if (!simular || !req.url().includes("api.coingecko.com")) return req.continue();
    if (req.url().includes("/market_chart")) // serie vacía → vía fecha a fecha
      return req.respond({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: '{"prices":[]}' });
    n++;
    if (n === 1) return req.respond({ status: 429, contentType: "text/plain", body: "Too Many Requests" });
    return req.respond({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ market_data: { current_price: { usd: 0.123 } } }) });
  });
  const t28 = await p.evaluate(async () => {
    const logs = [], esperas = []; const logOrig = log;
    log = (m, t) => { logs.push(String(m)); logOrig(m, t); };
    coingeckoRitmo.dormir = async ms => { esperas.push(ms); };
    const c = { precios_rnt: {}, precios_rnt_no_disponibles: {} };
    const precio = await precioRntHistorico("2026-09-20", c);
    log = logOrig;
    return { precio, esperas, logs, pausa: coingeckoRitmo.pausaMs, nd: Object.keys(c.precios_rnt_no_disponibles) };
  });
  assert("429 sin CORS: el navegador lo ve como error de red y la SPA espera 30 s", t28.esperas[0] === 30000, t28);
  assert("recupera el precio al segundo intento", t28.precio === 0.123 && n === 2, [t28.precio, n]);
  assert("ritmo pasa a lento (15 s)", t28.pausa === 15000 && t28.esperas[1] === 15000, t28.esperas);
  assert("log «probable límite de llamadas»", t28.logs.some(l => /probable límite/.test(l)), t28.logs);
  assert("no marca la fecha como no disponible", t28.nd.length === 0);

  // --- Más de 365 días: sin petición ---
  n = 0;
  const vieja = await p.evaluate(async () => {
    const c = { precios_rnt: {}, precios_rnt_no_disponibles: {} };
    const r = await precioRntHistorico("2024-03-15", c);
    return { r, motivo: c.precios_rnt_no_disponibles["2024-03-15"] };
  });
  assert("fecha de 2024: null, motivo del 10012 y 0 peticiones", vieja.r === null && /365 días/.test(vieja.motivo) && n === 0, [vieja, n]);

  // --- Petición REAL a CoinGecko (fecha reciente) ---
  simular = false;
  const real = await p.evaluate(async () => {
    coingeckoRitmo.pausaMs = 6000; coingeckoRitmo.circuitoHasta = 0; coingeckoRitmo.serie = null;
    coingeckoRitmo.dormir = async () => {};
    const c = { precios_rnt: {}, precios_rnt_no_disponibles: {} };
    const precio = await precioRntHistorico("2026-09-15", c);
    return { precio, nd: c.precios_rnt_no_disponibles };
  });
  console.log("  (precio real RNT 15/09/2026: " + real.precio + " USD)");
  assert("CoinGecko real devuelve un precio numérico", typeof real.precio === "number" && real.precio > 0, real);

  await p.screenshot({ path: path.join(__dirname, "cap_cg1_log.png") });
  await b.close();
  assert("0 errores de página", err.length === 0, err);
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
