/* Verificación en navegador del almacén: tu archivo vive en este navegador
 * y se guarda solo. Datos 100 % sintéticos; IndexedDB de verdad;
 * la descarga de la copia y elegir un archivo son dobles.
 *
 *  M1) Primera vez: la explicación, «📂 Abrir copia» y nada de «💾 Guardar»,
 *      «✨ Empezar de cero» ni «📂 Seguir con…»; sin datos, sin «🗂️ Guardar copia».
 *  M2) «📂 Abrir copia»: la copia pasa a ser lo de este navegador (sin su
 *      marca), con su línea y «🗂️ Guardar copia» y «Última copia: ninguna.».
 *  M3) F5: sale lo guardado tal cual.
 *  M4) «🗂️ Guardar copia»: descarga reental_cache_AAAA-MM-DD_HHMM.json y
 *      «Última copia: hoy».
 *  M5) una sola pestaña: la segunda lo dice, no lee ni guarda nada, y la
 *      primera sigue guardando.
 *  M6) «🧹 Olvidar todo»: el diálogo (con la opción de la copia); «Cancelar»
 *      no borra nada; «Guardar copia y olvidar» descarga y lo borra todo.
 *  M7) Lo guardado con el formato anterior (uno por pestaña) pasa al registro nuevo al abrir.
 *  M8) Captura; 0 errores de consola, nada a internet y sin scroll de lado.
 *  M9) al cerrar la primera pestaña, la segunda se abre sola con lo guardado.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyalmacen1.js
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
  await page.setViewport({ width: 1366, height: 1000 });
  const consola = [];
  const escuchar = p => {
    p.on("console", m => consola.push({ tipo: m.type(), texto: m.text(), url: (m.location() || {}).url || "" }));
    p.on("pageerror", e => consola.push({ tipo: "pageerror", texto: String(e && e.message || e), url: "" }));
    p.on("dialog", async d => { await d.accept(); });   // la pregunta de «📂 Abrir copia» con datos
  };
  escuchar(page);
  const errores = () => consola.filter(m => (m.tipo === "error" || m.tipo === "pageerror") && !/favicon/i.test(m.url + " " + m.texto));
  let red = 0;
  page.on("request", r => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) red++; });

  // Dobles: la descarga (se apunta en sessionStorage, que sobrevive a la recarga), elegir un archivo y descargar de internet.
  function instalarDobles() {
    window.descargarJson = (nombre, obj) => {
      const l = JSON.parse(sessionStorage.getItem("arnes_descargas") || "[]");
      l.push({ nombre, tx: obj.transacciones.wallet_tokens.length, marca: "copia_de_seguridad" in obj });
      sessionStorage.setItem("arnes_descargas", JSON.stringify(l));
    };
    window.sincronizar = async () => ({ errores: [] });
    window.elegirArchivo = async () => ({ text: async () => window.__copia });
  }
  const copiaCon = n => page.evaluate(n => {
    const c = cacheVacia();
    for (let i = 0; i < n; i++) c.transacciones.wallet_tokens.push({ hash: "0x" + String(i).padStart(64, "0"), from: "0x1", to: "0x2", value: "1" });
    c.copia_de_seguridad = { creada: "2026-10-07T10:00:00Z" };
    window.__copia = JSON.stringify(c);
  }, n);
  const guardado = p => p.evaluate(async () => {
    const r = await idbOperar("readonly", s => s.getAllKeys());
    const g = await idbOperar("readonly", s => s.get("archivo"));
    return { claves: r, tx: g ? JSON.parse(g.texto).transacciones.wallet_tokens.length : null, marca: g ? JSON.parse(g.texto).copia_de_seguridad !== undefined : null,
      ls: Object.keys(localStorage).filter(k => k.startsWith("reental_")) };
  });
  const pantalla = p => p.evaluate(() => ({
    explica: !document.getElementById("arrExplica").hidden, linea: document.getElementById("arrArchivo").hidden ? "" : document.getElementById("arrNombreArchivo").textContent,
    copia: !document.getElementById("btnCopia").hidden, abrir: document.getElementById("btnAbrirArchivo").textContent,
    ultima: document.getElementById("exUltima").hidden ? "" : document.getElementById("exUltima").textContent,
    viejos: ["btnGuardarCache", "btnNuevaCache", "arrSeguirCache"].filter(id => document.getElementById(id)),
    tx: state.cache ? arrNumTx(state.cache) : null }));

  console.log("M1) Primera vez");
  await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    localStorage.clear(); sessionStorage.clear();
    await new Promise(r => { const p = indexedDB.deleteDatabase("reental_spa"); p.onsuccess = p.onerror = p.onblocked = () => r(); });
  });
  await page.reload({ waitUntil: "networkidle0" });
  const m1 = await pantalla(page);
  assert("M1 -> la explicación y «📂 Abrir copia»; sin «🗂️ Guardar copia» sin datos", m1.explica && !m1.linea && !m1.copia && m1.abrir === "📂 Abrir copia" && m1.tx === 0, m1);
  assert("M1 -> sin «💾 Guardar», «✨ Empezar de cero» ni «📂 Seguir con…»", m1.viejos.length === 0, m1.viejos);
  assert("M1 -> nada guardado todavía", (await guardado(page)).claves.length === 0);

  console.log("M2) «📂 Abrir copia»");
  await page.evaluate(instalarDobles);
  await copiaCon(3);
  await page.click("#btnAbrirArchivo");
  await page.waitForFunction(() => !arr.preparando && arrNumTx(state.cache) === 3, { timeout: 15000 });
  await esperar(300);
  const m2 = await pantalla(page), g2 = await guardado(page);
  assert("M2 -> su línea, «🗂️ Guardar copia» y «Última copia: ninguna.»", m2.linea === "📄 3 transacciones · se guarda solo en este navegador" &&
    m2.copia && m2.ultima === "Última copia: ninguna." && !m2.explica, m2);
  assert("M2 -> guardada en el navegador sin su marca", g2.tx === 3 && g2.marca === false && g2.claves.join() === "archivo", g2);
  await page.screenshot({ path: path.join(OUT, "cap_almacen1_inicio.png") });

  console.log("M3) F5");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => state.cache && arrNumTx(state.cache) === 3 && !arr.preparando, { timeout: 15000 });
  assert("M3 -> sale lo guardado", (await pantalla(page)).linea.startsWith("📄 3 transacciones"));

  console.log("M4) «🗂️ Guardar copia»");
  await esperar(500);   // tras F5 la app clasifica (con el botón apagado mientras)
  await page.waitForFunction(() => !arr.preparando && !document.getElementById("btnCopia").disabled, { timeout: 15000 });
  await page.evaluate(instalarDobles);
  await page.evaluate(() => { window.scrollTo(0, 0); });   // tras el flujo, la página bajó al resumen
  await page.click("#btnCopia");
  await esperar(300);
  const descargas = await page.evaluate(() => JSON.parse(sessionStorage.getItem("arnes_descargas") || "[]"));
  assert("M4 -> descarga reental_cache_AAAA-MM-DD_HHMM.json con lo guardado y su marca", descargas.length === 1 &&
    /^reental_cache_\d{4}-\d{2}-\d{2}_\d{4}\.json$/.test(descargas[0].nombre) && descargas[0].tx === 3 && descargas[0].marca, descargas);
  assert("M4 -> «Última copia: hoy»", (await pantalla(page)).ultima === "Última copia: hoy");

  console.log("M5) Una sola pestaña (A1)");
  const otra = await browser.newPage();
  escuchar(otra);
  await otra.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
  await esperar(300);
  const m5 = await otra.evaluate(() => {
    const aviso = document.getElementById("arrOtraPestana"), r = aviso.getBoundingClientRect();
    const encima = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return { visible: !aviso.hidden && r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1, tapa: aviso.contains(encima),
      texto: aviso.textContent.replace(/\s+/g, " ").trim(), cache: state.cache, solo: arr.soloLectura };
  });
  assert("M5 -> la segunda pestaña lo dice, tapando la app, y no lee nada", m5.visible && m5.tapa && m5.cache === null && m5.solo &&
    /ya está abierto en otra pestaña/.test(m5.texto), m5);
  await otra.screenshot({ path: path.join(OUT, "cap_almacen1_otra_pestana.png") });
  await page.bringToFront();
  await page.evaluate(async () => { state.cache.transacciones.wallet_tokens.push({ hash: "0x" + "f".repeat(64), from: "0x1", to: "0x2", value: "1" }); marcarCacheDirty(); await autoGuardarCache(); });
  assert("M5 -> la primera sigue guardando", (await guardado(page)).tx === 4);
  assert("M5 -> y la segunda sigue sin nada", await otra.evaluate(() => state.cache === null && !document.getElementById("arrOtraPestana").hidden));
  await otra.close();

  console.log("M6) «🧹 Olvidar todo»");
  // Con «🔄 Actualizar» más abajo, el botón de abajo queda al
  // borde de la ventana, bajo los avisos flotantes: se centra antes de pulsarlo.
  await page.$eval("#arrOlvidarTodo", b => b.scrollIntoView({ block: "center" }));
  await page.click("#arrOlvidarTodo");
  await esperar(200);
  const dlg = await page.evaluate(() => ({ abierto: document.getElementById("arrDlgOlvidar").open, copia: !document.getElementById("arrDlgCopia").hidden }));
  assert("M6 -> el diálogo, con la opción de guardar una copia antes", dlg.abierto && dlg.copia, dlg);
  await page.screenshot({ path: path.join(OUT, "cap_almacen1_olvidar.png") });
  await page.click('#arrDlgOlvidar button[value=""]');
  await esperar(300);
  const m6a = await guardado(page);
  assert("M6 -> «Cancelar»: no borra nada", !(await page.evaluate(() => document.getElementById("arrDlgOlvidar").open)) && m6a.tx === 4 && m6a.ls.length > 0, m6a);
  await page.evaluate(instalarDobles);
  await page.click("#arrOlvidarTodoArriba");
  await esperar(200);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
    page.click('#arrDlgOlvidar button[value="copia"]')]);
  const tras = await page.evaluate(() => JSON.parse(sessionStorage.getItem("arnes_descargas") || "[]"));
  const m6 = await guardado(page), p6 = await pantalla(page);
  assert("M6 -> «Guardar copia y olvidar»: descargó la copia (con lo de ahora) y luego lo borró todo",
    tras.length === 2 && tras[1].tx === 4 && m6.claves.length === 0 && m6.ls.length === 0 && p6.tx === 0 && p6.explica, { tras, m6, p6 });

  console.log("M7) Lo de COPIA-5 pasa al registro nuevo");
  await page.evaluate(async () => {
    const c = cacheVacia(); c.transacciones.wallet_tokens.push({ hash: "0x" + "a".repeat(64), from: "0x1", to: "0x2", value: "1" });
    await idbOperar("readwrite", s => { s.put({ pestana: "x", cuando: 1, texto: JSON.stringify(c), dirty: false }, "archivo:x"); s.put("permiso", "cache"); });
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => state.cache && arrNumTx(state.cache) === 1, { timeout: 15000 }).catch(() => {});
  const m7 = await guardado(page);
  assert("M7 -> sale y queda solo «archivo»", (await pantalla(page)).tx === 1 && m7.claves.join() === "archivo", m7);

  console.log("M8) Pantalla");
  assert("M8 -> a 1366 px sin scroll de lado", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  assert("M8 -> 0 errores de consola", errores().length === 0, errores().slice(0, 3));
  assert("M8 -> nada a internet", red === 0, red);

  console.log("M9) Al cerrar la primera, la segunda se abre sola (A1)");
  const segunda = await browser.newPage();
  escuchar(segunda);
  await segunda.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
  await esperar(300);
  const antes9 = await segunda.evaluate(() => arr.soloLectura && state.cache === null);
  await page.close();
  await segunda.waitForFunction(() => !arr.soloLectura && state.cache && arrNumTx(state.cache) === 1, { timeout: 15000 }).catch(() => {});
  const m9 = await segunda.evaluate(() => ({ solo: arr.soloLectura, tx: state.cache ? arrNumTx(state.cache) : null, aviso: !document.getElementById("arrOtraPestana").hidden }));
  assert("M9 -> bloqueada mientras la primera vive; al cerrarla se abre sola con lo guardado", antes9 && !m9.solo && m9.tx === 1 && !m9.aviso, { antes9, m9 });

  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
