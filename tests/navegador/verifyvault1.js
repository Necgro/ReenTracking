/* Arnés de «🔍 Buscar mi vault» en 🚀 (P16), con Etherscan simulado.
 *
 *  V1) con datos descargados y el vault vacío, el botón sale bajo el campo
 *      del vault; con el vault escrito, no.
 *  V2) al pulsarlo dice «⏳ Buscando…» y abre la ventana del vault probable.
 *  V3) «No es» la cierra; el botón la vuelve a abrir con el mismo vault.
 *  V4) «Ponerlo» lo escribe en el campo y el botón se va.
 *  V5) sin nada que proponer, «Ningún vault creado por tu wallet.»; con
 *      Etherscan caído, «No se pudo buscar en Etherscan.»; 0 errores.
 *
 * DATOS 100 % SINTÉTICOS. Ejecución (servidor en 8765 y NODE_PATH a
 * puppeteer-core):  node tests/navegador/verifyvault1.js
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
  await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });

  await page.evaluate(() => {
    const W = "0x" + "11".repeat(20), V = "0x" + "b1".repeat(20);
    state.config = Object.assign({}, state.config, { wallet: W, vault: "", etherscan_api_key: "TEST_SINTETICA" });
    document.getElementById("cfgWallet").value = W;
    document.getElementById("cfgVault").value = "";
    document.getElementById("cfgEthKey").value = "TEST_SINTETICA";
    const c = cacheVacia();
    c.transacciones.wallet_normales.push({ hash: "0x" + "ab".repeat(32), from: W, to: V, value: "0", gasUsed: "0", gasPrice: "0",
      timeStamp: "1717232400", blockNumber: "10", isError: "0" });
    state.cache = c;
    window.escribirArchivoNavegador = async () => {};
    window.arrActualizar = async () => { window.__descargas = (window.__descargas || 0) + 1; };
    // Etherscan simulado: solo contesta por lo que se le pregunta.
    window.__creados = [{ direccion: V, fecha: new Date("2024-06-01T09:00:00Z") }];
    window.vaultsCreadosPor = async cands => {
      await new Promise(r => setTimeout(r, 300));
      return window.__creados && window.__creados.filter(v => cands.includes(v.direccion));
    };
    arrPintar();
  });
  const vista = () => page.evaluate(() => {
    const caja = document.getElementById("arrBuscarVaultCaja"), dlg = document.getElementById("arrDlgVault");
    return { visible: !caja.hidden && caja.offsetParent !== null, boton: document.getElementById("btnBuscarVault").textContent,
      nota: document.getElementById("arrBuscarVaultNota").textContent, abierta: dlg.open,
      texto: dlg.textContent.replace(/\s+/g, " ").trim(), campo: document.getElementById("cfgVault").value };
  });

  /* V1 */
  const v1 = await vista();
  assert("V1 -> con datos y el vault vacío, el botón sale bajo el campo del vault", v1.visible && v1.boton === "🔍 Buscar mi vault", v1);
  const dentro = await page.evaluate(() => document.getElementById("arrBuscarVaultCaja").closest(".field") ===
    document.getElementById("cfgVault").closest(".field"));
  assert("V1 -> dentro del campo del vault", dentro);
  await page.evaluate(() => document.getElementById("cfgVault").scrollIntoView({ block: "center" }));
  await page.screenshot({ path: path.join(OUT, "cap_vault1_boton.png") });

  /* V2 */
  await page.click("#btnBuscarVault");
  await esperar(50);
  const durante = await vista();
  await esperar(500);
  const v2 = await vista();
  assert("V2 -> «⏳ Buscando…» mientras busca", durante.boton === "⏳ Buscando…", durante.boton);
  assert("V2 -> abre la ventana con el vault y su fecha", v2.abierta && v2.texto.includes("0x" + "b1".repeat(20) + " creado por tu wallet el 01/06/2024") &&
    v2.boton === "🔍 Buscar mi vault", v2);
  await page.screenshot({ path: path.join(OUT, "cap_vault1_ventana.png") });

  /* V3 */
  await page.click("#arrDlgVault [data-no-es]");
  await esperar(100);
  const v3 = await vista();
  assert("V3 -> «No es» la cierra", !v3.abierta, v3);
  await page.click("#btnBuscarVault");
  await esperar(600);
  assert("V3 -> el botón la vuelve a abrir aunque dijeras «No es»", (await vista()).abierta);

  /* V4 */
  await page.click("#arrDlgVault [data-poner]");
  await esperar(300);
  const v4 = await vista();
  assert("V4 -> «Ponerlo» lo escribe en el campo, descarga y el botón se va",
    v4.campo === "0x" + "b1".repeat(20) && !v4.visible && (await page.evaluate(() => window.__descargas)) === 1, v4);

  /* V5 */
  await page.evaluate(() => { document.getElementById("cfgVault").value = ""; state.config.vault = ""; arrPintar(); window.__creados = []; });
  await page.click("#btnBuscarVault");
  await esperar(600);
  const v5 = await vista();
  assert("V5 -> sin nada: «Ningún vault creado por tu wallet.» y sin ventana", v5.nota === "Ningún vault creado por tu wallet." && !v5.abierta, v5);
  await page.evaluate(() => { window.__creados = null; });
  await page.click("#btnBuscarVault");
  await esperar(600);
  assert("V5 -> Etherscan caído: «No se pudo buscar en Etherscan.»", (await vista()).nota === "No se pudo buscar en Etherscan.");
  await page.evaluate(() => { document.getElementById("cfgVault").value = "0x" + "c2".repeat(20); state.config.vault = "0x" + "c2".repeat(20); arrPintar(); });
  assert("V5 -> con el vault escrito, sin botón", !(await vista()).visible);
  assert("V5 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
