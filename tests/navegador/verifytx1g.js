/* Verificación headless de 📒 Transacciones más despejada (burbujas
 * cortas, sin el botón «Spam» ni los chips, el spam aparte con su
 * resumen por motivo, nota de compras y recuento cortos):
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS 100 %
 * SINTÉTICOS (los de verifytx1f.js con más spam: sin nombre, con
 * publicidad y con símbolos raros). Capturas cap_tx1g_*.png.
 *
 * Las comprobaciones G1–G8 están en tx1g_comun.js (las mismas que con tus
 * datos en verifytx1g_real.js); aquí, además:
 *  S1) los datos tienen spam de 4 motivos distintos.
 *  S2) oscuro y 0 errores de consola.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifytx1g.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");
const comprobarTx1g = require("./tx1g_comun");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");
const OUT = __dirname;

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const esperar = ms => new Promise(s => setTimeout(s, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1600,1400"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });

  /* Cache sintética: compras y una venta de un inmueble, un cobro en USDT,
     un traspaso del wallet al vault, un depósito en un pool conocido, spam
     y un rendimiento del archivo de Reental. */
  function montar() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20);
    const T = "0x" + "77".repeat(20), POOL = "0x" + "e0".repeat(20);
    const P1 = "0x" + "a1".repeat(20), RARO = "0x" + "f0".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
    const tok6 = u => BigInt(Math.trunc(u * 1e6)).toString();
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" } };
    cache.contratos_aprendidos.DEFI_POOL = { [POOL]: "Pool RNT/USDT" };
    const leg = (h, from, to, contrato, value, name, sym, dec, t, blk) => ({
      blockNumber: blk, timeStamp: t, hash: h, from, to, contractAddress: contrato,
      value, tokenName: name, tokenSymbol: sym, tokenDecimal: dec,
    });
    cache.transacciones.wallet_tokens.push(
      leg(Hh(1), W, T, P1, tok18(200), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 6, 14, 22), "100"),
      leg(Hh(2), T, W, USDT, tok6(3204), "Tether USD", "USDT", "6", ts(2026, 6, 19, 18), "102"),
      leg(Hh(3), W, V, USDT, tok6(250), "Tether USD", "USDT", "6", ts(2026, 6, 20, 10), "104"),
      leg(Hh(4), W, POOL, RNT, tok18(40), "Reental", "RNT", "18", ts(2026, 6, 21, 10), "105"),
      leg(Hh(5), T, W, P1, tok18(300), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 1, 10, 9), "50"),
      leg(Hh(6), T, W, RARO, tok18(999), "Visit https://premio-gratis-para-ti.example.app/", "SCAM", "18", ts(2026, 2, 1, 9), "60"),
      leg(Hh(7), T, W, "0x" + "f1".repeat(20), tok18(5), "", "Airdrop pendiente", "18", ts(2026, 2, 2, 9), "61"),
      leg(Hh(8), T, W, "0x" + "f2".repeat(20), tok18(7), "Claim your reward", "OPEN ✅ t .me/x", "18", ts(2026, 2, 3, 9), "62"),
      leg(Hh(9), T, W, "0x" + "f3".repeat(20), tok6(10), "ՍƧⅮ⊤", "υꓢⅮΤ0", "6", ts(2026, 2, 4, 9), "63"),
      leg(Hh(10), T, W, "0x" + "f4".repeat(20), tok18(3), "Visit www.otro-premio.example", "SCAM2", "18", ts(2026, 2, 5, 9), "64"));
    state.cache = cache;
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
  }

  await page.goto(BASE + "index.html#transacciones", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montar);
  await page.evaluate(() => ejecutarClasificacion());
  await esperar(800);
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(400);

  /* ============ S1) variedad de los datos ============ */
  const s1 = await page.evaluate(() => txResumenSpam(state.registros, txContextoSpam(state.cache)).map(m => m.id + ":" + m.n));
  assert("S1 -> spam de 4 motivos: web (2), sin nombre, publicidad y símbolos raros",
    JSON.stringify(s1) === JSON.stringify(["web:2", "sin-nombre:1", "publicidad:1", "simbolos:1"]), s1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, "cap_tx1g_libro.png") });

  await comprobarTx1g(page, assert, { capSpam: path.join(OUT, "cap_tx1g_spam.png") });

  /* ============ S2) oscuro y errores ============ */
  await page.evaluate(() => document.querySelector("#txRecuento [data-ver-spam]").click());
  await page.evaluate(() => { document.body.classList.add("dark"); window.scrollTo(0, 0); });
  await esperar(200);
  const oscuro = await page.evaluate(() => ({ fondo: getComputedStyle(document.querySelector(".card")).backgroundColor,
    motivo: getComputedStyle(document.querySelector("#txMotivosSpam li")).color }));
  assert("S2 -> en oscuro, la tarjeta y los motivos con los colores del tema oscuro", oscuro.fondo !== "rgb(255, 255, 255)" && oscuro.motivo !== "rgb(0, 0, 0)", oscuro);
  await page.screenshot({ path: path.join(OUT, "cap_tx1g_oscuro.png") });
  assert("S2 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
