/* Verificación headless de 📤 Exportar: Chrome local +
 * puppeteer-core sobre http://localhost:8765. DATOS 100 % SINTÉTICOS.
 * Capturas cap_ui5_*.png.
 *
 *  (La copia de seguridad se hace en 🚀: la prueba verifypm5.js.)
 *  S7) imprimir: solo la pestaña abierta; en claro y con lo plegado
 *      abierto; al terminar, como estaba (Ctrl+P y botón, que vuelve a 📤).
 *  S8) 375 px sin scroll de lado, oscuro; 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyui5.js
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

  // Config, cache (3 movimientos) y archivo de rendimientos (2 repartos), recordado en el navegador.
  async function montar() {
    await page.evaluate(async () => {
      const W = "0x" + "11".repeat(20);
      state.config = { wallet: W, vault: "", compra_bancaria_coste_eur_por_token: 100.0,
        etherscan_api_key: "CLAVE_SINTETICA", coingecko_api_key: "" };
      volcarConfigAFormulario();
      const cache = cacheVacia();
      for (let i = 1; i <= 3; i++) cache.transacciones.wallet_tokens.push({ hash: "0x" + String(i).padStart(64, "0"), value: "1" });
      state.cache = cache;
      const texto = ["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet",
        "\"Prueba Uno#1\",2025-06-10,3,0,3,0,\"['0x" + "1".padStart(64, "0") + "']\",\"[]\"," + W,
        "\"Prueba Uno#2\",2025-12-10,3,0,3,0,\"['0x" + "2".padStart(64, "0") + "']\",\"[]\"," + W].join("\n");
      // Como cargarCsv (js/12) sin sincronizar: lo aplica con su nombre.
      // El nombre lo apunta js/12 (state.csvArchivo).
      aplicarCsvTexto(texto, false, "rendimientos_prueba.csv");
      window.__textoCsv = texto;
      actualizarChipEstado();
    });
    await instalarGuardar();
    await esperar(300);
  }
  // El diálogo de guardar, simulado: apunta lo que se guardaría.
  const instalarGuardar = () => page.evaluate(() => {
    window.__guardados = [];
    window.guardarJsonComo = async (nombre, obj) => {
      if (window.__cancelar) { const e = new Error("cancelado"); e.name = "AbortError"; throw e; }
      if (window.__lento) await new Promise(r => setTimeout(r, 300));
      window.__guardados.push({ nombre, obj: JSON.parse(JSON.stringify(obj)) });
      return { name: nombre };
    };
  });
  const texto = sel => page.evaluate(s => (document.querySelector(s) || {}).textContent || "", sel);

  await page.goto(BASE + "index.html#exportar", { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise(r => { const p = indexedDB.deleteDatabase("reental_spa"); p.onsuccess = p.onerror = p.onblocked = () => r(); });
  });
  await page.reload({ waitUntil: "networkidle0" });
  await esperar(300);

  // La copia de seguridad se prueba en verifypm5.js.
  await montar();

  /* ============ S7) imprimir ============ */
  await page.evaluate(() => {
    document.body.classList.add("dark");
    location.hash = "#revision";
  });
  await esperar(200);
  await page.emulateMediaType("print");
  const s7a = await page.evaluate(() => [...document.querySelectorAll(".view")]
    .filter(v => getComputedStyle(v).display !== "none").map(v => v.id));
  assert("S7 -> al imprimir solo se ve la pestaña abierta", s7a.length === 1 && s7a[0] === "view-revision", s7a);
  await page.emulateMediaType(null);
  const s7b = await page.evaluate(() => {
    const cerrados = [...document.querySelectorAll("#view-revision details:not([open])")].length;
    window.dispatchEvent(new Event("beforeprint"));
    const durante = { oscuro: document.body.classList.contains("dark"),
      cerrados: document.querySelectorAll("#view-revision details:not([open])").length };
    window.dispatchEvent(new Event("afterprint"));
    return { cerrados, durante, oscuroDespues: document.body.classList.contains("dark"),
      cerradosDespues: document.querySelectorAll("#view-revision details:not([open])").length, hash: location.hash };
  });
  assert("S7 -> Ctrl+P: en claro y con lo plegado abierto", s7b.cerrados > 0 && !s7b.durante.oscuro && s7b.durante.cerrados === 0, s7b);
  assert("S7 -> Ctrl+P: al terminar, como estaba y en la misma pestaña",
    s7b.oscuroDespues && s7b.cerradosDespues === s7b.cerrados && s7b.hash === "#revision", s7b);
  // A11: Ctrl+P en 🚀 Puesta en marcha no abre «nombre y NIF» y no imprime claves ni datos personales.
  await page.evaluate(() => { location.hash = "#inicio"; });
  await esperar(200);
  // Nombre y NIF no tienen su <details>: están en «Tus datos»
  // (#arrDatos). Se pliega y se mira si Ctrl+P lo abre.
  const a11 = await page.evaluate(() => {
    const d = $("cfgNif").closest("details");
    d.open = false;
    window.dispatchEvent(new Event("beforeprint"));
    const nifAbierto = d.open;
    window.dispatchEvent(new Event("afterprint"));
    return { nifAbierto, id: d.id, despues: d.open };
  });
  await page.emulateMediaType("print");
  const a11css = await page.evaluate(() => ["cfgEthKey", "cfgNombre", "cfgNif"].map(id => getComputedStyle($(id)).visibility));
  await page.emulateMediaType(null);
  assert("S7 -> A11: Ctrl+P en 🚀 no abre nombre y NIF y no imprime la API key, el nombre ni el NIF",
    !a11.nifAbierto && a11css.every(v => v === "hidden"), { a11, a11css });
  await page.evaluate(() => {
    window.__impreso = null;
    window.print = () => {
      window.dispatchEvent(new Event("beforeprint"));
      window.__impreso = { hash: location.hash, oscuro: document.body.classList.contains("dark"),
        activa: document.querySelector(".view.active").id };
      window.dispatchEvent(new Event("afterprint"));
    };
    location.hash = "#exportar";
  });
  await esperar(300);
  const nBotones = await page.evaluate(() => document.querySelectorAll(".ex-imprimir").length);
  const historialAntes = await page.evaluate(() => history.length);
  await page.click('.ex-imprimir[data-vista="fiscal"]');
  await esperar(500);
  const s7c = await page.evaluate(() => ({ impreso: window.__impreso, hash: location.hash,
    oscuro: document.body.classList.contains("dark") }));
  assert("S7 -> botón 🧾 Fiscal: imprime esa pestaña en claro", nBotones === 4 && s7c.impreso &&
    s7c.impreso.activa === "view-fiscal" && s7c.impreso.hash === "#fiscal" && !s7c.impreso.oscuro, s7c);
  assert("S7 -> después vuelve a 📤 Exportar y al modo oscuro", s7c.hash === "#exportar" && s7c.oscuro, s7c);
  const historialDespues = await page.evaluate(() => history.length);
  assert("S7 -> A8: imprimir con el botón no deja entradas en «Atrás»", historialDespues === historialAntes, { historialAntes, historialDespues });
  // Navegador que no se para en print(): afterprint llega después y entonces se deshace.
  await page.evaluate(() => {
    window.print = () => { window.__impreso = { activa: document.querySelector(".view.active").id, oscuro: document.body.classList.contains("dark") };
      window.dispatchEvent(new Event("beforeprint")); setTimeout(() => window.dispatchEvent(new Event("afterprint")), 300); };
  });
  await page.click('.ex-imprimir[data-vista="fiscal"]');
  await esperar(100);
  const enMedio = await page.evaluate(() => ({ activa: document.querySelector(".view.active").id, oscuro: document.body.classList.contains("dark") }));
  await esperar(500);
  const alFinal = await page.evaluate(() => ({ hash: location.hash, oscuro: document.body.classList.contains("dark") }));
  assert("S7 -> sin pararse en print(): sigue en 🧾 Fiscal en claro hasta afterprint y luego vuelve",
    enMedio.activa === "view-fiscal" && !enMedio.oscuro && alFinal.hash === "#exportar" && alFinal.oscuro, { enMedio, alFinal });

  /* ============ S9) imprimir pestañas con datos: A1, A6, A12 ============ */
  await page.evaluate(() => {
    const W = "0x" + "11".repeat(20), REENTAL = "0x" + "77".repeat(20);
    const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 10) / 1000));
    const tok18 = u => (BigInt(Math.round(u * 1e6)) * 10n ** 12n).toString();
    const NOMBRES = ["Prueba Cáceres 8", "Prueba Fondo 1", "Prueba Sevilla 2", "Prueba Bilbao 3", "Prueba Cádiz 4", "Prueba Lugo 5", "Prueba Soria 6"];
    const contrato = i => "0x" + ("a" + i).repeat(20);
    state.config = { wallet: W, vault: "", compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    volcarConfigAFormulario();
    const cache = cacheVacia();
    let blk = 100, n = 0;
    const leg = (i, unidades, fecha) => ({ blockNumber: String(blk++), timeStamp: ts(...fecha), hash: "0x" + String(++n).padStart(4, "0") + "cd".repeat(30),
      from: REENTAL, to: W, contractAddress: contrato(i), value: tok18(unidades), tokenName: NOMBRES[i], tokenSymbol: "RPR" + i, tokenDecimal: "18" });
    NOMBRES.forEach((nombre, i) => {
      cache.catalogo_propiedades[contrato(i)] = { estado: "CONFIRMADA", nombre_reental: nombre, simbolo: "RPR" + i, primera_aparicion: "2024-03-01", refuerzos: ["nombre_csv"] };
      cache.transacciones.wallet_tokens.push(leg(i, 5 + i, [2024, 3, 1 + i]));
    });
    for (let d = Date.UTC(2024, 0, 1); d <= Date.UTC(2026, 11, 31); d += 864e5) cache.tipos_bce[new Date(d).toISOString().slice(0, 10)] = 1.1;
    state.cache = cache;
    const filas = ["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet"];
    let h = 0;
    for (const [y, m] of [[2024, 6], [2024, 12], [2025, 6], [2025, 12]]) {
      NOMBRES.forEach((nombre, i) => {
        const fecha = y + "-" + String(m).padStart(2, "0") + "-10";
        filas.push("\"" + nombre + "#" + y + "-" + m + "\"," + fecha + "," + (3 + i) + ",0," + (3 + i) + ",0,\"['0x" + String(++h).padStart(64, "0") + "']\",\"[]\"," + W);
      });
    }
    aplicarCsvTexto(filas.join("\n"), true);
    window.escribirArchivoNavegador = async () => {};
    ejecutarClasificacion({ silencioso: true });
    apuntarSincronizacion(state.cache, true, new Date("2026-05-20T12:00:00Z"));
    renderPanel(); actualizarChipEstado();
  });
  await esperar(500);
  // La hoja A4 apaisada con márgenes de 10 mm deja unos 1047 px: cada tabla tiene que caber entera.
  async function medirImpreso(vista) {
    await page.evaluate(v => { location.hash = "#" + v; }, vista);
    await esperar(300);
    await page.setViewport({ width: 1047, height: 1000 });
    await page.emulateMediaType("print");
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await esperar(200);
    await page.screenshot({ path: path.join(OUT, "cap_ui5_impreso_" + vista + ".png"), fullPage: true });
    const r = await page.evaluate(() => {
      const ancho = document.documentElement.clientWidth;
      const tablas = [...document.querySelectorAll(".view.active table")].filter(t => t.offsetParent);
      const cortadas = tablas.filter(t => {
        const ths = [...t.querySelectorAll("th")].filter(x => getComputedStyle(x).display !== "none");
        const fuera = ths.some(x => x.getBoundingClientRect().right > ancho + 1);
        let p = t.parentElement, recorta = false;
        for (; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll|hidden)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) recorta = true;
        }
        return fuera || recorta;
      }).map(t => (t.id || t.className) + " " + Math.round(t.scrollWidth) + "px");
      return { tablas: tablas.length, cortadas, columnas: tablas.map(t => t.querySelectorAll("th").length) };
    });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMediaType(null);
    await page.setViewport({ width: 1366, height: 900 });
    return r;
  }
  for (const vista of ["transacciones", "rendimientos", "fiscal"]) {
    const m = await medirImpreso(vista);
    assert("S9 -> A1: " + vista + " impreso en A4 apaisado: ninguna tabla cortada (" + m.tablas + " tablas)", m.tablas > 0 && m.cortadas.length === 0, m);
  }
  // A6: un repintado de 🧾 Fiscal en medio de la impresión, y dos avisos «antes» seguidos.
  await page.evaluate(() => { location.hash = "#fiscal"; document.body.classList.add("dark"); });
  await esperar(300);
  const abiertosAntes = await page.evaluate(() => document.querySelectorAll("#fiCuerpo details[open]").length);
  await page.evaluate(() => { window.dispatchEvent(new Event("beforeprint")); window.dispatchEvent(new Event("beforeprint")); renderPanel(); });
  await esperar(200);
  const enMedioA6 = await page.evaluate(() => document.querySelectorAll("#fiCuerpo details:not([open])").length);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await esperar(200);
  const a6 = await page.evaluate(() => ({ abiertos: document.querySelectorAll("#fiCuerpo details[open]").length,
    oscuro: document.body.classList.contains("dark") }));
  assert("S9 -> A6: repintado y dos «antes» en medio: después, lo mismo desplegado y en oscuro",
    enMedioA6 === 0 && a6.abiertos === abiertosAntes && a6.oscuro, { abiertosAntes, enMedioA6, a6 });
  await page.evaluate(() => document.body.classList.remove("dark"));

  // A12: la lista entera del Dashboard y los recuentos de 📒 Transacciones en el papel.
  await page.evaluate(() => { location.hash = "#dashboard"; });
  await esperar(300);
  const a12 = await page.evaluate(() => {
    const filas = () => document.querySelectorAll("#tarjetaMetricas .dash-rank").length;
    const antes = filas();
    window.dispatchEvent(new Event("beforeprint"));
    const durante = filas();
    window.dispatchEvent(new Event("afterprint"));
    return { antes, durante, despues: filas() };
  });
  assert("S9 -> A12: al imprimir el Dashboard salen los 7 inmuebles y después vuelven a 5",
    a12.antes === 5 && a12.durante === 7 && a12.despues === 5, a12);
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(300);
  await page.emulateMediaType("print");
  const kpis = await page.evaluate(() => [...document.querySelectorAll("#view-transacciones button.tx-kpi")].filter(b => getComputedStyle(b).display !== "none").length);
  await page.emulateMediaType(null);
  assert("S9 -> A12: los recuentos de 📒 Transacciones salen en el papel", kpis > 0, kpis);


  /* ============ S8) móvil y oscuro ============ */
  await page.setViewport({ width: 375, height: 800 });
  await esperar(200);
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.screenshot({ path: path.join(OUT, "cap_ui5_movil_oscuro.png"), fullPage: true });
  assert("S8 -> 375 px sin scroll de lado, en oscuro", ancho <= 375, ancho);
  assert("S8 -> 0 errores de consola", errores.length === 0, errores);

  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
