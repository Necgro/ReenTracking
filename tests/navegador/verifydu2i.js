/* Verificación headless de 💶 Coste de las compras bancarias en
 * 🔍 Revisión: Chrome local + puppeteer-core sobre
 * http://localhost:8765. DATOS 100 % SINTÉTICOS: tres compras bancarias de
 * dos inmuebles, una con un ajuste manual de otro origen. Capturas
 * cap_du2i_*.png.
 *
 * Las comprobaciones C1–C6 están en du2i_comun.js (las mismas que con tus
 * datos en verifydu2i_real.js); aquí, además, oscuro y 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifydu2i.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");
const comprobarDu2i = require("./du2i_comun");

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

  /* Cache sintética: dos compras bancarias de un inmueble y una de otro
     (con un ajuste manual ajeno), más un rendimiento del archivo. */
  function montar() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), T = "0x" + "77".repeat(20);
    const P1 = "0x" + "a1".repeat(20), P2 = "0x" + "a2".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = {
      [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" },
      [P2]: { estado: "CONFIRMADA", nombre_reental: "Prueba Bahía 2", simbolo: "RBAH2" },
    };
    const leg = (h, contrato, unidades, name, sym, t, blk) => ({
      blockNumber: blk, timeStamp: t, hash: h, from: T, to: W, contractAddress: contrato,
      value: tok18(unidades), tokenName: name, tokenSymbol: sym, tokenDecimal: "18",
    });
    cache.transacciones.wallet_tokens.push(
      leg(Hh(1), P1, 4, "Reental Prueba Alcazaba 1", "RALC1", ts(2024, 9, 17, 9), "50"),
      leg(Hh(2), P1, 4, "Reental Prueba Alcazaba 1", "RALC1", ts(2024, 9, 17, 11), "51"),
      leg(Hh(3), P2, 8, "Reental Prueba Bahía 2", "RBAH2", ts(2025, 9, 23, 16), "60"));
    cache.ajustes_usuario = { [Hh(3) + "::" + P2]: { coste_eur: 720, nota: "ajuste a mano (sintético)" } };
    state.cache = cache;
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
  }

  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montar);
  await page.evaluate(() => ejecutarClasificacion());
  await esperar(800);

  const bancarias = await page.evaluate(() => state.registros.filter(r => r.via_compra === "BANCARIA").map(r => [r.inmueble, r.coste_eur]));
  assert("S1 -> los datos tienen 3 compras bancarias (la ajena, a 720 €)",
    bancarias.length === 3 && bancarias.some(([, c]) => c === 720), bancarias);

  await comprobarDu2i(page, assert, { ajenas: 1, cap: path.join(OUT, "cap_du2i_editor.png") });

  /* ============ S1b) móvil: la tabla scrollea en su caja ============ */
  await page.setViewport({ width: 375, height: 812 });
  await esperar(300);
  const movil = await page.evaluate(() => {
    const caja = document.querySelector("#cbCuerpo .cb-caja"), det = document.getElementById("cbCoste");
    return { caja: Math.round(caja.getBoundingClientRect().right), det: Math.round(det.getBoundingClientRect().right) };
  });
  assert("S1b -> a 375 px la tabla no se sale del plegable (scrollea en su caja)", movil.caja <= movil.det, movil);
  await page.setViewport({ width: 1366, height: 900 });
  await esperar(300);

  /* ============ S2) oscuro y errores ============ */
  await page.evaluate(() => { document.body.classList.add("dark"); document.getElementById("cbCoste").scrollIntoView({ block: "start" }); });
  await esperar(200);
  const oscuro = await page.evaluate(() => getComputedStyle(document.getElementById("cbCoste")).backgroundColor);
  assert("S2 -> en oscuro, el plegable con el color del tema oscuro", oscuro !== "rgb(255, 255, 255)" && oscuro !== "rgb(247, 249, 247)", oscuro);
  await page.screenshot({ path: path.join(OUT, "cap_du2i_oscuro.png") });
  assert("S2 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
