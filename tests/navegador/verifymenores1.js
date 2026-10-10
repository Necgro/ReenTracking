/* Verificación headless de arreglos menores con DATOS 100 % SINTÉTICOS
 * (lo de pantalla; lo puro está en tests/test_menores_paso_menores1.js):
 *
 *  M1) Con el almacenamiento del navegador bloqueado, la app arranca.
 *  M2) 💶: al cerrar una fila con Esc, «Cancelar» o Intro sin cambios, el
 *      foco vuelve a su «✏️ Editar».
 *  M3) 📒 se pinta una sola vez al clasificar (el descubrimiento también
 *      llama a renderPanel: no debe pintarse dos veces).
 *  M4) «Archivo de rendimientos cargado: 1 reparto.».
 *  M5) 0 errores de consola.
 *
 * Ejecución (desde la raíz, con el servidor de siempre y NODE_PATH al
 * node_modules del arnés): node tests/navegador/verifymenores1.js
 */
"use strict";
const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");
const esperar = ms => new Promise(s => setTimeout(s, ms));

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
function vigilar(page, errores) {
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run"] });

  console.log("== M1. Arranca con el almacenamiento bloqueado ==");
  const bloqueada = await browser.newPage();
  const erroresBloq = [];
  vigilar(bloqueada, erroresBloq);
  await bloqueada.evaluateOnNewDocument(() => {
    const lanza = () => { throw new DOMException("bloqueado", "SecurityError"); };
    Object.defineProperty(window, "localStorage", { get: lanza });
    Object.defineProperty(window, "sessionStorage", { get: lanza });
    Object.defineProperty(window, "indexedDB", { get: lanza });
  });
  await bloqueada.goto(BASE + "index.html#transacciones", { waitUntil: "networkidle0" });
  await esperar(500);
  const arranque = await bloqueada.evaluate(() => ({
    modo: typeof document.getElementById("btnDark").onclick,
    activa: (document.querySelector(".view.active") || {}).id,
  }));
  assert("init() llega al final (el botón de modo oscuro y la pestaña)", arranque.modo === "function" && arranque.activa === "view-transacciones", arranque);
  await bloqueada.click("#btnDark");
  assert("cambiar a oscuro no lanza", await bloqueada.evaluate(() => document.body.classList.contains("dark")));
  assert("sin errores en la página", erroresBloq.filter(e => !/IndexedDB|indexedDB|bloqueado/.test(e)).length === 0, erroresBloq);
  await bloqueada.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errores = [];
  vigilar(page, errores);
  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });

  console.log("== M2. 💶: el foco vuelve a «✏️ Editar» ==");
  await page.evaluate(() => {
    state.cache = asegurarEstructuraCache({});
    state.registros = [{ clave: "cb1", hash: "0x" + "b".repeat(64), fecha: "2025-01-02 10:00:00", categoria: "COMPRA",
      subcategoria: "COSTE_BASE", via_compra: "BANCARIA", inmueble: "Prueba 1", cantidad: 5, coste_eur: 500,
      fuente: "ONCHAIN", contrato: "", token: "RTK", simbolo: "RTK", nota: "", revisar: false }];
    renderCorrecciones();
    const d = document.querySelector("#cbCuerpo").closest("details");
    if (d) d.open = true;
  });
  const enfocado = () => page.evaluate(() => {
    const a = document.activeElement;
    return a ? (a.getAttribute("data-cb") || "") + ":" + (a.getAttribute("data-clave") || "") : "";
  });
  for (const [nombre, cerrar] of [
    ["Esc", async () => page.keyboard.press("Escape")],
    ["Intro sin cambios", async () => page.keyboard.press("Enter")],
    ["Cancelar", async () => page.click('#cbCuerpo [data-cb="cancelar"]')],
  ]) {
    await page.click('#cbCuerpo [data-cb="editar"]');
    assert(nombre + ": se abre con el cursor en la casilla", await page.evaluate(() => document.activeElement.classList.contains("cb-valor")));
    await cerrar();
    await esperar(100);
    assert(nombre + ": el foco, en su «✏️ Editar»", (await enfocado()) === "editar:cb1", await enfocado());
  }

  // Guardar de verdad (el guardado en disco y la reclasificación, simulados con una espera).
  await page.evaluate(() => {
    window.__guardarOriginal = window.ccGuardarAjustesDecision;
    window.ccGuardarAjustesDecision = async nuevos => {
      state.cache.ajustes_usuario = nuevos;
      await new Promise(r => setTimeout(r, 300));
      renderCorrecciones();
    };
  });
  for (const [nombre, otroSitio, espera] of [["Guardar un cambio", false, "editar:cb1"], ["Guardar y escribir en otro sitio", true, "txt"]]) {
    await page.click('#cbCuerpo [data-cb="editar"]');
    await page.keyboard.type(otroSitio ? "7" : "6");
    await page.keyboard.press("Enter");
    if (otroSitio) await page.evaluate(() => {
      const t = document.getElementById("txtAjustes");
      for (let d = t.closest("details"); d; d = d.parentElement.closest("details")) d.open = true;
      t.focus();
    });
    await esperar(500);
    const foco = await page.evaluate(() => document.activeElement.id === "txtAjustes" ? "txt" : (document.activeElement.getAttribute("data-cb") || "") + ":" + (document.activeElement.getAttribute("data-clave") || ""));
    assert(nombre + ": el foco, " + (otroSitio ? "donde estabas" : "en su «✏️ Editar»"), foco === espera, foco);
  }
  await page.evaluate(() => { window.ccGuardarAjustesDecision = window.__guardarOriginal; });

  console.log("== M3. 📒 se pinta una vez al clasificar ==");
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(200);
  const pintadas = await page.evaluate(() => {
    let n = 0;
    const original = window.renderTransacciones;
    window.renderTransacciones = function () { n++; return original.apply(this, arguments); };
    // Una clasificación mínima: el descubrimiento repinta el panel, como de verdad.
    window.requisitosClasificacionOk = () => ({ cacheOk: true, csvOk: true, configOk: true });
    window.descubrimientoAntesDeClasificar = () => { renderPanel(); return null; };
    window.clasificarTransacciones = () => state.registros;
    const r = ejecutarClasificacion({ silencioso: true, detalle: false });
    window.renderTransacciones = original;
    return { r, n };
  });
  assert("clasifica y 📒 se pinta una vez", pintadas.r === true && pintadas.n === 1, pintadas);

  console.log("== M4. «1 reparto» ==");
  const avisos = await page.evaluate(() => {
    const vistos = [];
    const t = window.toast;
    window.toast = (m, ...r) => { vistos.push(m); return t(m, ...r); };
    aplicarCsvTexto(["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet",
      '"Prueba 1 #01/2025",2025-01-31,"3,5",0,"3,5",0,"[\'0x' + "1".repeat(64) + '\']","[]",0x' + "1".repeat(40)].join("\n"), false, "r.csv");
    window.toast = t;
    return vistos;
  });
  assert("dice «1 reparto.»", avisos.includes("Archivo de rendimientos cargado: 1 reparto."), avisos);

  console.log("== M5. Consola ==");
  assert("0 errores de consola", errores.length === 0, errores);

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK -> " + (fallos ? fallos + " FALLOS" : "TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
