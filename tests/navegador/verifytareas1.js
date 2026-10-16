/* Arnés de 🔍 Revisión como lista de tareas (P21; antes, el índice fijo de
 * P1). Una caja con una fila por bloque, en el orden en que conviene
 * resolver (① inmuebles, ② direcciones, ③ por decidir, ④ coste, RNT y POL),
 * cada una con su estado a la derecha: «Al día» en verde, el aviso en ámbar
 * y «N por decidir» en rojo (fila abierta). Cerrada, la caja es estrecha;
 * con una fila abierta, ancha. «Ya decididos» y «Ajustes en JSON», enlaces
 * debajo. El aviso de tokens con dudas va arriba del todo de «Por decidir».
 * Al salir de 🔍 (y al recargar) todo queda plegado.
 *
 * Sin datos (relleno solo en pantalla). Ejecución (servidor en 8765 y
 * NODE_PATH a puppeteer-core):  node tests/navegador/verifytareas1.js
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

  /* El estado que se ve de cada fila: el texto de su aviso o, vacío y a la
     vista, «Al día» (lo pone el CSS). */
  const filas = () => page.evaluate(() => [...document.querySelectorAll(".rv-tareas>details")].map(d => {
    const a = d.querySelector(":scope>summary>.rv-aviso");
    const visto = a && getComputedStyle(a).display !== "none";
    return { id: d.id, num: (d.querySelector(".rv-num") || {}).dataset.n,
      estado: !visto ? "" : a.textContent || getComputedStyle(a, "::before").content.replace(/"/g, ""),
      rojo: d.classList.contains("rv-rojo"), abierta: d.open };
  }));

  const f0 = await filas();
  assert("6 filas en orden: inmuebles, direcciones, por decidir, coste, RNT y POL (① a ④; RNT y POL sin número)",
    f0.map(f => f.id).join() === "rvCatalogo,rvContratos,ccPorDecidir,cbCoste,rvPreciosRnt,rvPreciosPol" &&
    f0.map(f => f.num).join() === "1,2,3,4,,", f0);
  assert("sin movimientos: ninguna fila dice «Al día» ni va en rojo", f0.every(f => f.estado === "" && !f.rojo), f0);
  const enlaces = await page.evaluate(() => [...document.querySelectorAll(".rv-enlaces>details")].map(d => d.id).join());
  assert("«Ya decididos» y «Ajustes en JSON», debajo, como enlaces", enlaces === "ccResueltos,rvAjustes", enlaces);
  assert("sin el índice fijo de antes", await page.evaluate(() => !document.getElementById("ccIndice")));

  /* Con un movimiento por decidir, una compra bancaria sin coste y tokens con
     dudas (como al pintarlos js/11, 15 y 20). */
  const sembrar = (dudas, porDecidir) => page.evaluate(async (dudas, porDecidir) => {
    const cat = {};
    for (let i = 0; i < 3; i++) cat["0x" + String(i + 1).repeat(40)] = { estado: i < dudas ? "CANDIDATA" : "CONFIRMADA" };
    state.config = Object.assign({}, state.config, { wallet: "0x" + "9".repeat(40) });
    state.cache = { catalogo_propiedades: cat, transacciones: {}, ajustes_usuario: {} };
    state.registros = [{ clave: "0x" + "ef".repeat(32) + "::0x" + "11".repeat(20), hash: "0x" + "ef".repeat(32), contrato: "0x" + "11".repeat(20),
      fecha: "2026-03-01 10:00:00", categoria: "COMPRA", via_compra: "BANCARIA", cantidad: 2, simbolo: "AAA", inmueble: "Uno", fuente: "ONCHAIN" }];
    if (porDecidir) state.registros.push({ clave: "0x" + "ab".repeat(32) + "::0x" + "cd".repeat(20), hash: "0x" + "ab".repeat(32), contrato: "0x" + "cd".repeat(20),
      fecha: "2026-05-12 09:45:46", categoria: "REVISAR", subcategoria: "", revisar: true, cantidad: 1, simbolo: "XYZ", fuente: "ONCHAIN" });
    document.getElementById("rvCatalogoAviso").textContent = dudas ? "⚠ " + dudas + " con dudas" : "";
    renderCosteCompras();
    renderCorrecciones();
    await new Promise(r => setTimeout(r, 50));
  }, dudas, porDecidir);

  await sembrar(2, true);
  const f1 = await filas();
  const por = f1.find(f => f.id === "ccPorDecidir");
  assert("«Por decidir»: «1 por decidir», en rojo y abierta", por.estado === "1 por decidir" && por.rojo && por.abierta, por);
  assert("el número del menú es el mismo", await page.evaluate(() => document.getElementById("ccNavRevision").textContent) === "1");
  assert("inmuebles: el aviso en ámbar; direcciones, RNT y POL: «Al día»; coste: «⚠ 1 sin coste»",
    f1[0].estado === "⚠ 2 con dudas" && ["rvContratos", "rvPreciosRnt", "rvPreciosPol"].every(id => f1.find(f => f.id === id).estado === "Al día") &&
    f1.find(f => f.id === "cbCoste").estado === "⚠ 1 sin coste", f1);
  const colores = await page.evaluate(() => {
    const c = id => getComputedStyle(document.querySelector("#" + id + ">summary>.rv-aviso")).backgroundColor;
    const v = n => { const e = document.createElement("i"); e.style.color = "var(" + n + ")"; document.body.appendChild(e); const r = getComputedStyle(e).color; e.remove(); return r; };
    return { amb: c("rvCatalogo") === v("--warn-bg"), verde: c("rvContratos") === v("--ok-bg"), rojo: c("ccPorDecidir") === v("--err") };
  });
  assert("colores: ámbar, verde y rojo", colores.amb && colores.verde && colores.rojo, colores);

  /* El aviso de tokens con dudas, arriba del todo de «Por decidir», y lleva al catálogo. */
  const primero = await page.evaluate(() => (document.querySelector("#ccLista>*") || {}).className);
  assert("el aviso de tokens con dudas, lo primero de «Por decidir»", primero === "cc-cab cc-dudas", primero);
  const aviso = await page.evaluate(async () => {
    document.getElementById("rvCatalogo").open = false;
    document.querySelector(".cc-dudas a").click();
    await new Promise(r => setTimeout(r, 500));
    return { abierto: document.getElementById("rvCatalogo").open, hash: location.hash };
  });
  assert("su enlace abre el catálogo sin cambiar de pestaña", aviso.abierto && aviso.hash === "#revision", aviso);

  /* Ancho: estrecha cerrada, ancha con una fila abierta. */
  const ancho = await page.evaluate(() => {
    const caja = document.querySelector(".rv-tareas");
    document.querySelectorAll(".rv-tareas>details").forEach(d => { d.open = false; });
    const cerrada = caja.offsetWidth;
    document.getElementById("rvPreciosPol").open = true;
    const abierta = caja.offsetWidth;
    document.getElementById("rvPreciosPol").open = false;
    return { cerrada, abierta };
  });
  assert("cerrada, ≤ 780 px; con una fila abierta, todo el ancho", ancho.cerrada <= 780 && ancho.abierta > 900, ancho);

  /* Si lo cierras no se vuelve a abrir solo; sin nada por decidir, «Al día» y sin rojo. */
  await sembrar(0, true);
  assert("cerrada a mano, no se abre sola al repintar", !(await filas()).find(f => f.id === "ccPorDecidir").abierta);
  await sembrar(0, false);
  const f2 = (await filas()).find(f => f.id === "ccPorDecidir");
  const cab = await page.evaluate(() => [...document.querySelectorAll("#ccLista .cc-cab")].map(e => e.textContent));
  assert("sin nada por decidir: «Al día», sin rojo, y sin una cabecera vacía", f2.estado === "Al día" && !f2.rojo && cab.length === 0, { f2, cab });
  await sembrar(0, true);
  assert("al volver a haber algo, se abre otra vez", (await filas()).find(f => f.id === "ccPorDecidir").abierta);

  /* «Ir al catálogo» de 🚀 lo abre. */
  const desde19 = await page.evaluate(async () => {
    document.getElementById("rvCatalogo").open = false;
    arrIrAlCatalogo();
    await new Promise(r => setTimeout(r, 600));
    return document.getElementById("rvCatalogo").open;
  });
  assert("«Ir al catálogo» de 🚀 lo abre", desde19);

  /* Al imprimir no sale «ⓘ Qué es cada cosa» (🔍 y 📒). */
  await page.emulateMediaType("print");
  const impreso = await page.evaluate(() => [...document.querySelectorAll(".card>.cc-que-es")].map(e => getComputedStyle(e).display));
  await page.emulateMediaType(null);
  assert("al imprimir, sin «ⓘ Qué es cada cosa» (en 🔍 y en 📒)", impreso.length === 2 && impreso.every(d => d === "none"), impreso);

  /* Al salir de 🔍 se pliega todo menos «Por decidir», que con algo se
     vuelve a abrir; un enlace a un bloque lo abre igual. */
  const abiertas = () => page.evaluate(() => [...document.querySelectorAll("#view-revision details[open]")].map(d => d.id));
  await page.evaluate(() => ["rvCatalogo", "cbCoste", "rvPreciosRnt", "ccResueltos"].forEach(id => { document.getElementById(id).open = true; }));
  await page.evaluate(() => { location.hash = "#dashboard"; });
  await esperar(200);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(200);
  const alVolver = await abiertas();
  await page.evaluate(() => { location.hash = "#dashboard"; });
  await esperar(200);
  await page.evaluate(() => irAFechasSinPrecio());
  await esperar(400);
  const conEnlace = await abiertas();
  assert("al volver a 🔍, todo plegado menos «Por decidir»; «fechas sin precio» abre su bloque",
    JSON.stringify(alVolver) === '["ccPorDecidir"]' && JSON.stringify(conEnlace) === '["ccPorDecidir","rvPreciosRnt"]', { alVolver, conEnlace });
  await page.reload({ waitUntil: "networkidle0" });
  await esperar(300);
  assert("al recargar, todo plegado", (await abiertas()).length === 0, await abiertas());

  assert("0 errores", errores.length === 0, errores);
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
