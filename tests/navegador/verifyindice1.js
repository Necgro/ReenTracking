/* Arnés del índice de 🔍 Revisión (P1 y P5): la fila de botones bajo el
 * título se queda fija debajo de la barra de arriba al bajar; va en el orden
 * de los bloques de la página (① inmuebles, ② direcciones, ③ por decidir,
 * ④ coste, RNT, POL y ya decididos); copia los números y ⚠ de cada título al
 * cambiar; al pulsar, baja al bloque (sin quedar debajo del índice) y lo abre.
 *
 * Sin datos (relleno solo en pantalla). Ejecución (servidor en 8765 y
 * NODE_PATH a puppeteer-core):  node tests/navegador/verifyindice1.js
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
  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await esperar(300);

  const orden = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("#ccIndice [data-ir]")].map(b => b.dataset.ir);
    const enPagina = ids.every((id, i) => !i || (document.getElementById(ids[i - 1]).compareDocumentPosition(document.getElementById(id)) & Node.DOCUMENT_POSITION_FOLLOWING));
    return { ids, enPagina, textos: [...document.querySelectorAll("#ccIndice [data-ir]")].map(b => b.textContent) };
  });
  assert("7 botones: inmuebles, direcciones, por decidir, coste, RNT, POL y ya decididos",
    orden.ids.join() === "rvCatalogo,rvContratos,ccLista,cbCoste,rvPreciosRnt,rvPreciosPol,ccResueltos", orden.ids);
  assert("los bloques de la página van en ese mismo orden", orden.enPagina);
  assert("sin datos: «③ Por decidir (0)», «④ 💶 Coste (0)», «✅ Ya decididos (0)» y sin ⚠",
    orden.textos[2] === "③ Por decidir (0)" && orden.textos[3] === "④ 💶 Coste (0)" && orden.textos[6] === "✅ Ya decididos (0)" &&
    !orden.textos.join("").includes("⚠"), orden.textos);

  /* Los títulos cambian (como al pintarlos js/11, 15 y 20): el índice los sigue. */
  const copia = await page.evaluate(async () => {
    const $ = id => document.getElementById(id);
    $("cbCount").textContent = "3";
    $("ccNavRevision").textContent = "1.234";
    $("ccResueltosCount").textContent = "7";
    $("rvCatalogoAviso").textContent = "⚠ 2 con dudas";
    $("rvPreciosPolAviso").textContent = "⚠ 1 sin precio";
    await new Promise(r => setTimeout(r, 50));
    const b = [...document.querySelectorAll("#ccIndice [data-ir]")];
    const antes = b.map(x => x.textContent), titulo = b[0].title;
    $("rvCatalogoAviso").textContent = "";
    await new Promise(r => setTimeout(r, 50));
    return { antes, titulo, polTitulo: b[5].title, despues: b[0].textContent, tituloDespues: b[0].title };
  });
  assert("copia los números al cambiar (también con punto de miles)",
    copia.antes[2] === "③ Por decidir (1.234)" && copia.antes[3] === "④ 💶 Coste (3)" && copia.antes[6] === "✅ Ya decididos (7)", copia.antes);
  assert("un ⚠ con el aviso al pasar el ratón; sin aviso, sin ⚠",
    copia.antes[0] === "① 🏠 Inmuebles⚠" && copia.titulo === "2 con dudas" && copia.antes[5] === "⛽ POL⚠" &&
    copia.polTitulo === "1 sin precio" && copia.despues === "① 🏠 Inmuebles" && copia.tituloDespues === "", copia);

  /* Relleno para poder bajar, y bajar: el índice, justo debajo de la barra. */
  await page.evaluate(() => {
    document.getElementById("ccLista").insertAdjacentHTML("beforeend", '<div id="relleno" style="height:3000px"></div>');
    window.scrollTo({ top: 1500, behavior: "instant" });
  });
  await esperar(300);
  const fija = await page.evaluate(() => ({
    indice: Math.round(document.getElementById("ccIndice").getBoundingClientRect().top),
    barra: document.querySelector(".topbar").offsetHeight,
    deLado: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  assert("al bajar, el índice se queda justo debajo de la barra de arriba", fija.indice === fija.barra && fija.barra > 0, fija);
  assert("a 1366 px la página no desplaza de lado", !fija.deLado, fija);

  /* Pulsar: baja (o sube) al bloque, lo abre y no lo tapa el índice. */
  for (const id of ["rvPreciosRnt", "rvCatalogo", "ccLista", "ccResueltos"]) {
    await page.evaluate(id => {
      const d = document.getElementById(id);
      if (d.tagName === "DETAILS") d.open = false;
      document.querySelector('#ccIndice [data-ir="' + id + '"]').click();
    }, id);
    await esperar(900); // scroll suave
    const m = await page.evaluate(id => {
      const el = document.getElementById(id);
      const ind = document.getElementById("ccIndice").getBoundingClientRect();
      return { abierto: el.tagName !== "DETAILS" || el.open, top: Math.round(el.getBoundingClientRect().top), bajoIndice: Math.round(ind.bottom),
        hash: location.hash };
    }, id);
    const alFinal = await page.evaluate(() => Math.ceil(window.scrollY + innerHeight) >= document.documentElement.scrollHeight);
    assert(id + ": abierto, a la vista y no debajo del índice", m.abierto && m.top >= m.bajoIndice && (m.top <= m.bajoIndice + 20 || alFinal) &&
      m.hash === "#revision", m);
  }

  /* A4: «Ir al catálogo» de 🚀 tampoco deja el título bajo el índice. */
  const desde19 = await page.evaluate(async () => {
    document.getElementById("rvCatalogo").open = false;
    window.scrollTo({ top: 2500, behavior: "instant" });
    arrIrAlCatalogo();
    await new Promise(r => setTimeout(r, 1200));
    const el = document.getElementById("rvCatalogo");
    return { abierto: el.open, top: Math.round(el.getBoundingClientRect().top),
      bajoIndice: Math.round(document.getElementById("ccIndice").getBoundingClientRect().bottom) };
  });
  assert("A4: «Ir al catálogo» de 🚀 lo abre y el índice no tapa su título", desde19.abierto && desde19.top >= desde19.bajoIndice, desde19);

  /* P5: el aviso de los tokens con dudas lleva al catálogo. */
  const aviso = await page.evaluate(async () => {
    document.getElementById("rvCatalogo").open = false;
    document.getElementById("ccLista").insertAdjacentHTML("afterbegin",
      '<div class="cc-cab cc-dudas">Primero <a href="#revision" data-ir="rvCatalogo">confirma los 2 tokens con dudas</a>: cambian muchos de estos movimientos.</div>');
    window.scrollTo({ top: 2500, behavior: "instant" });
    document.querySelector(".cc-dudas a").click();
    await new Promise(r => setTimeout(r, 900));
    return { abierto: document.getElementById("rvCatalogo").open, hash: location.hash };
  });
  assert("P5: el enlace del aviso abre el catálogo sin cambiar de pestaña", aviso.abierto && aviso.hash === "#revision", aviso);

  assert("0 errores", errores.length === 0, errores);
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
