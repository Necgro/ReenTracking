/* Verificación headless de 📊 Dashboard (rendimientos por mes o
 * por año con bocadillo, ranking de inmuebles y tu cartera por tokens):
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS 100 %
 * SINTÉTICOS: 7 inmuebles con repartos de 2024 a 2026 (uno reclamado con
 * retención y uno pendiente) y tokens comprados, vendidos y movidos entre tu
 * wallet y tu vault. Capturas cap_ui4_*.png.
 *
 *  D1) la pestaña se llama «Dashboard»; tarjetas en orden: Dinero invertido
 *      (la primera), Rendimientos, Inmuebles y Tu cartera.
 *  D2) por mes: una columna por mes entre el primero y el último (los meses
 *      sin repartos, a 0); por año: una por año; el total no cambia.
 *  D3) el bocadillo: mes, partes con su importe, la retención dentro de lo
 *      reclamado, «Repartido» y el nº de repartos; con el teclado (← →) y
 *      al salir se quita.
 *  D4) inmuebles: los 5 primeros por lo repartido y «Ver todos (7)».
 *  D5) cartera: tokens de cada inmueble (compras − ventas; wallet ↔ vault
 *      no cuenta), sin el que ya no tienes.
 *  D6) 375 px sin scroll horizontal de página, oscuro; 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyui4.js
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

  function montar() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), REENTAL = "0x" + "77".repeat(20), X = "0x" + "88".repeat(20);
    const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 10) / 1000));
    const tok18 = u => (BigInt(Math.round(u * 1e6)) * 10n ** 12n).toString();
    const NOMBRES = ["Prueba Cáceres 8", "Prueba Fondo 1", "Prueba Cáceres 7", "Prueba Carballo 1", "Prueba Coliving 1", "Prueba Sevilla 2", "Prueba Vendido 3"];
    const contrato = i => "0x" + ("a" + i).repeat(20);
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    let blk = 100, n = 0;
    const leg = (i, unidades, fecha, from, to) => ({ blockNumber: String(blk++), timeStamp: ts(...fecha), hash: "0x" + String(++n).padStart(4, "0") + "cd".repeat(30),
      from, to, contractAddress: contrato(i), value: tok18(unidades), tokenName: NOMBRES[i], tokenSymbol: "RPR" + i, tokenDecimal: "18" });
    NOMBRES.forEach((nombre, i) => {
      cache.catalogo_propiedades[contrato(i)] = { estado: "CONFIRMADA", nombre_reental: nombre, simbolo: "RPR" + i, primera_aparicion: "2024-03-01", refuerzos: ["nombre_csv"] };
      cache.transacciones.wallet_tokens.push(leg(i, i === 0 ? 6 : 10 + i * 5, [2024, 3, 1 + i], REENTAL, W));
    });
    // 4 tokens de Cáceres 8 a tu vault (no cambian el total) y Vendido 3 entero fuera.
    const alVault = leg(0, 4, [2025, 1, 5], W, V);
    cache.transacciones.wallet_tokens.push(alVault);
    cache.transacciones.vault_tokens.push(alVault);
    cache.transacciones.wallet_tokens.push(leg(6, 40, [2025, 6, 1], W, X));
    state.cache = cache;
    // Archivo de rendimientos: un reparto al mes por inmueble de mar-2024 a ago-2026, con un mes vacío (jul-2025).
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
    const filas = [cab];
    let h = 0;
    for (let y = 2024; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
      if ((y === 2024 && m < 3) || (y === 2026 && m > 8) || (y === 2025 && m === 7)) continue;
      NOMBRES.slice(0, 6).forEach((nombre, i) => {
        const importe = +(2 + i * 0.5 + (y - 2024) * 1.5).toFixed(2);
        const fecha = y + "-" + String(m).padStart(2, "0") + "-10";
        const reinvH = "0x" + String(++h).padStart(64, "0");
        if (y === 2026 && m === 8 && i === 0) filas.push("\"" + nombre + "#" + y + "-" + m + "\"," + fecha + ",0,0," + importe + ",0,\"[]\",\"[]\"," + W); // pendiente
        else if (y === 2026 && m === 6 && i === 1) filas.push("\"" + nombre + "#" + y + "-" + m + "\"," + fecha + ",0,8.1," + 10 + ",1.9,\"[]\",\"['" + reinvH + "']\"," + W); // reclamado con retención
        else filas.push("\"" + nombre + "#" + y + "-" + m + "\"," + fecha + "," + importe + ",0," + importe + ",0,\"['" + reinvH + "']\",\"[]\"," + W);
      });
    }
    const csv = cargarCsvRendimientos(filas.join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    window.escribirArchivoNavegador = async () => {};
  }

  await page.goto(BASE + "index.html#dashboard", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montar);
  await page.evaluate(() => { ejecutarClasificacion({ silencioso: true }); });
  await esperar(500);

  /* ============ D1) nombre y tarjetas ============ */
  const d1 = await page.evaluate(() => ({
    nav: document.querySelector('#navPrincipal a[href="#dashboard"]').textContent.trim(),
    h2: document.querySelector("#view-dashboard h2").textContent,
    tarjetas: [...document.querySelectorAll("#tarjetaMetricas .dash-card h3")].map(h => h.textContent),
  }));
  assert("D1 -> la pestaña se llama «Dashboard»", d1.nav === "📊 Dashboard" && d1.h2 === "📊 Dashboard", d1);
  assert("D1 -> tarjetas: Dinero invertido, Rendimientos, Inmuebles y Tu cartera",
    JSON.stringify(d1.tarjetas) === JSON.stringify(["💼 Dinero invertido", "💰 Rendimientos", "🏠 Inmuebles", "🧱 Tu cartera"]), d1.tarjetas);

  /* ============ D2) por mes y por año ============ */
  const graf = () => page.evaluate(() => {
    const c = document.querySelector(".dash-apiladas");
    return { cols: c.querySelectorAll(".dash-col").length, total: document.querySelector("#tarjetaMetricas .dash-value-lg").textContent,
             ejes: [...c.querySelectorAll(".dash-ax")].map(t => t.textContent).filter(t => /[a-z]/.test(t)),
             pulsado: document.querySelector(".dash-vista[aria-pressed=true]").textContent };
  });
  const mes = await graf();
  assert("D2 -> por mes: 30 columnas (mar-2024 a ago-2026, julio de 2025 a 0)", mes.cols === 30 && mes.pulsado === "Por mes", mes);
  assert("D2 -> el eje nombra el primero, cada enero y el último", JSON.stringify(mes.ejes) === JSON.stringify(["mar 24", "ene 25", "ene 26", "ago 26"]), mes.ejes);
  await page.screenshot({ path: path.join(OUT, "cap_ui4_mes.png") });
  await page.click('.dash-vista[data-vista="año"]');
  await esperar(150);
  const anio = await graf();
  assert("D2 -> por año: 3 columnas y el mismo total", anio.cols === 3 && anio.pulsado === "Por año" && anio.total === mes.total, anio);
  await page.click('.dash-vista[data-vista="mes"]');
  await esperar(150);

  /* ============ D3) bocadillo ============ */
  const bocadillo = () => page.evaluate(() => {
    const t = document.querySelector(".dash-apiladas .dash-tip");
    return { visible: !t.hidden, texto: t.innerText.replace(/\s+/g, " ").trim(),
             apagadas: document.querySelectorAll(".dash-apiladas .dash-col.apagada").length };
  });
  // jun-2026 es la columna 27 (mar-2024 = 0).
  await page.evaluate(() => document.querySelector(".dash-apiladas").scrollIntoView({ block: "center" }));
  await esperar(100);
  const zona = await page.evaluate(() => { const r = document.querySelectorAll(".dash-apiladas .dash-col-zona")[27].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height - 5 }; });
  await page.mouse.move(zona.x, zona.y);
  await esperar(150);
  const b1 = await bocadillo();
  assert("D3 -> al pasar el ratón: «jun 2026», lo reclamado con su retención dentro, lo reinvertido, «Repartido» y 6 repartos",
    b1.visible && /^jun 2026/.test(b1.texto) && /Reclamado 10,00 USD/.test(b1.texto) && /de ello, retención 1,90 USD/.test(b1.texto) &&
    /Reinvertido [\d.,]+ USD/.test(b1.texto) && /Repartido [\d.,]+ USD/.test(b1.texto) && /6 repartos/.test(b1.texto) && b1.apagadas === 29, b1);
  await page.screenshot({ path: path.join(OUT, "cap_ui4_bocadillo.png") });
  await page.mouse.move(5, 5);
  await esperar(100);
  assert("D3 -> al salir se quita", !(await bocadillo()).visible);
  await page.focus(".dash-apiladas");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await esperar(100);
  const b2 = await bocadillo();
  assert("D3 -> con el teclado (Fin, ←): «jul 2026»", b2.visible && /^jul 2026/.test(b2.texto), b2.texto);
  await page.keyboard.press("Escape");
  await esperar(100);
  const vacio = await page.evaluate(() => {
    const i = 16; // jul-2025, sin repartos
    const zonas = document.querySelectorAll(".dash-apiladas .dash-col-zona");
    zonas[i].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    return document.querySelector(".dash-apiladas .dash-tip").innerText.replace(/\s+/g, " ");
  });
  assert("D3 -> un mes sin repartos: «Repartido 0,00 USD · 0 repartos»", /jul 2025/.test(vacio) && /Repartido 0,00 USD/.test(vacio) && /0 repartos/.test(vacio), vacio);
  await page.mouse.move(5, 5);

  /* ============ D4) inmuebles ============ */
  const ranking = () => page.evaluate(() => [...document.querySelectorAll(".dash-rank .nm")].map(e => e.textContent));
  const r5 = await ranking();
  const verTodos = await page.evaluate(() => (document.querySelector(".dash-ver-todos") || {}).textContent);
  assert("D4 -> los 5 primeros por lo repartido, y «Ver todos (6)»", r5.length === 5 && r5[0] === "Prueba Sevilla 2" && verTodos === "Ver todos (6)", [r5, verTodos]);
  await page.click(".dash-ver-todos");
  await esperar(150);
  const r6 = await ranking();
  assert("D4 -> «Ver todos» enseña los 6 y luego «Ver menos»", r6.length === 6 &&
    await page.evaluate(() => document.querySelector(".dash-ver-todos").textContent === "Ver menos"), r6);
  await page.click(".dash-ver-todos");
  await esperar(150);

  /* ============ D5) cartera ============ */
  const cartera = await page.evaluate(() => [...document.querySelectorAll("#tarjetaMetricas .dash-card")]
    .find(c => /Tu cartera/.test(c.textContent)).querySelectorAll(".dash-leg"));
  const leyenda = await page.evaluate(() => [...[...document.querySelectorAll("#tarjetaMetricas .dash-card")]
    .find(c => /Tu cartera/.test(c.textContent)).querySelectorAll(".dash-leg")].map(l => l.innerText.replace(/\s+/g, " ")));
  assert("D5 -> 6 inmuebles (el vendido no sale), Cáceres 8 con sus 6 (los 4 del vault siguen siendo tuyos)",
    leyenda.length === 6 && leyenda.some(l => /^Prueba Cáceres 8 6,00/.test(l)) && !leyenda.some(l => /Vendido/.test(l)) &&
    /^Prueba Sevilla 2 35,00/.test(leyenda[0]), leyenda);
  const centro = await page.evaluate(() => [...[...document.querySelectorAll("#tarjetaMetricas .dash-card")]
    .find(c => /Tu cartera/.test(c.textContent)).querySelectorAll("svg text")].map(t => t.textContent));
  assert("D5 -> en el centro, 131 tokens", JSON.stringify(centro) === JSON.stringify(["131", "tokens"]), centro);
  await page.evaluate(() => document.querySelector(".dash-rank").scrollIntoView());
  await page.screenshot({ path: path.join(OUT, "cap_ui4_inmuebles.png") });

  /* ============ D7) foco, repintados y casos límite ============ */
  const enFoco = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.className || a.tagName) + "|" + (a.dataset.vista || a.textContent.slice(0, 12)) : ""; });
  // A19: Intro en «Por año» y en «Ver todos»: el foco sigue en el botón.
  await page.focus('.dash-vista[data-vista="año"]');
  await page.keyboard.press("Enter");
  await esperar(150);
  const f1 = await enFoco();
  await page.focus(".dash-ver-todos");
  await page.keyboard.press("Enter");
  await esperar(150);
  const f2 = await enFoco();
  assert("D7 -> A19: tras «Por año» y «Ver todos», el foco sigue en su botón", /dash-vista\|año/.test(f1) && /dash-ver-todos.*\|Ver menos/.test(f2), [f1, f2]);
  await page.keyboard.press("Enter"); // «Ver menos»
  await page.focus('.dash-vista[data-vista="mes"]');
  await page.keyboard.press("Enter");
  await esperar(150);
  // A20: un repintado con el foco en el gráfico y el bocadillo abierto los conserva.
  await page.focus(".dash-apiladas");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.evaluate(() => actualizarChipEstado());
  await esperar(150);
  const a20 = await page.evaluate(() => ({ foco: document.activeElement.classList.contains("dash-apiladas"),
    tip: document.querySelector(".dash-apiladas .dash-tip").hidden ? "" : document.querySelector(".dash-apiladas .dash-tip").innerText.slice(0, 8) }));
  await page.keyboard.press("ArrowLeft");
  await esperar(100);
  const a20b = await page.evaluate(() => document.querySelector(".dash-apiladas .dash-tip").innerText.slice(0, 8));
  assert("D7 -> A20: tras un repintado, el gráfico sigue con el foco y su bocadillo, y ← sigue", a20.foco && /jul 2026/.test(a20.tip) && /jun 2026/.test(a20b), [a20, a20b]);
  // A21: con el bocadillo abierto (teclado), estrechar la ventana no lo deja fuera.
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.querySelector(".dash-apiladas").scrollIntoView({ block: "center" }));
  await page.focus(".dash-apiladas");
  await page.keyboard.press("End");
  const antesA21 = await page.evaluate(() => document.querySelector(".dash-apiladas").dataset.sel);
  await page.setViewport({ width: 700, height: 900 });
  await esperar(250);
  const a21 = await page.evaluate(() => {
    const tip = document.querySelector(".dash-apiladas .dash-tip").getBoundingClientRect();
    const caja = document.querySelector(".dash-apiladas").getBoundingClientRect();
    return { dentro: tip.right <= caja.right + 1 && tip.left >= caja.left - 1, scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      tip: [tip.left, tip.right], caja: [caja.left, caja.right], w: window.innerWidth, sel: document.querySelector(".dash-apiladas").dataset.sel, hidden: document.querySelector(".dash-apiladas .dash-tip").hidden };
  });
  assert("D7 -> A21: al estrechar a 700 px el bocadillo se recoloca dentro y no hay scroll lateral", antesA21 === "29" && a21.dentro && !a21.scroll, [antesA21, a21]);
  await page.setViewport({ width: 1366, height: 900 });
  await esperar(150);
  await page.keyboard.press("Escape");

  // A22: «Ver todos» abierto y se carga otro archivo: vuelve a los 5 primeros.
  await page.click(".dash-ver-todos");
  await esperar(100);
  await page.evaluate(() => { state.filasCsv = state.filasCsv.slice(); renderDashboard(); });
  await esperar(100);
  const a22 = await page.evaluate(() => [document.querySelectorAll(".dash-rank").length, document.querySelector(".dash-ver-todos").textContent]);
  assert("D7 -> A22: con otro archivo, el ranking vuelve a los 5 primeros", a22[0] === 5 && a22[1] === "Ver todos (6)", a22);

  // A23: con las flechas, la zona «aria-live» dice el mes y sus cifras.
  await page.focus(".dash-apiladas");
  await page.keyboard.press("End");
  await esperar(80);
  const a23 = await page.evaluate(() => (document.querySelector("#tarjetaMetricas .solo-lector") || {}).textContent);
  assert("D7 -> A23: el lector de pantalla oye «ago 2026: … repartido … USD; 6 repartos.»", /^ago 2026: .*repartido [\d.,]+ USD; 6 repartos\.$/.test(a23 || ""), a23);
  await page.keyboard.press("Escape");

  // Hueco: el bocadillo en «Por año» (2026: lo de enero a agosto). Se centra
  // antes: con 💼 arriba, quedaría bajo la cabecera fija.
  await page.evaluate(() => document.querySelector('.dash-vista[data-vista="año"]').scrollIntoView({ block: "center" }));
  await page.click('.dash-vista[data-vista="año"]');
  await esperar(120);
  await page.evaluate(() => document.querySelectorAll(".dash-apiladas .dash-col-zona")[2].dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  const anioTip = await page.evaluate(() => document.querySelector(".dash-apiladas .dash-tip").innerText.replace(/\s+/g, " "));
  assert("D7 -> hueco: en «Por año», el bocadillo es del año (2026, 48 repartos)", /^2026 /.test(anioTip) && /48 repartos/.test(anioTip), anioTip);
  await page.mouse.move(1, 1);
  await page.click('.dash-vista[data-vista="mes"]');
  await esperar(120);
  // A2: mientras no hay clasificación (al arrancar) y la cache tiene ajustes, se avisa.
  await page.evaluate(() => { state.cache.ajustes_usuario = { "x": { nota: "x" } }; state.registros = null; renderDashboard(); });
  const a2 = await page.evaluate(() => document.querySelector("#tarjetaMetricas").innerText.includes("Aún sin tus decisiones de Revisión"));
  await page.evaluate(() => { state.cache.ajustes_usuario = {}; ejecutarClasificacion({ silencioso: true }); });
  const a2b = await page.evaluate(() => document.querySelector("#tarjetaMetricas").innerText.includes("Aún sin tus decisiones de Revisión"));
  assert("D7 -> A2: sin clasificar y con ajustes, el aviso; al clasificar, se va", a2 && !a2b, [a2, a2b]);
  // A10: si un bloque falla, ese sale «No disponible» y los demás se pintan.
  const a10 = await page.evaluate(() => {
    const orig = dashCarteraTokens;
    dashCarteraTokens = () => { throw new Error("prueba"); };
    const con = console.error; console.error = () => {};
    renderDashboard();
    console.error = con; dashCarteraTokens = orig;
    const tarjetas = [...document.querySelectorAll("#tarjetaMetricas .dash-card")].map(c => c.querySelector("h3").textContent + (c.querySelector(".dash-na-box") ? " NA" : ""));
    renderDashboard();
    return tarjetas;
  });
  assert("D7 -> A10: con la cartera rota, solo ella «No disponible»",
    // (💼 sale «No disponible» por sus datos, sin compras, no por la cartera rota)
    JSON.stringify(a10) === JSON.stringify(["💼 Dinero invertido NA", "💰 Rendimientos", "🏠 Inmuebles", "🧱 Tu cartera NA"]), a10);

  /* ============ D6) móvil, oscuro y errores ============ */
  await page.setViewport({ width: 375, height: 800 });
  await esperar(200);
  assert("D6 -> 375 px sin scroll horizontal de página", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: path.join(OUT, "cap_ui4_movil.png"), fullPage: true });
  await page.setViewport({ width: 1366, height: 900 });
  await page.click("#btnDark");
  await esperar(200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, "cap_ui4_oscuro.png") });
  await page.click("#btnDark");
  assert("D6 -> 0 errores en la consola", errores.length === 0, errores);

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> HAY FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
