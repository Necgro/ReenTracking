/* Verificación headless de la tarjeta del total de 💰, la búsqueda sin
 * tildes, las notas entre pestañas y 💼 Dinero invertido:
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS 100 %
 * SINTÉTICOS (los mismos repartos que verifyui6.js). Captura
 * cap_ui6b_tarjeta.png.
 *
 *  B1) la tarjeta del total, arriba, con las mismas cifras que la fila
 *      del total; cambia con los filtros y se esconde sin repartos.
 *  B2) «USD» en las cabeceras de los importes.
 *  B3) 📒 Transacciones: la búsqueda no distingue tildes («caceres»
 *      encuentra «Cáceres»).
 *  B4) 📒 Transacciones, con el editor de notas de las dos pestañas: si la
 *      nota se guardó en 💰 Rendimientos mientras escribías, no se pisa
 *      (A3); con el disco lento, guardar no quita el foco a la nota que
 *      abres mientras tanto (A5); con otra cache, el editor se cierra (A4).
 *  B6) la nota abierta en 📒 y cambiada en 💰 se guarda con lo
 *      añadido (A3); abrir otra nota con lo escrito escondido avisa (A4); si
 *      la fila deja de verse al guardar, el foco va a la búsqueda (A15); la
 *      tarjeta del total se esconde sin repartos.
 *  B5) 📊 Dashboard: «💼 Dinero invertido» en vez del saldo del vault y
 *      ningún importe en «USDT»; 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyui6b.js
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

  /* Los mismos datos que verifyui6.js: 4 inmuebles, repartos de 2025 y 2026. */
  function montar() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20);
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    state.cache = cacheVacia();
    window.escribirArchivoNavegador = async () => {};
    const NOMBRES = ["Prueba Cáceres 8", "Prueba Fondo 1", "Prueba Sevilla 2", "Prueba Carballo 1"];
    const filas = ["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet"];
    let h = 0;
    const hash = () => "0x" + String(++h).padStart(64, "0");
    for (const [y, m] of [[2025, 11], [2025, 12], [2026, 1], [2026, 2]]) {
      NOMBRES.forEach((nombre, i) => {
        const fecha = y + "-" + String(m).padStart(2, "0") + "-" + (m === 2 ? "28" : m === 11 ? "30" : "31");
        const imp = (3 + i + m / 10).toFixed(2).replace(".", ",");
        const div = "\"" + nombre + " #" + m + "/" + y + "\"";
        if (y === 2026 && m === 2 && i === 0) filas.push(div + "," + fecha + ",0,0,\"" + imp + "\",0,\"[]\",\"[]\"," + W);
        else if (y === 2026 && m === 1 && i === 1) filas.push(div + "," + fecha + ",0,\"8,1\",10,\"1,9\",\"[]\",\"['" + hash() + "']\"," + W);
        else if (y === 2026 && m === 2 && i === 2) filas.push(div + "," + fecha + ",0,\"4,05\",10,\"0,95\",\"[]\",\"['" + hash() + "']\"," + W);
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
  await page.evaluate(montar);
  await page.evaluate(() => renderRendimientos());
  await esperar(300);

  /* ============ B1) la tarjeta del total ============ */
  const tarjeta = () => page.evaluate(() => {
    const t = document.querySelector("#rdTarjetaTotal");
    const pie = [...document.querySelectorAll("#rdTotal td.num")].map(c => c.textContent.trim());
    return {
      visible: !t.hidden && t.getBoundingClientRect().height > 0,
      datos: [...t.querySelectorAll(".rd-tt-dato")].map(d => [d.querySelector(".rd-tt-k").textContent, d.querySelector(".rd-tt-v").textContent.replace(/\u00a0/g, " ")]),
      pie,
      letras: [...t.querySelectorAll(".rd-tt-v")].map(v => getComputedStyle(v).fontSize),
      anchos: [...t.querySelectorAll(".rd-tt-dato")].map(d => Math.round(d.getBoundingClientRect().width)),
      ancho: Math.round(t.getBoundingClientRect().width),
      antesDeTabla: !!(t.compareDocumentPosition(document.querySelector("#rdTabla")) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  const igualQuePie = x => JSON.stringify(x.datos.map(d => d[1].replace(" USD", ""))) ===
    JSON.stringify(x.pie.map(v => v === "–" ? "0,00" : v));
  const b1 = await tarjeta();
  assert("B1 -> la tarjeta, arriba y a la vista, con las 5 cifras de la fila del total, en USD",
    b1.visible && b1.antesDeTabla && b1.datos.length === 5 && igualQuePie(b1) &&
    JSON.stringify(b1.datos.map(d => d[0])) === JSON.stringify(["Íntegro", "Retención", "Reclamado (neto)", "Reinvertido", "Pendiente"]), b1);
  // Casillas iguales que llenan el ancho (como las de 🧾 Fiscal).
  assert("B1 -> casillas iguales, misma letra, que llenan el ancho", new Set(b1.letras).size === 1 &&
    Math.max(...b1.anchos) - Math.min(...b1.anchos) <= 2 && b1.anchos.reduce((a, b) => a + b, 0) + 10 * (b1.anchos.length - 1) >= b1.ancho - 5,
    [b1.letras, b1.anchos, b1.ancho]);
  await page.screenshot({ path: path.join(OUT, "cap_ui6b_tarjeta.png") });
  await page.select("#rdFiltroEjercicio", "2025");
  await esperar(100);
  const b1b = await tarjeta();
  assert("B1 -> cambia con los filtros (ejercicio 2025) y sigue igual que el total de abajo",
    b1b.visible && igualQuePie(b1b) && b1b.datos[0][1] !== b1.datos[0][1], [b1b.datos, b1b.pie]);
  await page.evaluate(() => { const b = document.querySelector("#rdBuscar"); b.value = "no existe"; b.dispatchEvent(new Event("input")); });
  await esperar(300);
  assert("B1 -> sin repartos a la vista, la tarjeta se esconde", !(await tarjeta()).visible);
  await page.click("#rdLimpiar");
  await esperar(100);

  /* ============ B2) «USD» en las cabeceras ============ */
  const cab = await page.evaluate(() => [...document.querySelectorAll("#rdTabla thead th.num")].map(th => th.textContent.trim()));
  assert("B2 -> «USD» en las 5 cabeceras de importes",
    JSON.stringify(cab) === JSON.stringify(["ÍntegroUSD", "RetenciónUSD", "ReclamadoUSD (neto)", "ReinvertidoUSD", "PendienteUSD"]), cab);

  /* ============ B3) Transacciones: búsqueda sin tildes ============ */
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(400);
  const buscarTx = async q => {
    await page.evaluate(v => { const b = document.querySelector("#txBuscar"); b.value = v; b.dispatchEvent(new Event("input")); }, q);
    await esperar(300);
    return page.evaluate(() => [...document.querySelectorAll("#txCuerpo tr[data-clave]")].filter(tr => !tr.className.includes("nota")).map(tr => tr.textContent));
  };
  const conTilde = await buscarTx("Cáceres");
  const sinTilde = await buscarTx("caceres");
  const mayus = await buscarTx("CACERES 8");
  assert("B3 -> «caceres» y «CACERES 8» encuentran lo mismo que «Cáceres»",
    conTilde.length > 0 && sinTilde.length === conTilde.length && mayus.length === conTilde.length &&
    sinTilde.every(t => t.includes("Cáceres")), [conTilde.length, sinTilde.length, mayus.length]);
  await page.click("#txLimpiar");
  await esperar(200);

  /* ============ B4) Transacciones: el editor de notas de las dos pestañas ============ */
  const claves = await page.evaluate(() => [...document.querySelectorAll('#txCuerpo button[data-accion="nota"]')].map(b => b.dataset.clave));
  const [c1, c2] = claves;
  const sel = c => '#txCuerpo button[data-accion="nota"][data-clave="' + c + '"]';
  const avisos = [];
  await page.exposeFunction("__aviso", (m, t) => avisos.push([m, t]));
  await page.evaluate(() => { const original = window.toast; window.toast = (m, t, ...r) => { window.__aviso(m, t); return original(m, t, ...r); }; });
  // A3
  await page.click(sel(c1));
  await page.keyboard.type("Escrita en Transacciones");
  await page.evaluate(c => { state.cache.notas_personales = txNotasConTexto(state.cache.notas_personales, c, "Guardada en Rendimientos", new Date().toISOString()); }, c1);
  await page.focus("#txCuerpo textarea.tx-nota-texto");
  await page.keyboard.press("Enter");
  await esperar(300);
  const a3 = await page.evaluate(c => ({ nota: txTextoNota(state.cache.notas_personales, c), editor: !!document.querySelector("#txCuerpo textarea.tx-nota-texto") }), c1);
  assert("B4 -> A3: la nota guardada en 💰 Rendimientos no la pisa un borrador viejo; se cierra y avisa",
    a3.nota === "Guardada en Rendimientos" && !a3.editor &&
    avisos.some(([m, t]) => m === "Esta nota cambió en 💰 Rendimientos mientras escribías: no se ha guardado." && t === "warn"), [a3, avisos]);
  // A5
  const a5 = await page.evaluate(async (c, otra) => {
    const lento = window.autoGuardarCache;
    window.autoGuardarCache = () => new Promise(r => setTimeout(r, 400));
    txNota.abrir(c);
    document.querySelector("#txCuerpo textarea.tx-nota-texto").value = "Primera";
    const guardado = txNota.guardar(false);
    txNota.abrir(otra);
    await guardado;
    const r = { foco: document.activeElement === document.querySelector("#txCuerpo textarea.tx-nota-texto"),
                clave: (txNota.actual() || {}).clave === otra, primera: txTextoNota(state.cache.notas_personales, c) };
    txNota.cerrar();
    window.autoGuardarCache = lento;
    return r;
  }, c1, c2);
  assert("B4 -> A5: guardar con el disco lento no quita el foco a la nota que abres mientras tanto", a5.foco && a5.clave && a5.primera === "Primera", a5);
  // A4
  await page.click(sel(c2));
  await page.keyboard.type("Sin guardar");
  const a4 = await page.evaluate(() => {
    state.cache = JSON.parse(JSON.stringify(state.cache)); // otra cache, con las mismas notas
    renderTransacciones();
    return { editor: !!document.querySelector("#txCuerpo textarea.tx-nota-texto"), abierta: txNota.actual() };
  });
  assert("B4 -> A4: al abrir otra cache, el editor de la anterior se cierra", !a4.editor && a4.abierta === null, a4);
  // La de Rendimientos sigue con su editor propio (no comparte la nota abierta).
  const separados = await page.evaluate(c => { txNota.abrir(c); const r = rdNota.actual(); txNota.cerrar(); return r; }, c1);
  assert("B4 -> cada pestaña con su editor: abrir una nota en Transacciones no la abre en Rendimientos", separados === null);

  /* ============ B6) la nota entre pestañas, lo escondido y el foco ============ */
  // A3: abro en 📒 sin escribir, la cambio en 💰, vuelvo a 📒 y añado: se guarda lo mío.
  avisos.length = 0;
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(300);
  await page.click(sel(c2));
  await page.evaluate(() => { location.hash = "#rendimientos"; });
  await esperar(300);
  await page.evaluate(c => { rdNota.abrir(c); document.querySelector("#rdCuerpo textarea.rd-nota-texto").value = "Desde Rendimientos"; }, c2);
  await page.evaluate(() => rdNota.guardar(false));
  await esperar(300);
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(300);
  const a3b = await page.evaluate(() => (document.querySelector("#txCuerpo textarea.tx-nota-texto") || {}).value);
  await page.focus("#txCuerpo textarea.tx-nota-texto");
  await page.keyboard.press("End");
  await page.keyboard.type(" y algo más");
  await page.keyboard.press("Enter");
  await esperar(300);
  const a3c = await page.evaluate(c => txTextoNota(state.cache.notas_personales, c), c2);
  assert("B6 -> A3: lo que añades a la nota que ya enseña el editor se guarda, sin falso aviso",
    a3b === "Desde Rendimientos" && a3c === "Desde Rendimientos y algo más" && !avisos.some(([m]) => /cambió en/.test(m)), [a3b, a3c, avisos]);
  // A4: lo escrito en una nota que un filtro esconde no se pierde en silencio al abrir otra.
  await page.evaluate(() => { location.hash = "#rendimientos"; });
  await esperar(300);
  avisos.length = 0;
  const filasRd = await page.evaluate(() => [...document.querySelectorAll("#rdCuerpo tr.rd-fila")].map(tr => tr.dataset.clave));
  const de2026 = filasRd[0], de2025 = filasRd[filasRd.length - 1];
  await page.click('#rdCuerpo button[data-accion="nota"][data-clave="' + de2026 + '"]');
  await page.keyboard.type("Texto que no quiero perder");
  await page.select("#rdFiltroEjercicio", "2025");
  await esperar(150);
  // Con evaluate: un aviso de antes puede tapar el botón en la esquina.
  await page.evaluate(c => document.querySelector('#rdCuerpo button[data-accion="nota"][data-clave="' + c + '"]').click(), de2025);
  await esperar(150);
  assert("B6 -> A4: abrir otra nota con lo escrito escondido lo avisa", avisos.some(([m, t]) => m === "Se ha descartado la nota que escribías." && t === "warn"), avisos);
  await page.keyboard.press("Escape");
  await page.click("#rdLimpiar");
  await esperar(150);
  // A15: guardar una nota que era lo único que casaba con la búsqueda: el foco va a la búsqueda.
  await page.evaluate(c => { state.cache.notas_personales = txNotasConTexto(state.cache.notas_personales, c, "zzqunica", new Date().toISOString()); renderRendimientos(); }, de2025);
  await page.type("#rdBuscar", "zzqunica");
  await esperar(300);
  await page.click('#rdCuerpo button[data-accion="nota"][data-clave="' + de2025 + '"]');
  await page.evaluate(() => { const t = document.querySelector("#rdCuerpo textarea.rd-nota-texto"); t.value = "cambiada"; t.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.focus("#rdCuerpo textarea.rd-nota-texto");
  await page.keyboard.press("Enter");
  await esperar(300);
  assert("B6 -> A15: si la fila deja de verse al guardar, el foco va a la búsqueda", await page.evaluate(() => document.activeElement && document.activeElement.id === "rdBuscar"));
  await page.click("#rdLimpiar");
  // La tarjeta del total se esconde también sin repartos (todos fuera por tus decisiones).
  const sinRepartos = await page.evaluate(() => {
    const regs = state.registros;
    state.registros = regs.map(r => r.categoria === "RENDIMIENTO" ? Object.assign({}, r, { categoria: "MOVIMIENTO" }) : r);
    renderRendimientos();
    const oculta = document.querySelector("#rdTarjetaTotal").hidden;
    state.registros = regs;
    renderRendimientos();
    return { oculta, vuelve: !document.querySelector("#rdTarjetaTotal").hidden };
  });
  assert("B6 -> la tarjeta del total se esconde sin repartos y vuelve con ellos", sinRepartos.oculta && sinRepartos.vuelve, sinRepartos);

  /* ============ B5) Dashboard ============ */
  await page.evaluate(() => { location.hash = "#dashboard"; });
  await esperar(400);
  const b5 = await page.evaluate(() => {
    const cont = document.querySelector("#tarjetaMetricas");
    return { tarjetas: [...cont.querySelectorAll(".dash-card h3")].map(h => h.textContent),
             usdt: /USDT/.test(cont.textContent.replace(/movimientos? USDT/g, "")),
             invertido: ((cont.querySelector(".dash-card") || {}).textContent || "") };
  });
  assert("B5 -> «💼 Dinero invertido» en vez de «🏦 Saldo del vault»",
    b5.tarjetas[0] === "💼 Dinero invertido" && !b5.tarjetas.includes("🏦 Saldo del vault") &&
    /Sin compras de inmuebles con importe\./.test(b5.invertido), b5);
  assert("B5 -> ningún importe del Dashboard en «USDT»", !b5.usdt);
  assert("B5 -> 0 errores de consola", errores.length === 0, errores);

  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
