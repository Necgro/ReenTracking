/* Verificación headless del bocadillo de los gráficos de 📊, con DATOS 100 %
 * SINTÉTICOS: sigue al ratón, en la línea de 💼 Dinero invertido y en las
 * barras de 💰 Rendimientos.
 *
 *  B1) Línea: centrado sobre el puntero y 12 px por encima; al subir o
 *      bajar el ratón dentro del mismo mes, se mueve con él.
 *  B2) Dentro del mismo mes solo se recoloca: el contenido no se rehace.
 *  B3) Si arriba no cabe (bajo la barra fija de la app), va 16 px por debajo.
 *  B4) Barras: lo mismo (con el puntero, y al pasar a otro mes cambia).
 *  B5) No se sale de la tarjeta por los lados (ratón en el último mes).
 *  B6) Con el teclado sigue anclado arriba de su columna (top 4 px).
 *  B7) 0 errores de consola.
 *  B8) por los ejes del gráfico (fuera de los meses) sigue al
 *      puntero con el mes que enseña; moverse dentro del mes no
 *      reescribe lo que oye el lector de pantalla; un evento fingido sin
 *      posición lo deja arriba de su columna, dentro de la tarjeta; tras el
 *      ratón, al cambiar la ventana vuelve arriba de su columna.
 *
 * (El bocadillo con el teclado, el lector de pantalla y uno solo a la vez,
 * verifysueltos1.js S1 y S5; el de las barras, verifyui4.js.)
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifybocadillo1.js
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

const W = "0x" + "1".repeat(40), TOKEN = "0x" + "ab".repeat(20);
const COMPRAS = [["c1", "2024-03-14 10:00:00", 450], ["c2", "2024-05-09 10:00:00", 76.5], ["c3", "2024-07-16 10:00:00", 104]];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });

  await page.goto(BASE + "index.html#dashboard", { waitUntil: "networkidle0" });
  await page.evaluate((W, TOKEN, compras) => {
    state.config = Object.assign({}, state.config, { wallet: W });
    state.cache = asegurarEstructuraCache({});
    state.registros = compras.map(([clave, fecha, importe]) => ({
      clave, hash: clave, categoria: "COMPRA", subcategoria: "COSTE_BASE", fuente: "ONCHAIN", contrato: TOKEN,
      fecha, via_compra: "ONCHAIN", importe_usdt: importe, inmueble: "Toledo 1", token: "POL", simbolo: "POL", cantidad: 1, nota: "",
    }));
    const csv = cargarCsvRendimientos(["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet",
      '"Prueba Cáceres 8 #11/2025",2025-11-30,"3,5",0,"3,5",0,"[\'0x' + "1".repeat(64) + '\']","[]",' + W,
      '"Prueba Cáceres 8 #12/2025",2025-12-31,"4,5",0,"4,5",0,"[\'0x' + "2".repeat(64) + '\']","[]",' + W].join("\n"));
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    renderDashboard();
  }, W, TOKEN, COMPRAS);
  await esperar(200);

  // La zona de un mes (en pantalla) y dónde está el bocadillo.
  const zona = (sel, i) => page.evaluate((sel, i) => {
    const r = document.querySelectorAll(sel + " .dash-col-zona")[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
  }, sel, i);
  const tip = sel => page.evaluate(sel => {
    const caja = document.querySelector(sel), t = caja.querySelector(".dash-tip");
    const r = t.getBoundingClientRect(), c = caja.getBoundingClientRect();
    return { hidden: t.hidden, texto: t.innerText.replace(/\s+/g, " "), left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      centro: r.left + r.width / 2, cajaL: c.left, cajaR: c.right, topEnCaja: r.top - c.top };
  }, sel);
  const cerca = (a, b) => Math.abs(a - b) <= 1.5;

  /* ============ B1, B2) Línea ============ */
  await page.evaluate(() => window.scrollTo(0, 0));
  let z = await zona(".dash-invertido", 1);
  const y1 = z.bottom - 20, y2 = z.bottom - 60;
  await page.mouse.move(z.x - 5, y1);
  await esperar(60);
  const a = await tip(".dash-invertido");
  await page.evaluate(() => { document.querySelector(".dash-invertido .dash-tip").firstChild.__marca = 1; });
  await page.mouse.move(z.x + 5, y2);
  await esperar(60);
  const b = await tip(".dash-invertido");
  const mismo = await page.evaluate(() => document.querySelector(".dash-invertido .dash-tip").firstChild.__marca === 1);
  assert("B1 -> línea: el bocadillo de abril, centrado sobre el puntero y 12 px por encima",
    !a.hidden && /^abr 2024/.test(a.texto) && cerca(a.centro, z.x - 5) && cerca(a.bottom, y1 - 12), { a, x: z.x - 5, y1 });
  assert("B1 -> al subir el ratón 40 px dentro del mes, sube con él (y va 10 px a la derecha)",
    cerca(b.bottom, y2 - 12) && cerca(b.centro - a.centro, 10), { a, b });
  assert("B2 -> dentro del mismo mes solo se recoloca (el contenido es el mismo)", mismo && b.texto === a.texto, b.texto);
  // Lo que oye el lector de pantalla: no se reescribe al moverse en el mes.
  await page.evaluate(() => {
    window.__cambiosLector = 0;
    new MutationObserver(m => { window.__cambiosLector += m.length; })
      .observe(document.querySelector(".dash-invertido").nextElementSibling, { childList: true, characterData: true, subtree: true });
  });
  for (const dy of [0, -15, -30]) { await page.mouse.move(z.x, y1 + dy); await esperar(30); }
  assert("B8 -> moverse dentro del mes no reescribe lo que oye el lector de pantalla",
    await page.evaluate(() => window.__cambiosLector === 0), await page.evaluate(() => window.__cambiosLector));
  // Por los rótulos del eje de abajo (dentro del gráfico, fuera de los meses).
  const yEje = z.bottom + 15;
  await page.mouse.move(z.x - 30, yEje);
  await esperar(60);
  const eje = await tip(".dash-invertido");
  assert("B8 -> A1: por los rótulos del eje de abajo sigue al puntero (12 px por encima), con abril",
    !eje.hidden && /^abr 2024/.test(eje.texto) && cerca(eje.bottom, yEje - 12) && cerca(eje.centro, z.x - 30), { eje, yEje });

  /* ============ B3) Arriba no cabe: debajo ============ */
  const barra = await page.evaluate(() => {
    const caja = document.querySelector(".dash-invertido");
    const barra = document.querySelector(".topbar").getBoundingClientRect().bottom;
    window.scrollBy(0, caja.getBoundingClientRect().top - barra - 10);
    return barra;
  });
  await esperar(60);
  z = await zona(".dash-invertido", 1);
  const y3 = z.top + 6;
  await page.mouse.move(z.x, y3);
  await esperar(60);
  const c = await tip(".dash-invertido");
  assert("B3 -> pegado a la barra de arriba no cabe encima: va 16 px por debajo del puntero",
    !c.hidden && cerca(c.top, y3 + 16) && c.top > barra, { c, y3, barra });
  await page.mouse.move(1, 1);
  await esperar(60);

  /* ============ B4, B5) Barras ============ */
  await page.evaluate(() => document.querySelector(".dash-apiladas").scrollIntoView({ block: "center" }));
  await esperar(60);
  z = await zona(".dash-apiladas", 0);
  const y4 = z.bottom - 30;
  await page.mouse.move(z.x + 3, y4);
  await esperar(60);
  const d = await tip(".dash-apiladas");
  assert("B4 -> barras: el bocadillo de nov 2025, 12 px por encima del puntero",
    !d.hidden && /^nov 2025/.test(d.texto) && cerca(d.bottom, y4 - 12), { d, y4 });
  const z2 = await zona(".dash-apiladas", 1);
  await page.mouse.move(z2.x + 200, y4 - 25);
  await esperar(60);
  const e = await tip(".dash-apiladas");
  assert("B4 -> al pasar al mes siguiente, cambia a dic 2025 y sigue con el puntero",
    /^dic 2025/.test(e.texto) && cerca(e.bottom, y4 - 25 - 12), e);
  assert("B5 -> ratón en el último mes, a la derecha: el bocadillo no se sale de la tarjeta",
    e.right <= e.cajaR + 1 && e.left >= e.cajaL - 1, e);
  await page.mouse.move(1, 1);
  await esperar(60);
  assert("B4 -> al salir, se va", (await tip(".dash-apiladas")).hidden);

  /* ============ B6) Teclado: arriba de su columna ============ */
  await page.focus(".dash-invertido");
  await page.keyboard.press("Home");
  await esperar(60);
  const f = await tip(".dash-invertido");
  assert("B6 -> con el teclado, arriba de su columna (top 4 px)", !f.hidden && /^mar 2024/.test(f.texto) && cerca(f.topEnCaja, 4), f);

  /* ============ B8) Fingido sin posición; ratón y luego otra ventana ============ */
  await page.keyboard.press("Escape");
  const fingido = await page.evaluate(() => {
    document.querySelectorAll(".dash-apiladas .dash-col-zona")[1].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const caja = document.querySelector(".dash-apiladas"), t = caja.querySelector(".dash-tip");
    const r = t.getBoundingClientRect(), c = caja.getBoundingClientRect();
    return { hidden: t.hidden, texto: t.innerText.slice(0, 8), top: r.top - c.top, dentro: r.left >= c.left - 1 && r.right <= c.right + 1 };
  });
  assert("B8 -> un evento fingido sin posición: arriba de su columna (top 4 px) y dentro de la tarjeta",
    !fingido.hidden && /^dic 2025/.test(fingido.texto) && cerca(fingido.top, 4) && fingido.dentro, fingido);
  await page.evaluate(() => dashMostrarBocadillo(document.querySelector(".dash-apiladas"), null));
  await page.evaluate(() => window.scrollTo(0, 0));
  z = await zona(".dash-invertido", 1);
  await page.mouse.move(z.x, z.bottom - 20);
  await esperar(60);
  await page.setViewport({ width: 1300, height: 1000 });
  await esperar(250);
  const ventana = await tip(".dash-invertido");
  await page.setViewport({ width: 1400, height: 1000 });
  assert("B8 -> tras el ratón, al cambiar la ventana vuelve arriba de su columna (top 4 px)",
    !ventana.hidden && cerca(ventana.topEnCaja, 4), ventana);

  assert("B7 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
