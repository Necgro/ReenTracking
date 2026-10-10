/* Arnés del menú lateral, los botones de icono y «🔄 Actualizar»:
 *  1) la barra lateral en dos grupos (ANÁLISIS: 📊 📒 💰 🧾 📤; SISTEMA: 🚀 🔍 📖)
 *     y el pie «Datos solo en este navegador», un enlace a 🚀 que la abre
 *     arriba del todo (como el menú); plegado, su burbuja lo dice;
 *  2) los botones de icono de 📒 y 💰 (.tx-ico), sin caja: solo el emoji con
 *     sombra; al pasar el ratón, verde pálido (la fila ya es gris; inactivo, nada);
 *     con nota, el amarillo de las notas; con la barra en iconos, una línea
 *     entre los dos grupos;
 *  3) «🔄 Actualizar» de 🚀, debajo del archivo de Reental, centrado y más grande.
 *
 * Sin datos. Ejecución (servidor en 8765 y NODE_PATH a puppeteer-core):
 *   node tests/navegador/verifymenu1.js
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

  console.log("== 1. Barra lateral (MENU-1) ==");
  const menu = await page.evaluate(() => [...document.querySelectorAll("#navPrincipal > *")]
    .map(e => e.classList.contains("nav-cap") ? e.textContent : e.getAttribute("href")));
  assert("dos grupos, en el orden pedido", JSON.stringify(menu) === JSON.stringify(
    ["Análisis", "#dashboard", "#transacciones", "#rendimientos", "#fiscal", "#exportar",
     "Sistema", "#inicio", "#revision", "#ayuda"]), menu);
  const pie = await page.evaluate(() => {
    const a = document.querySelector(".side-foot .privacy");
    return { tag: a.tagName, href: a.getAttribute("href"), texto: a.textContent.trim(), title: a.title,
      subrayado: getComputedStyle(a).textDecorationLine };
  });
  assert("el pie es un enlace a 🚀 con «Datos solo en este navegador»",
    pie.tag === "A" && pie.href === "#inicio" && pie.texto === "🔒 Datos solo en este navegador" &&
    pie.title === "Datos solo en este navegador" && pie.subrayado === "none", pie);
  await page.evaluate(() => {
    for (const v of document.querySelectorAll(".view")) {
      const hueco = document.createElement("div");
      hueco.style.height = "3000px";
      v.appendChild(hueco);
    }
    window.scrollTo({ top: 1500, behavior: "instant" });
  });
  await page.click(".side-foot .privacy");
  await esperar(300);
  const tras = await page.evaluate(() => ({ hash: location.hash, y: Math.round(scrollY),
    activa: document.querySelector("#navPrincipal a.active").getAttribute("href") }));
  assert("pulsarlo abre 🚀 arriba del todo y la marca en el menú", tras.hash === "#inicio" && tras.y === 0 && tras.activa === "#inicio", tras);
  await page.click("#btnPlegarNav");
  await esperar(200);
  const plegado = await page.evaluate(() => {
    const a = document.querySelector(".side-foot .privacy"), r = a.getBoundingClientRect();
    return { txt: getComputedStyle(a.querySelector(".txt")).display, ancho: Math.round(r.width) };
  });
  assert("plegado: solo el 🔒, que cabe en la barra", plegado.txt === "none" && plegado.ancho <= 60, plegado);
  await page.click("#btnPlegarNav");

  /* Con la barra en iconos, una línea entre los dos grupos. */
  await page.setViewport({ width: 1000, height: 768 });
  await esperar(200);
  const rail = await page.evaluate(() => [...document.querySelectorAll("#navPrincipal .nav-cap")]
    .map(c => getComputedStyle(c).display + " " + getComputedStyle(c).borderTopWidth));
  assert("A6: en iconos, sin títulos de grupo y una línea entre ANÁLISIS y SISTEMA", JSON.stringify(rail) === '["none 0px","block 1px"]', rail);
  await page.setViewport({ width: 1366, height: 768 });

  console.log("== 2. Botones de icono (ICONOS-1) ==");
  await page.goto(BASE + "index.html#transacciones", { waitUntil: "networkidle0" });
  /* En una fila de verdad del libro: la fila se pone gris al pasar el ratón. */
  const ico = await page.evaluate(() => {
    txInyectarEstilos();
    document.getElementById("txCuerpo").innerHTML = '<tr class="tx-fila"><td>x</td><td>' +
      txBotonIcono("✏️", "Añadir una nota", "", ' data-accion="nada"') +
      txBotonIcono("✏️", "Tu nota", "x", ' data-accion="nada"', "tx-con-nota") +
      txBotonIcono("🔍", "Ya tiene un ajuste", "", "", "", true) + "</td></tr>";
    const [b, n] = document.querySelectorAll("#txCuerpo button"), e = getComputedStyle(b), en = getComputedStyle(n);
    return { borde: e.borderTopColor, sombra: e.boxShadow, fondo: e.backgroundColor,
      filtro: getComputedStyle(b.firstElementChild).textShadow, nota: en.backgroundColor };
  });
  assert("sin caja: borde transparente, sin sombra de caja y sin fondo",
    ico.borde === "rgba(0, 0, 0, 0)" && ico.sombra === "none" && ico.fondo === "rgba(0, 0, 0, 0)", ico);
  assert("el emoji lleva sombra", /rgba/.test(ico.filtro), ico.filtro);
  const fondos = () => page.evaluate(() => {
    const [b, n, x] = document.querySelectorAll("#txCuerpo button");
    return { fila: getComputedStyle(document.querySelector("#txCuerpo tr")).backgroundColor, boton: getComputedStyle(b).backgroundColor,
      nota: getComputedStyle(n).backgroundColor, inactivo: getComputedStyle(x).backgroundColor,
      burbuja: getComputedStyle(b.querySelector(".tx-burbuja")).display, borde: getComputedStyle(b).borderTopColor };
  });
  await page.hover("#txCuerpo td");
  await esperar(250);
  const enFila = await fondos();
  assert("A4: con el ratón en la fila, el ✏️ con nota se distingue de la fila (amarillo de las notas)",
    enFila.fila !== "rgba(0, 0, 0, 0)" && enFila.nota !== enFila.fila && enFila.nota !== "rgba(0, 0, 0, 0)", enFila);
  await page.hover("#txCuerpo button[data-accion=nada]");
  await esperar(250);
  const enBoton = await fondos();
  assert("A4: al pasar el ratón por el botón: un fondo distinto del de la fila, sin borde, y su burbuja",
    enBoton.boton !== enBoton.fila && enBoton.boton !== "rgba(0, 0, 0, 0)" && enBoton.borde === "rgba(0, 0, 0, 0)" && enBoton.burbuja === "block", enBoton);
  await page.hover("#txCuerpo button[aria-disabled=true]");
  await esperar(250);
  assert("A5: un botón inactivo no se marca al pasar el ratón", (await fondos()).inactivo === "rgba(0, 0, 0, 0)", await fondos());

  console.log("== 3. «🔄 Actualizar» (ACTUALIZAR-1) ==");
  await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
  const act = await page.evaluate(() => {
    const b = document.getElementById("arrPreparar"), r = b.getBoundingClientRect();
    const dz = document.getElementById("dzCsv").getBoundingClientRect();
    const tarjeta = document.getElementById("arrTarjeta").getBoundingClientRect();
    return { centro: Math.round(r.left + r.width / 2 - (tarjeta.left + tarjeta.width / 2)), hueco: Math.round(r.top - dz.bottom),
      letra: getComputedStyle(b).fontSize, alto: Math.round(r.height) };
  });
  assert("centrado en la tarjeta", Math.abs(act.centro) <= 2, act);
  assert("separado del archivo de Reental (más de 40 px por debajo)", act.hueco > 40, act);
  assert("más grande (letra 17 px, alto ≥ 52 px)", act.letra === "17px" && act.alto >= 52, act);

  assert("0 errores", errores.length === 0, errores);
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
