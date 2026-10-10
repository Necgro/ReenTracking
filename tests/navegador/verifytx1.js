/* Verificación headless del libro diario en 📒 Transacciones:
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS 100 %
 * SINTÉTICOS. Capturas cap_tx1_*.png en esta carpeta.
 *
 *  A) Sin clasificación: estado vacío honesto.
 *  B) Tras clasificar: tantas filas como state.registros; el triaje y
 *     los recuentos del selector de categoría cuadran (sin chips ni grupo
 *     de spam); enlace Polygonscan por fila.
 *  C) Filtros (select, «Ver spam», triaje) y búsqueda por hash; limpiar.
 *  D) «🔗» en la salida pendiente abre el buscador de js/15.
 *  E) «🔍 Mandar a revisar»: diálogo → ajuste {revisar:true, nota con
 *     marcador} escrito con el patrón js/13 (1 escritura vía handle),
 *     reclasifica, el registro aparece como pendiente en 🛠️ Revisión.
 *  F) «↩ Quitar de revisar»: borra ese ajuste y la clasificación vuelve
 *     EXACTA a la previa (huella JSON de state.registros).
 *  G) Routing de las 7 vistas intacto, modo oscuro y 0 errores de consola.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifytx1.js
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
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1600,1200"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });
  const consola = [];
  page.on("console", m => consola.push({ tipo: m.type(), texto: m.text(), url: (m.location() || {}).url || "" }));
  page.on("pageerror", e => consola.push({ tipo: "pageerror", texto: String(e && e.message || e), url: "" }));
  const errores = () => consola.filter(m =>
    (m.tipo === "error" || m.tipo === "pageerror") && !/favicon/i.test(m.url + " " + m.texto));

  function montarCache() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20);
    const T = "0x" + "77".repeat(20);
    const P1 = "0x" + "a1".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
    const tok6 = u => BigInt(Math.trunc(u * 1e6)).toString();
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0,
                     etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = {
      [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" },
    };
    const leg = (h, from, to, contrato, value, name, sym, dec, t, blk) => ({
      blockNumber: blk, timeStamp: t, hash: h, from, to, contractAddress: contrato,
      value, tokenName: name, tokenSymbol: sym, tokenDecimal: dec,
    });
    cache.transacciones.wallet_tokens.push(
      leg(Hh(1), W, T, P1, tok18(200), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 6, 14, 22), "100"),
      leg(Hh(2), T, W, USDT, tok6(3204), "Tether USD", "USDT", "6", ts(2026, 6, 19, 18), "102"),
      leg(Hh(3), T, W, USDC, tok6(400), "USD Coin", "USDC", "6", ts(2026, 6, 12, 10), "103"),
      leg(Hh(4), T, W, USDC, tok6(300), "USD Coin", "USDC", "6", ts(2025, 11, 14, 9), "104"),
      leg(Hh(5), T, W, "0x" + "5a".repeat(20), tok18(1000000), "Visit claim-reward.xyz", "SCAM", "18", ts(2026, 2, 1, 9), "105"));
    state.cache = cache;
  }
  function montarCsv() {
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + state.config.wallet;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
  }
  const filas = () => page.evaluate(() => document.querySelectorAll("#txCuerpo tr.tx-fila").length);

  /* ============ A) estado vacío ============ */
  console.log("A) Estado vacío");
  await page.goto(BASE + "index.html#transacciones", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  const vacio = await page.evaluate(() => document.querySelector("#txCuerpo .tx-vacio")?.textContent || "");
  // Sin botón «Clasificar transacciones»: el mensaje lleva a Puesta en marcha.
  assert("sin clasificar: mensaje honesto en la tabla", /Puesta en marcha/.test(vacio) && !/Clasificar transacciones/.test(vacio), vacio);
  assert("vista Transacciones activa por hash", await page.evaluate(() =>
    document.getElementById("view-transacciones").classList.contains("active")));

  /* ============ B) tras clasificar ============ */
  console.log("\nB) Libro diario tras clasificar");
  await page.evaluate(montarCache);
  await page.evaluate(montarCsv);
  await page.evaluate(() => {
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.parse(JSON.stringify(c))); };
  });
  await page.evaluate(() => ejecutarClasificacion());
  await esperar(500);
  const nReg = await page.evaluate(() => state.registros.length);
  assert("hay registros sintéticos clasificados", nReg >= 5, nReg);
  /* El spam está oculto por defecto. */
  const nVis = await page.evaluate(() => state.registros.filter(r => r.categoria !== "SPAM").length);
  assert("una fila por registro salvo el spam, oculto por defecto (" + nVis + " de " + nReg + ")", (await filas()) === nVis, await filas());
  const tri = await page.evaluate(() => ({
    kpis: [...document.querySelectorAll(".tx-kpi[data-grupo]")].map(b => +b.querySelector("b").textContent),
    /* El recuento va en cada opción del selector, «X (n)». */
    opciones: [...document.querySelectorAll("#txFiltroCategoria option")].filter(o => o.value).map(o => +(o.textContent.match(/\((\d+)\)$/) || [0, -1])[1]),
    rec: document.getElementById("txRecuento").textContent,
  }));
  const nSpamB = nReg - nVis;
  assert("triaje: 3 grupos (sin el de spam) que suman todo menos el spam", tri.kpis.length === 3 &&
    tri.kpis.reduce((a, b) => a + b, 0) === nVis, tri);
  assert("selector de categoría: cada opción con su número y suman el total", tri.opciones.every(n => n >= 0) &&
    tri.opciones.reduce((a, b) => a + b, 0) === nReg, tri);
  assert("recuento: «" + nVis + " movimientos» y «👁 Ver spam (" + nSpamB + ")»",
    tri.rec.startsWith(nVis + " movimientos") && tri.rec.includes("👁 Ver spam (" + nSpamB + ")"), tri.rec);
  const enlaces = await page.evaluate(() => document.querySelectorAll('#txCuerpo a[href^="https://polygonscan.com/tx/0x"]').length);
  assert("enlace Polygonscan en cada fila con hash", enlaces === nVis, enlaces);
  const orden = await page.evaluate(() => [...document.querySelectorAll("#txCuerpo .tx-fecha")].map(t => t.textContent));
  const iso = f => f.split("/").reverse().join("-"); // se ve dd/mm/aaaa
  assert("más recientes primero", orden.every((f, i) => i === 0 || iso(orden[i - 1]) >= iso(f)), orden);
  await page.screenshot({ path: path.join(OUT, "cap_tx1_libro.png"), fullPage: false });

  /* ============ C) filtros y búsqueda ============ */
  console.log("\nC) Filtros y búsqueda");
  await page.select("#txFiltroCategoria", "DEPOSITO");
  await esperar(200);
  const nDep = await page.evaluate(() => state.registros.filter(r => r.categoria === "DEPOSITO").length);
  assert("select categoría DEPOSITO → " + nDep + " filas", (await filas()) === nDep && nDep > 0);
  await page.select("#txFiltroEjercicio", "2025");
  await esperar(200);
  assert("+ ejercicio 2025 → 1 fila (cobro de nov-2025)", (await filas()) === 1, await filas());
  await page.click("#txLimpiar");
  await esperar(200);
  assert("limpiar → libro completo (sin el spam)", (await filas()) === nVis);
  await page.click("#txRecuento [data-ver-spam]");
  await esperar(200);
  const nSpam = await page.evaluate(() => state.registros.filter(r => r.categoria === "SPAM").length);
  assert("«👁 Ver spam» enseña solo el spam (" + nSpam + ") y pone «Spam» en el selector", (await filas()) === nSpam &&
    (await page.$eval("#txFiltroCategoria", s => s.value)) === "SPAM");
  await page.click("#txRecuento [data-salir-spam]");
  await esperar(200);
  await page.click('.tx-kpi[data-grupo="revisar"]');
  await esperar(200);
  const nRev = await page.evaluate(() => state.registros.filter(r => r.revisar || r.categoria === "REVISAR").length);
  assert("KPI «A revisar» filtra (" + nRev + ")", (await filas()) === nRev && nRev > 0);
  await page.click('.tx-kpi[data-grupo="revisar"]');
  await esperar(200);
  assert("pulsar otra vez el KPI quita el filtro", (await filas()) === nVis);
  await page.type("#txBuscar", "0x0003");
  await esperar(400);
  assert("búsqueda por hash parcial → 1 fila", (await filas()) === 1, await filas());
  assert("la búsqueda conserva el foco en el campo", await page.evaluate(() => document.activeElement.id === "txBuscar"));
  await page.click("#txLimpiar");
  await esperar(200);

  /* ============ D) 🔗 en la salida pendiente ============ */
  console.log("\nD) «🔗» abre el buscador de vínculos");
  const claveSalida = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    const s = state.registros.find(x => ccEsSalidaPendiente(x, ctx));
    return s ? s.clave : null;
  });
  assert("hay salida pendiente", !!claveSalida);
  const nBotones = await page.evaluate(() => document.querySelectorAll('#txCuerpo [data-accion="abrir-buscador"]').length);
  assert("exactamente 1 botón 🔗 (solo la salida pendiente)", nBotones === 1, nBotones);
  await page.click('#txCuerpo tr[data-clave="' + claveSalida + '"] [data-accion="abrir-buscador"]');
  await esperar(400);
  const dlg = await page.evaluate(() => ({ n: document.querySelectorAll(".cc-dlg-overlay").length,
    filas: document.querySelectorAll(".cc-dlg-item").length }));
  assert("se abre el buscador de js/15 con cobros", dlg.n === 1 && dlg.filas >= 1, dlg);
  await page.screenshot({ path: path.join(OUT, "cap_tx1_buscador.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await esperar(300);
  assert("Escape cierra el buscador sin escribir", await page.evaluate(() =>
    document.querySelectorAll(".cc-dlg-overlay").length === 0 && window.__writes.length === 0));

  /* ============ E) mandar a revisar ============ */
  console.log("\nE) «🔍 Mandar a revisar»");
  const huellaAntes = await page.evaluate(() => JSON.stringify(state.registros));
  const claveDep = await page.evaluate(() => state.registros.find(r => r.categoria === "DEPOSITO" && !r.revisar).clave);
  await page.click('#txCuerpo tr[data-clave="' + claveDep + '"] [data-accion="mandar-revisar"]');
  await esperar(300);
  assert("se abre el diálogo con el foco en el motivo", await page.evaluate(() =>
    !!document.querySelector(".tx-dlg-overlay") && document.activeElement.tagName === "TEXTAREA"));
  await page.screenshot({ path: path.join(OUT, "cap_tx1_dialogo.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await esperar(200);
  assert("Escape cancela sin escribir", await page.evaluate(() =>
    !document.querySelector(".tx-dlg-overlay") && window.__writes.length === 0 &&
    Object.keys(state.cache.ajustes_usuario).length === 0));
  await page.click('#txCuerpo tr[data-clave="' + claveDep + '"] [data-accion="mandar-revisar"]');
  await esperar(300);
  await page.type(".tx-dlg textarea", "Comprobar si es el pago de una venta");
  await page.click('.tx-dlg [data-accion="confirmar"]');
  await esperar(800);
  const tras = await page.evaluate(k => ({
    ajuste: state.cache.ajustes_usuario[k],
    writes: window.__writes.length,
    ultimaTieneAjuste: !!(window.__writes.at(-1) || {}).ajustes_usuario?.[k],
    reg: state.registros.find(r => r.clave === k),
  }), claveDep);
  assert("ajuste escrito: revisar:true + nota con marcador «por ti» y motivo",
    tras.ajuste && tras.ajuste.revisar === true &&
    /^Mandado a revisar por ti \(\d{4}-\d{2}-\d{2}\): Comprobar si es el pago de una venta$/.test(tras.ajuste.nota), tras.ajuste);
  assert("guardado con el patrón js/13 (1 escritura vía handle con el ajuste)",
    tras.writes === 1 && tras.ultimaTieneAjuste, tras.writes);
  assert("reclasificado: registro revisar=true, categoría intacta, nota añadida",
    tras.reg.revisar === true && tras.reg.categoria === "DEPOSITO" && tras.reg.nota.includes("Mandado a revisar por ti"), tras.reg);
  const fila = await page.evaluate(k => {
    const tr = document.querySelector('#txCuerpo tr[data-clave="' + k + '"]');
    return { rev: tr.classList.contains("tx-revisar"), quitar: !!tr.querySelector('[data-accion="quitar-revisar"]') };
  }, claveDep);
  assert("la fila pasa a «a revisar» con botón «↩ Quitar de revisar»", fila.rev && fila.quitar, fila);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);
  const enRevision = await page.evaluate(k => {
    const c = document.querySelector('#ccLista .cc-item[data-clave="' + k + '"]');
    return c ? { pend: c.classList.contains("pend"), motivo: c.querySelector(".cc-cat .cc-burbuja").textContent } : null; // la nota, en la ⓘ
  }, claveDep);
  assert("aparece en 🛠️ Revisión como pendiente con tu nota",
    enRevision && enRevision.pend && enRevision.motivo.includes("Comprobar si es el pago"), enRevision);
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(400);

  /* ============ F) quitar de revisar ============ */
  console.log("\nF) «↩ Quitar de revisar»");
  await page.click('#txCuerpo tr[data-clave="' + claveDep + '"] [data-accion="quitar-revisar"]');
  await esperar(800);
  const fin = await page.evaluate(() => ({
    ajustes: Object.keys(state.cache.ajustes_usuario).length,
    writes: window.__writes.length,
    huella: JSON.stringify(state.registros),
  }));
  assert("ajuste borrado y guardado (2ª escritura)", fin.ajustes === 0 && fin.writes === 2, fin.ajustes);
  assert("clasificación EXACTA a la previa (huella de state.registros)", fin.huella === huellaAntes);
  assert("vuelve el botón «🔍 Mandar a revisar»", await page.evaluate(k =>
    !!document.querySelector('#txCuerpo tr[data-clave="' + k + '"] [data-accion="mandar-revisar"]'), claveDep));
  assert("0 vínculos creados (TX-1 no toca pagos_diferidos)", await page.evaluate(() =>
    (state.cache.pagos_diferidos.ventas || []).length === 0));

  /* ============ G) routing, oscuro, consola ============ */
  console.log("\nG) Routing, oscuro y consola");
  const vistas = await page.evaluate(async () => {
    const ids = [...document.querySelectorAll("section.view")].map(s => s.id.replace("view-", ""));
    const res = [];
    for (const id of ids) {
      location.hash = "#" + id;
      await new Promise(r => setTimeout(r, 60));
      res.push(document.getElementById("view-" + id).classList.contains("active"));
    }
    return { n: ids.length, todas: res.every(Boolean) };
  });
  assert("8 vistas y todas enrutan (7 desde la Fase 7, +📖 Ayuda)", vistas.n === 8 && vistas.todas, vistas);
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(300);
  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(200);
  await page.screenshot({ path: path.join(OUT, "cap_tx1_oscuro.png"), fullPage: false });
  const oscuro = await page.evaluate(() => {
    const td = document.querySelector("#txCuerpo td");
    return { bg: getComputedStyle(document.querySelector(".tx-kpi")).backgroundColor,
             panel: getComputedStyle(document.querySelector("#view-transacciones .card")).backgroundColor,
             td: !!td };
  });
  assert("modo oscuro con tokens (panel oscuro)", /rgb\((1|2)\d, /.test(oscuro.panel), oscuro);
  await page.evaluate(() => document.body.classList.remove("dark"));
  /* móvil: sin scroll horizontal de página (la tabla scrollea en su caja) */
  await page.setViewport({ width: 390, height: 900 });
  await esperar(300);
  const movil = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert("a 390 px la página no desborda (la tabla scrollea en su contenedor)", movil);
  await page.screenshot({ path: path.join(OUT, "cap_tx1_movil.png"), fullPage: false });
  const errs = errores();
  assert("0 errores de consola", errs.length === 0, errs);

  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
