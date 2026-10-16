/* Arnés de «Rentabilidad media» en la franja de 📊 (RENT-1), con datos
 * inventados: 308 $ invertidos desde el 01/03/2024 (dos compras en USDT) y
 * un reparto de 400 $.
 *
 *  R1) sin archivo de rendimientos: «No disponible» y la burbuja dice por qué.
 *  R2) con el archivo: «X % anual» entre «Rendimientos» y «Movimientos», con
 *      la cifra de la cuenta y la burbuja de de qué sale.
 *  R3) las cifras de la franja, a la misma altura aunque un título ocupe
 *      dos líneas; 0 errores.
 *
 * DATOS 100 % SINTÉTICOS. Ejecución (servidor en 8765 y NODE_PATH a
 * puppeteer-core):  node tests/navegador/verifyrent1.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");
const OUT = __dirname;

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run", "--no-default-browser-check"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });
  await page.goto(BASE + "index.html#dashboard", { waitUntil: "networkidle0" });

  await page.evaluate(() => {
    const W = "0x" + "11".repeat(20), P1 = "0x" + "a1".repeat(20), P2 = "0x" + "a2".repeat(20);
    state.config = { wallet: W, vault: "", compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.tipos_bce = { "2024-03-01": 1.08 };
    state.cache = cache;
    const compra = (k, c, cantidad, usd) => ({ clave: k, fecha: "2024-03-01 10:00:00", categoria: "COMPRA", subcategoria: "COSTE_BASE",
      hash: "0x" + k.padStart(64, "0"), inmueble: "Prueba", contrato: c, via_compra: "ONCHAIN", cantidad, importe_usdt: usd });
    state.registros = [compra("1", P1, 1, 108), compra("2", P2, 2, 200)];
    renderDashboard();
  });
  const casillas = () => page.evaluate(() => [...document.querySelectorAll("#tarjetaMetricas .dash-metric")].map(m => ({
    k: m.querySelector(".k").textContent, v: m.querySelector(".v").textContent, title: m.title,
    abajo: Math.round(m.querySelector(".v").getBoundingClientRect().bottom) })));

  console.log("== R1. Sin archivo de rendimientos ==");
  let c = await casillas();
  let r = c.find(x => x.k === "Rentabilidad media");
  assert("«No disponible» y la burbuja dice por qué", r && r.v === "No disponible" && r.title === "Sin archivo de rendimientos.", r);

  console.log("== R2. Con el archivo ==");
  const esperado = await page.evaluate(() => {
    const W = "0x" + "11".repeat(20);
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    renderDashboard();
    return dashNum(100 * 400 / 308 / (ccDiasEntreFechas(hoyEspana(), "2024-03-01") / 365.25), 1) + " % anual";
  });
  c = await casillas();
  const i = c.findIndex(x => x.k === "Rentabilidad media");
  r = c[i];
  assert("entre «Rendimientos» y «Movimientos»", i > 0 && c[i - 1].k === "Rendimientos" && c[i + 1].k === "Movimientos", c.map(x => x.k));
  assert("la cifra de la cuenta: 400 $ sobre 308 $ de media, desde el 01/03/2024", r.v === esperado, { v: r.v, esperado });
  assert("la burbuja: de qué sale cada parte",
    /^Rendimientos 400,00 USD y ganancia de ventas 0,00 USD \(en USD; 🧾 Fiscal va en €\), sobre 308,00 USD invertidos de media, desde 01\/03\/2024 \([\d,]+ años\)$/.test(r.title), r.title);

  console.log("== R3. Alineación y errores ==");
  assert("todas las cifras de la franja terminan a la misma altura (±2 px)", Math.max(...c.map(x => x.abajo)) - Math.min(...c.map(x => x.abajo)) <= 2, c.map(x => [x.k, x.abajo]));
  await (await page.$("#tarjetaMetricas .dash-metrics")).screenshot({ path: path.join(OUT, "cap_rent1_franja.png") });
  assert("0 errores de consola", errores.length === 0, errores);

  await browser.close();
  console.log("\n" + ok + " OK, " + fallos + " FALLOS");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
