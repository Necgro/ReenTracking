/* Arnés del interruptor «Ver todos» del catálogo de 🔍 Revisión (P18), con
 * datos inventados: un inmueble que tienes y otro vendido entero.
 *
 *  K1) apagado: solo el que tienes; el título cuenta 1 y el interruptor dice
 *      «Ver todos (2)».
 *  K2) encendido: salen los dos, el vendido en gris; apagarlo los vuelve a
 *      esconder. Con el teclado (espacio) también.
 *  K3) sin nada vendido, el interruptor no sale; oscuro y 0 errores.
 *
 * DATOS 100 % SINTÉTICOS. Ejecución (servidor en 8765 y NODE_PATH a
 * puppeteer-core):  node tests/navegador/verifycatalogo1.js
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
const esperar = ms => new Promise(s => setTimeout(s, ms));

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
  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });

  await page.evaluate(() => {
    const W = "0x" + "11".repeat(20), T = "0x" + "77".repeat(20), OTRA = "0x" + "99".repeat(20);
    const P1 = "0x" + "a1".repeat(20), P2 = "0x" + "a2".repeat(20);
    state.config = { wallet: W, vault: "0x" + "22".repeat(20), compra_bancaria_coste_eur_por_token: 100, etherscan_api_key: "TEST_SINTETICA" };
    const c = cacheVacia();
    c.catalogo_propiedades = {
      [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1", primera_aparicion: "2024-03-01" },
      [P2]: { estado: "CONFIRMADA", nombre_reental: "Prueba Bahía 2", simbolo: "RBAH2", primera_aparicion: "2024-04-01" },
    };
    const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 9) / 1000));
    const t = (n, contrato, de, a, sym, fecha) => ({ blockNumber: String(n), timeStamp: fecha, hash: "0x" + String(n).padStart(4, "0") + "ab".repeat(30),
      from: de, to: a, contractAddress: contrato, value: (4n * 10n ** 18n).toString(), tokenName: "Reental " + sym, tokenSymbol: sym, tokenDecimal: "18" });
    c.transacciones.wallet_tokens.push(t(1, P1, T, W, "RALC1", ts(2024, 3, 1)), t(2, P2, T, W, "RBAH2", ts(2024, 4, 1)), t(3, P2, W, OTRA, "RBAH2", ts(2024, 9, 1)));
    state.cache = c;
    window.escribirArchivoNavegador = async () => {};
    renderPanel();
    document.getElementById("rvCatalogo").open = true;
  });
  const vista = () => page.evaluate(() => ({
    filas: [...document.querySelectorAll("#tablaCatalogo tr[data-addr]")].map(r => r.cells[0].textContent + (r.classList.contains("rv-sin-tokens") ? " (gris)" : "")),
    n: document.getElementById("nCatalogo").textContent,
    interruptor: !document.getElementById("rvCatalogoTodosCaja").hidden && document.getElementById("rvCatalogoTodosCaja").offsetParent !== null,
    texto: document.getElementById("rvCatalogoTodosCaja").textContent,
    marcado: document.getElementById("rvCatalogoTodos").checked,
    opacidad: (() => { const r = document.querySelector("#tablaCatalogo tr.rv-sin-tokens td"); return r ? getComputedStyle(r).opacity : null; })(),
  }));

  /* K1 */
  const k1 = await vista();
  assert("K1 -> apagado: solo el que tienes, el título dice 1 y el interruptor «Ver todos (2)»",
    JSON.stringify(k1.filas) === JSON.stringify(["Prueba Alcazaba 1"]) && k1.n === "1" && k1.interruptor && k1.texto === "Ver todos (2)" && !k1.marcado, k1);
  await page.evaluate(() => document.getElementById("rvCatalogo").scrollIntoView({ block: "start" }));
  await page.screenshot({ path: path.join(OUT, "cap_catalogo1_apagado.png") });

  /* K2 */
  await page.click("#rvCatalogoTodosCaja");
  await esperar(150);
  const k2 = await vista();
  assert("K2 -> encendido: los dos, el vendido en gris; el título dice 2",
    JSON.stringify(k2.filas) === JSON.stringify(["Prueba Alcazaba 1", "Prueba Bahía 2 (gris)"]) && k2.n === "2" && k2.marcado, k2);
  assert("K2 -> el vendido, atenuado", k2.opacidad === "0.5", k2.opacidad);
  await page.screenshot({ path: path.join(OUT, "cap_catalogo1_encendido.png") });
  await page.click("#rvCatalogoTodosCaja");
  await esperar(150);
  assert("K2 -> apagarlo los vuelve a esconder", JSON.stringify((await vista()).filas) === JSON.stringify(["Prueba Alcazaba 1"]));
  await page.focus("#rvCatalogoTodos");
  await page.keyboard.press("Space");
  await esperar(150);
  assert("K2 -> con el teclado (espacio) también", (await vista()).filas.length === 2 && (await page.evaluate(() =>
    document.getElementById("rvCatalogoTodos").getAttribute("role"))) === "switch");

  /* K3 */
  await page.evaluate(() => { state.cache.transacciones.wallet_tokens.pop(); renderPanel(); });
  await esperar(100);
  const k3 = await vista();
  assert("K3 -> sin nada vendido, sin interruptor y los dos a la vista", !k3.interruptor && k3.filas.length === 2 && k3.n === "2", k3);
  await page.evaluate(() => { state.cache.transacciones.wallet_tokens.push({ blockNumber: "3", timeStamp: "1725181200",
    hash: "0x0003" + "ab".repeat(30), from: "0x" + "11".repeat(20), to: "0x" + "99".repeat(20), contractAddress: "0x" + "a2".repeat(20),
    value: (4n * 10n ** 18n).toString(), tokenName: "Reental RBAH2", tokenSymbol: "RBAH2", tokenDecimal: "18" });
    document.body.classList.add("dark"); renderPanel(); });
  await esperar(150);
  const pista = await page.evaluate(() => getComputedStyle(document.querySelector(".rv-interruptor-pista")).backgroundColor);
  assert("K3 -> en oscuro, el interruptor con el color del tema", !!pista && pista !== "rgba(0, 0, 0, 0)", pista);
  await page.screenshot({ path: path.join(OUT, "cap_catalogo1_oscuro.png") });
  /* K4) auditoría */
  await page.evaluate(() => { document.body.classList.remove("dark"); });
  await page.click("#rvCatalogoTodosCaja");   // encendido
  await esperar(100);
  await page.evaluate(() => { state.cache.transacciones.wallet_tokens.pop(); renderPanel(); });   // ya no hay vendidos
  await esperar(100);
  await page.evaluate(() => { state.cache.transacciones.wallet_tokens.push({ blockNumber: "3", timeStamp: "1725181200",
    hash: "0x0003" + "ab".repeat(30), from: "0x" + "11".repeat(20), to: "0x" + "99".repeat(20), contractAddress: "0x" + "a2".repeat(20),
    value: (4n * 10n ** 18n).toString(), tokenName: "Reental RBAH2", tokenSymbol: "RBAH2", tokenDecimal: "18" }); renderPanel(); });
  await esperar(100);
  const k4a = await vista();
  assert("K4 -> al volver a haber uno vendido, el interruptor sale apagado", !k4a.marcado && k4a.filas.length === 1, k4a);
  await page.evaluate(() => { state.cache.transacciones.wallet_tokens.push({ blockNumber: "4", timeStamp: "1725181300",
    hash: "0x0004" + "ab".repeat(30), from: "0x" + "11".repeat(20), to: "0x" + "99".repeat(20), contractAddress: "0x" + "a1".repeat(20),
    value: (4n * 10n ** 18n).toString(), tokenName: "Reental RALC1", tokenSymbol: "RALC1", tokenDecimal: "18" }); renderPanel(); });
  await esperar(100);
  const k4b = await page.evaluate(() => document.getElementById("tablaCatalogo").textContent);
  assert("K4 -> todo vendido: «Ninguno con tokens.», no «Sin inmuebles todavía.»", k4b.includes("Ninguno con tokens.") && (await vista()).n === "0", k4b);
  await page.evaluate(() => { state.config.vault = ""; renderPanel(); });
  await esperar(100);
  const k4c = await vista();
  assert("K4 -> sin vault en tus datos no se esconde nada (lo pasado al vault parecería vendido)", !k4c.interruptor && k4c.filas.length === 2, k4c);
  assert("K3 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
