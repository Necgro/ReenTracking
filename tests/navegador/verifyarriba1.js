/* Arnés del desplazamiento al cambiar de pestaña: desde el menú lateral, la
 * pestaña se abre arriba del todo; un salto que no viene del menú (los botones
 * que llevan a una fila o un bloque) no toca el desplazamiento.
 *
 * También los enlaces de 📖 Ayuda (A1), «Saltar al
 * contenido» (A3), Ctrl+clic (A4), «Atrás» (A5) y los «ir» de 🚀 (A2).
 *
 * Sin datos (páginas alargadas con un hueco). Ejecución (servidor en 8765 y
 * NODE_PATH a puppeteer-core):  node tests/navegador/verifyarriba1.js
 */
"use strict";
const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const esperar = ms => new Promise(s => setTimeout(s, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  await page.goto(BASE + "index.html#dashboard", { waitUntil: "networkidle0" });
  /* Cada pestaña, más alta que la pantalla. */
  await page.evaluate(() => {
    for (const v of document.querySelectorAll(".view")) {
      const hueco = document.createElement("div");
      hueco.style.height = "3000px";
      v.appendChild(hueco);
    }
  });
  const bajar = y => page.evaluate(n => window.scrollTo({ top: n, behavior: "instant" }), y);
  const y = () => page.evaluate(() => Math.round(window.scrollY));

  await bajar(1500);
  assert("preparación: la pestaña está desplazada hacia abajo", (await y()) > 1000, await y());
  await page.click('#navPrincipal a[href="#transacciones"]');
  await esperar(300);
  assert("desde el menú, la pestaña nueva se abre arriba del todo",
    (await y()) === 0 && (await page.evaluate(() => location.hash)) === "#transacciones", await y());

  await bajar(1200);
  await page.click('#navPrincipal a[href="#transacciones"]');
  await esperar(300);
  assert("pulsar en el menú la pestaña en la que ya estás también la sube", (await y()) === 0, await y());

  await bajar(1200);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(300);
  assert("un salto que no viene del menú no toca el desplazamiento", (await y()) > 0, await y());

  /* Otros caminos: Ayuda, Ctrl+clic, «Atrás», «Saltar al contenido» y los «ir» de 🚀. */
  await page.evaluate(() => { location.hash = "#ayuda"; });
  await esperar(300);
  await bajar(1500);
  await page.click('#view-ayuda ul a[href="#transacciones"]');
  await esperar(300);
  assert("A1: un enlace de 📖 Ayuda también abre la pestaña arriba del todo",
    (await y()) === 0 && (await page.evaluate(() => location.hash)) === "#transacciones", await y());

  await bajar(1200);
  await page.keyboard.down("Control");
  await page.click('#navPrincipal a[href="#rendimientos"]');
  await page.keyboard.up("Control");
  await esperar(500);
  assert("A4: Ctrl+clic en el menú (otra pestaña del navegador) no mueve esta",
    (await y()) === 1200 && (await page.evaluate(() => location.hash)) === "#transacciones", await y());
  for (const p of await browser.pages()) if (p !== page) await p.close();

  await page.click('#navPrincipal a[href="#rendimientos"]');
  await esperar(300);
  await page.goBack();
  await esperar(500);
  assert("A5: «Atrás» tras el menú vuelve a la pestaña donde estabas",
    (await y()) === 1200 && (await page.evaluate(() => location.hash)) === "#transacciones", await y());

  await page.focus(".skip");
  await page.keyboard.press("Enter");
  await esperar(300);
  assert("A3: «Saltar al contenido» no cambia de pestaña",
    await page.evaluate(() => document.getElementById("view-transacciones").classList.contains("active") && location.hash === "#contenido"));

  /* Un «ir» de 🚀 (lo que falta, sin datos) lleva a su bloque, no arriba. */
  await page.evaluate(() => { location.hash = "#inicio"; });
  await esperar(300);
  await bajar(1500);
  await page.click('#arrFaltan a[data-ir="dzCsv"]');
  await esperar(900);
  const ir = await page.evaluate(() => ({ dz: Math.round(document.getElementById("dzCsv").getBoundingClientRect().top),
    barra: document.querySelector(".topbar").offsetHeight, y: Math.round(scrollY) }));
  assert("A2: un «ir» de 🚀 lleva a su bloque, justo debajo de la barra de arriba", ir.y > 0 && ir.dz === ir.barra, ir);

  assert("0 errores", errores.length === 0, errores);
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
