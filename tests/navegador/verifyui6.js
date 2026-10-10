/* Verificación headless de 💰 Rendimientos (un reparto del
 * archivo de Reental por fila, como la pestaña «Movimientos» de Reentax):
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS 100 %
 * SINTÉTICOS: 4 inmuebles con repartos de 2025 y 2026 (reinvertidos, uno
 * reclamado con retención, uno pendiente y uno reclamado en parte).
 * Capturas cap_ui6_*.png.
 *
 *  U1) sin archivo: la tabla lo dice y enlaza a Puesta en marcha.
 *  U2) con el archivo: una fila por reparto, 12 columnas, y las cifras de
 *      cada fila son las del archivo (íntegro, retención, reclamado,
 *      reinvertido y pendiente); el total es la suma; lo pendiente de
 *      reclamar, arriba.
 *  U3) filtros: ejercicio, estado (con su número), inmueble y búsqueda,
 *      con el recuento «X de N» y el total de lo que se ve; «Limpiar».
 *  U4) nota: el ✏️ abre el editor debajo, Intro guarda en
 *      notas_personales con la clave del rendimiento (la misma que en 📒
 *      Transacciones), Esc cancela, «Borrar» la quita y la cache vuelve a
 *      ser la de antes.
 *  U5) las reglas de la tabla de 📒: sin líneas verticales, cifras a la derecha,
 *      fechas y estado centrados, todo centrado en vertical; a 1366 px con
 *      el menú abierto la tabla cabe sin scroll.
 *  U6) 375 px sin scroll horizontal de página, oscuro; 0 errores.
 *  U7) ir y volver: el borrador sobrevive a una búsqueda, no
 *      pisa una nota guardada en Transacciones, se cierra con otra cache,
 *      el disco lento no roba el foco y el número de cada estado sigue a los
 *      demás filtros.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyui6.js
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

  function montarCache() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20);
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    state.cache = cacheVacia();
    window.escribirArchivoNavegador = async () => {};
  }
  function montarCsv() {
    const W = state.config.wallet;
    const NOMBRES = ["Prueba Cáceres 8", "Prueba Fondo 1", "Prueba Sevilla 2", "Prueba Carballo 1"];
    const filas = ["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet"];
    let h = 0;
    const hash = () => "0x" + String(++h).padStart(64, "0");
    for (const [y, m] of [[2025, 11], [2025, 12], [2026, 1], [2026, 2]]) {
      NOMBRES.forEach((nombre, i) => {
        const fecha = y + "-" + String(m).padStart(2, "0") + "-" + (m === 2 ? "28" : m === 11 ? "30" : "31");
        const imp = (3 + i + m / 10).toFixed(2).replace(".", ",");
        const div = "\"" + nombre + " #" + m + "/" + y + "\"";
        if (y === 2026 && m === 2 && i === 0) filas.push(div + "," + fecha + ",0,0,\"" + imp + "\",0,\"[]\",\"[]\"," + W);                 // pendiente
        else if (y === 2026 && m === 1 && i === 1) filas.push(div + "," + fecha + ",0,\"8,1\",10,\"1,9\",\"[]\",\"['" + hash() + "']\"," + W); // reclamado con retención
        else if (y === 2026 && m === 2 && i === 2) filas.push(div + "," + fecha + ",0,\"4,05\",10,\"0,95\",\"[]\",\"['" + hash() + "']\"," + W); // parcial
        else filas.push(div + "," + fecha + ",\"" + imp + "\",0,\"" + imp + "\",0,\"['" + hash() + "']\",\"[]\"," + W);
      });
    }
    const csv = cargarCsvRendimientos(filas.join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    ejecutarClasificacion({ silencioso: true });
  }

  await page.goto(BASE + "index.html#rendimientos", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montarCache);
  await page.evaluate(() => renderRendimientos());

  /* ============ U1) sin archivo ============ */
  const u1 = await page.evaluate(() => ({
    nav: document.querySelector('#navPrincipal a[href="#rendimientos"]').textContent.trim(),
    vacio: document.querySelector("#rdCuerpo").innerText.trim(),
    enlace: !!document.querySelector('#rdCuerpo a[href="#inicio"]'),
    recuento: document.querySelector("#rdRecuento").textContent,
  }));
  assert("U1 -> sin archivo: «Sin archivo de rendimientos…» con enlace a Puesta en marcha",
    u1.nav === "💰 Rendimientos" && /^Sin archivo de rendimientos/.test(u1.vacio) && u1.enlace && u1.recuento === "", u1);

  /* ============ U2) una fila por reparto, con las cifras del archivo ============ */
  await page.evaluate(montarCsv);
  await esperar(300);
  const u2 = await page.evaluate(() => {
    const leer = t => t === "–" ? 0 : Number(t.replace(/\./g, "").replace(",", "."));
    const filas = [...document.querySelectorAll("#rdCuerpo tr.rd-fila")].map(tr => {
      const td = [...tr.children].map(c => c.textContent.trim());
      return { clave: tr.dataset.clave, celdas: td.length, integro: leer(td[4]), ret: leer(td[5]), recl: leer(td[6]), reinv: leer(td[7]), pend: leer(td[8]), estado: (tr.querySelector(".rd-estado") || {}).textContent };
    });
    const claves = clavesRendimientosCsv(state.filasCsv);
    const porClave = new Map(state.filasCsv.map(f => [claves[f.linea_csv], f]));
    const mal = filas.filter(f => {
      const o = porClave.get(f.clave);
      const dos = x => Math.round(x * 100) / 100;
      return !o || f.celdas !== 12 || f.integro !== dos(o.distributed) || f.ret !== dos(o.retained) || f.recl !== dos(o.claimed) ||
        f.reinv !== dos(o.reinvested) || f.pend !== dos(Math.max(0, o.distributed - o.reinvested - o.claimed - o.retained));
    });
    const total = [...document.querySelectorAll("#rdTotal td")].map(c => c.textContent.trim());
    const suma = k => Math.round(filas.reduce((t, f) => t + f[k], 0) * 100) / 100;
    return { n: filas.length, mal, estados: filas.map(f => f.estado), total, sumaIntegro: suma("integro"), sumaPend: suma("pend"),
             pendiente: document.querySelector("#rdPendiente").textContent, pendVisible: !document.querySelector("#rdPendiente").hidden,
             recuento: document.querySelector("#rdRecuento").textContent, ths: document.querySelectorAll("#rdTabla thead th").length,
             primera: filas[0] && filas[0].clave };
  });
  assert("U2 -> 16 repartos, 12 columnas y cada cifra como su fila del archivo", u2.n === 16 && u2.ths === 12 && u2.mal.length === 0, u2.mal);
  assert("U2 -> los más recientes primero: febrero de 2026", /#2\/2026::2026-02-28$/.test(u2.primera), u2.primera);
  assert("U2 -> estados: 13 reinvertidos, 1 reclamado, 1 pendiente y 1 parcial",
    u2.estados.filter(e => e === "Reinvertido").length === 13 && u2.estados.filter(e => e === "Reclamado").length === 1 &&
    u2.estados.filter(e => e === "Pendiente").length === 1 && u2.estados.filter(e => e === "Parcial").length === 1, u2.estados);
  assert("U2 -> el total suma lo que se ve", u2.total[0] === "Total" &&
    Number(u2.total[1].replace(/\./g, "").replace(",", ".")) === u2.sumaIntegro, [u2.total, u2.sumaIntegro]);
  assert("U2 -> arriba, lo pendiente de reclamar: 8,20 USD en 2 repartos (el pendiente y la parte del parcial)",
    u2.pendVisible && u2.pendiente === "⏳ Pendiente de reclamar: 8,20 USD en 2 repartos." && u2.sumaPend === 8.2, u2.pendiente);
  assert("U2 -> recuento «16 repartos»", u2.recuento === "16 repartos", u2.recuento);
  await page.screenshot({ path: path.join(OUT, "cap_ui6_tabla.png") });

  /* ============ U3) filtros ============ */
  const estadoTabla = () => page.evaluate(() => ({
    n: document.querySelectorAll("#rdCuerpo tr.rd-fila").length,
    recuento: document.querySelector("#rdRecuento").textContent,
    total: (document.querySelector("#rdTotal td.num") || {}).textContent,
    vacio: (document.querySelector("#rdCuerpo .tx-vacio") || {}).textContent || "",
  }));
  const opciones = await page.evaluate(() => ({
    ej: [...document.querySelectorAll("#rdFiltroEjercicio option")].map(o => o.textContent),
    est: [...document.querySelectorAll("#rdFiltroEstado option")].map(o => o.textContent),
    inm: [...document.querySelectorAll("#rdFiltroInmueble option")].map(o => o.textContent),
  }));
  assert("U3 -> selectores: ejercicios 2026 y 2025, estados con su número, los 4 inmuebles",
    JSON.stringify(opciones.ej) === JSON.stringify(["Todos", "2026", "2025"]) &&
    JSON.stringify(opciones.est) === JSON.stringify(["Todos", "Reinvertido (13)", "Reclamado (1)", "Parcial (1)", "Pendiente (1)"]) &&
    opciones.inm.length === 5, opciones);
  await page.select("#rdFiltroEjercicio", "2025");
  const e1 = await estadoTabla();
  assert("U3 -> ejercicio 2025: «8 de 16 repartos»", e1.n === 8 && e1.recuento === "8 de 16 repartos", e1);
  await page.select("#rdFiltroEjercicio", "");
  await page.select("#rdFiltroEstado", "Parcial");
  const e2 = await estadoTabla();
  assert("U3 -> estado Parcial: 1 reparto, el total es el suyo (10,00)", e2.n === 1 && e2.total === "10,00", e2);
  await page.select("#rdFiltroEstado", "");
  await page.select("#rdFiltroInmueble", "prueba fondo 1");
  const e3 = await estadoTabla();
  assert("U3 -> inmueble Fondo 1: 4", e3.n === 4, e3);
  await page.select("#rdFiltroInmueble", "");
  await page.type("#rdBuscar", "sevilla 2 #2/2026");
  await esperar(300);
  const e4 = await estadoTabla();
  assert("U3 -> buscar «sevilla 2 #2/2026»: 1", e4.n === 1 && e4.recuento === "1 de 16 repartos", e4);
  await page.evaluate(() => { document.querySelector("#rdBuscar").value = "no existe"; document.querySelector("#rdBuscar").dispatchEvent(new Event("input")); });
  await esperar(300);
  const e5 = await estadoTabla();
  assert("U3 -> sin resultados: «Ningún reparto con estos filtros.» y sin total", e5.n === 0 && e5.vacio === "Ningún reparto con estos filtros." && e5.total === undefined, e5);
  await page.click("#rdLimpiar");
  await esperar(100);
  const e6 = await estadoTabla();
  assert("U3 -> «Limpiar filtros» vuelve a los 16", e6.n === 16 && e6.recuento === "16 repartos" &&
    await page.evaluate(() => document.querySelector("#rdBuscar").value === ""), e6);

  /* ============ U4) nota ============ */
  const antes = await page.evaluate(() => JSON.stringify(state.cache));
  const clave = u2.primera;
  const sel = '#rdCuerpo button[data-accion="nota"][data-clave="' + clave + '"]';
  await page.click(sel);
  await esperar(100);
  const ed = await page.evaluate(() => ({ abierto: !!document.querySelector("#rdCuerpo textarea.rd-nota-texto"), foco: document.activeElement && document.activeElement.className }));
  assert("U4 -> el ✏️ abre el editor debajo, con el foco dentro", ed.abierto && /rd-nota-texto/.test(ed.foco), ed);
  await page.keyboard.type("Reclamar en marzo");
  await page.keyboard.press("Escape");
  await esperar(100);
  assert("U4 -> Esc cancela sin guardar", await page.evaluate(a => JSON.stringify(state.cache) === a && !document.querySelector("#rdCuerpo textarea"), antes));
  await page.click(sel);
  await page.keyboard.type("Reclamar en marzo");
  await page.keyboard.press("Enter");
  await esperar(300);
  const g = await page.evaluate(c => ({
    guardada: ((state.cache.notas_personales || {})[c.toLowerCase()] || {}).texto,
    debajo: (document.querySelector("#rdCuerpo tr.rd-fila-nota .tx-notap-texto") || {}).textContent,
    registro: state.registros.some(r => r.clave === c && r.categoria === "RENDIMIENTO"),
    enTx: txTextoNota(state.cache.notas_personales, c),
  }), clave);
  assert("U4 -> Intro guarda la nota con la clave del rendimiento (la misma de 📒 Transacciones) y se ve debajo",
    g.guardada === "Reclamar en marzo" && g.debajo === "Reclamar en marzo" && g.registro && g.enTx === "Reclamar en marzo", g);
  await page.type("#rdBuscar", "en marzo");
  await esperar(300);
  assert("U4 -> la búsqueda encuentra la nota", (await estadoTabla()).n === 1);
  await page.click("#rdLimpiar");
  await page.click(sel);
  await esperar(100);
  await page.click('#rdCuerpo button[data-accion="nota-borrar"]');
  await esperar(300);
  const despues = await page.evaluate(() => {
    const c = JSON.parse(JSON.stringify(state.cache));
    if (c.notas_personales && !Object.keys(c.notas_personales).length) delete c.notas_personales;
    return JSON.stringify(c);
  });
  assert("U4 -> «Borrar» la quita: la cache vuelve a ser la de antes", despues === antes &&
    await page.evaluate(() => !document.querySelector("#rdCuerpo tr.rd-fila-nota")));

  /* ============ U7) ir y volver ============ */
  const editorTexto = () => page.evaluate(() => (document.querySelector("#rdCuerpo textarea.rd-nota-texto") || {}).value || null);
  // A2: el borrador sobrevive a una búsqueda que esconde su fila.
  await page.click(sel);
  await page.keyboard.type("Borrador a medias");
  await page.evaluate(() => { const b = document.querySelector("#rdBuscar"); b.value = "sevilla"; b.dispatchEvent(new Event("input")); });
  await esperar(300);
  const escondido = await editorTexto();
  await page.click("#rdLimpiar");
  await esperar(100);
  assert("A2 -> el borrador sobrevive a una búsqueda que esconde su fila", escondido === null && await editorTexto() === "Borrador a medias", [escondido, await editorTexto()]);
  // A3: si la nota se guardó en 📒 Transacciones mientras tanto, el borrador no la pisa.
  await page.evaluate(c => { state.cache.notas_personales = txNotasConTexto(state.cache.notas_personales, c, "Guardada en Transacciones", new Date().toISOString()); }, clave);
  await page.focus("#rdCuerpo textarea.rd-nota-texto");
  await page.keyboard.press("Enter");
  await esperar(300);
  const a3 = await page.evaluate(c => ({ nota: txTextoNota(state.cache.notas_personales, c), editor: !!document.querySelector("#rdCuerpo textarea.rd-nota-texto"),
    debajo: (document.querySelector("#rdCuerpo tr.rd-fila-nota .tx-notap-texto") || {}).textContent }), clave);
  assert("A3 -> la nota guardada en 📒 Transacciones no la pisa un borrador viejo: se cierra y se ve la de ahora",
    a3.nota === "Guardada en Transacciones" && !a3.editor && a3.debajo === "Guardada en Transacciones", a3);
  // A4: con otra cache abierta, el editor de la anterior se cierra (no escribe en la nueva).
  await page.click(sel);
  await page.keyboard.type(" y más");
  const a4 = await page.evaluate(() => {
    state.cache = JSON.parse(JSON.stringify(state.cache)); // otra cache, con las mismas notas
    renderRendimientos();
    return !!document.querySelector("#rdCuerpo textarea.rd-nota-texto");
  });
  assert("A4 -> al abrir otra cache, el editor de la anterior se cierra", a4 === false);
  // A5: guardar con el disco lento no quita el foco al editor que abras mientras tanto.
  const a5 = await page.evaluate(async c => {
    const lento = window.autoGuardarCache;
    window.autoGuardarCache = () => new Promise(r => setTimeout(r, 400));
    const filas = [...document.querySelectorAll("#rdCuerpo tr.rd-fila")].map(tr => tr.dataset.clave);
    const otra = filas.find(k => k !== c);
    rdNota.abrir(c);
    document.querySelector("#rdCuerpo textarea.rd-nota-texto").value = "Primera";
    const guardado = rdNota.guardar(false);
    rdNota.abrir(otra);
    const editor = document.querySelector("#rdCuerpo textarea.rd-nota-texto");
    editor.value = "do";
    await guardado;
    const r = { foco: document.activeElement === document.querySelector("#rdCuerpo textarea.rd-nota-texto"), clave: (rdNota.actual() || {}).clave === otra,
                primera: txTextoNota(state.cache.notas_personales, c) };
    rdNota.cerrar();
    window.autoGuardarCache = lento;
    return r;
  }, clave);
  assert("A5 -> guardar con el disco lento no quita el foco a la nota que abres mientras tanto", a5.foco && a5.clave && a5.primera === "Primera", a5);
  // A9: el número de cada estado sigue a los demás filtros.
  await page.select("#rdFiltroEjercicio", "2025");
  await esperar(100);
  const a9 = await page.evaluate(() => [...document.querySelectorAll("#rdFiltroEstado option")].map(o => o.textContent));
  assert("A9 -> con el ejercicio 2025, el selector de estado cuenta solo los de 2025",
    JSON.stringify(a9) === JSON.stringify(["Todos", "Reinvertido (8)", "Reclamado (0)", "Parcial (0)", "Pendiente (0)"]), a9);
  await page.click("#rdLimpiar");
  await esperar(100);

  /* ============ U5) reglas visuales de la tabla y anchura ============ */
  const u5 = await page.evaluate(() => {
    const tr = document.querySelector("#rdCuerpo tr.rd-fila");
    const cs = el => getComputedStyle(el);
    const celdas = [...tr.children];
    const caja = document.querySelector("#view-rendimientos .rd-tablawrap");
    return {
      verticales: celdas.some(c => parseFloat(cs(c).borderLeftWidth) > 0 || parseFloat(cs(c).borderRightWidth) > 0),
      medio: celdas.every(c => cs(c).verticalAlign === "middle"),
      cifras: celdas.slice(4, 9).every(c => cs(c).textAlign === "right"),
      centrados: [0, 1, 9, 11].every(i => cs(celdas[i]).textAlign === "center"),
      texto: [2, 3].every(i => /left|start/.test(cs(celdas[i]).textAlign)),
      cabe: caja.scrollWidth <= caja.clientWidth + 1,
      anchos: [caja.scrollWidth, caja.clientWidth],
    };
  });
  assert("U5 -> sin líneas verticales y todo centrado en vertical", !u5.verticales && u5.medio, u5);
  assert("U5 -> cifras a la derecha, texto a la izquierda, fechas, estado y ✏️ centrados", u5.cifras && u5.centrados && u5.texto, u5);
  assert("U5 -> a 1366 px con el menú abierto, la tabla cabe sin scroll", u5.cabe, u5.anchos);

  /* ============ U6) móvil, oscuro y errores ============ */
  await page.setViewport({ width: 375, height: 800 });
  await esperar(200);
  const movil = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert("U6 -> a 375 px sin scroll horizontal de página (la tabla scrollea en su caja)", movil);
  await page.screenshot({ path: path.join(OUT, "cap_ui6_movil.png") });
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluate(() => document.getElementById("btnDark").click());
  await esperar(200);
  const oscuro = await page.evaluate(() => document.body.classList.contains("dark") &&
    getComputedStyle(document.querySelector("#rdTabla")).color !== getComputedStyle(document.body).backgroundColor);
  assert("U6 -> modo oscuro", oscuro);
  await page.screenshot({ path: path.join(OUT, "cap_ui6_oscuro.png") });
  await page.evaluate(() => { document.getElementById("btnDark").click(); localStorage.removeItem("reental_dark"); });
  assert("U6 -> 0 errores de consola", errores.length === 0, errores);

  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
