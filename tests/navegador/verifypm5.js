/* Verificación en navegador de «🗂️ Guardar copia» en 🚀. Datos 100 % sintéticos; IndexedDB de verdad;
 * la descarga y elegir un archivo son dobles.
 *
 *  C1) Sin datos: no se ve. 📤 Exportar no la tiene.
 *  C2) Con datos: se ve, con la casilla marcada, «Última copia: ninguna.» y
 *      «Tus datos» abierto.
 *  C3) Guardar copia: descarga reental_cache_AAAA-MM-DD_HHMM.json, un
 *      duplicado de tu archivo (con las API keys en tus datos, como él) + la
 *      marca con solo su fecha; «Última copia: hoy» (lo que lleva, en su
 *      burbuja) y sigue al recargar.
 *  C4) Desmarcada (la casilla de «Tus datos»): sin API keys, sin
 *      nombre ni NIF.
 *  C5) La descarga de verdad: el enlace con su nombre y «Copia descargada».
 *  C6) Otro navegador: «📂 Abrir copia» con la copia → tus datos, el
 *      archivo de Reental y las API keys; sin la marca, guardada en el
 *      navegador y con «🗂️ Guardar copia» a la vista.
 *  C7) Captura en claro y oscuro; 0 errores de consola y nada a internet.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifypm5.js
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
  await page.setViewport({ width: 1366, height: 1000 });
  const consola = [];
  const vigilar = p => {
    p.on("console", m => consola.push({ tipo: m.type(), texto: m.text(), url: (m.location() || {}).url || "" }));
    p.on("pageerror", e => consola.push({ tipo: "pageerror", texto: String(e && e.message || e), url: "" }));
    p.on("request", r => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) red++; });
    p.on("dialog", d => d.accept());
  };
  const errores = () => consola.filter(m => (m.tipo === "error" || m.tipo === "pageerror") && !/favicon/i.test(m.url + " " + m.texto));
  let red = 0;
  vigilar(page);

  const W = "0x" + "11".repeat(20);
  const ETH = "CLAVE_SINTETICA_PM5", CG = "CG_SINTETICA_PM5";
  const CSV = ["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet",
    "\"Prueba#1\",2026-01-10,2,0,2,0,\"[]\",\"[]\"," + W, "\"Prueba#2\",2026-02-10,2,0,2,0,\"[]\",\"[]\"," + W].join("\n") + "\n";

  // Dobles: la descarga, elegir un archivo y la red.
  function instalarDobles() {
    window.__descargas = [];
    window.descargarJson = (nombre, obj) => { window.__descargas.push({ nombre, obj: JSON.parse(JSON.stringify(obj)) }); };
    window.elegirArchivo = async () => ({ text: async () => JSON.stringify(window.__abrir) });
    window.sincronizar = async () => ({ errores: [] });
    // El cuadre lee saldos de Etherscan; aquí no hay red (lo prueba verifycuadre3.js).
    window.cuadreLeer = async () => {};
  }
  const borrarNavegador = p => p.evaluate(async () => {
    localStorage.clear();
    await new Promise(r => { const q = indexedDB.deleteDatabase("reental_spa"); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  });
  // Tras cargar la página o abrir algo: el flujo puede empezar un momento después.
  const listo = async p => {
    for (let i = 0; i < 2; i++) { await p.waitForFunction(() => state.cache && !arr.preparando, { timeout: 15000 }); await esperar(250); }
  };
  const bloque = () => page.evaluate(() => ({ visible: !$("btnCopia").hidden && $("btnCopia").offsetParent !== null,
    marcada: $("cfgDatosEnArchivo").checked, ultima: $("exUltima").hidden ? "" : $("exUltima").textContent,
    burbuja: ($("exUltima").querySelector("[title]") || {}).title || "", datosAbiertos: $("arrDatos").open }));
  // Con datos: tus datos y el archivo de Reental (se guardan solos).
  const meterDatos = async () => {
    await page.evaluate((w, eth, cg, csv) => {
      for (const [id, v] of [["cfgWallet", w], ["cfgEthKey", eth], ["cfgNombre", "Ana Prueba"], ["cfgNif", "00000000T"]]) {
        const el = $(id); el.value = v; el.dispatchEvent(new Event("change"));
      }
      state.config.coingecko_api_key = cg;
      guardarConfigLocalSilencioso();
      return cargarCsv(new File([csv], "rendimientos.csv", { type: "text/csv" }));
    }, W, ETH, CG, CSV);
    await listo(page);
  };
  // Arriba del todo antes del clic (tras el flujo la página baja al resumen); la casilla, centrada.
  const pulsar = async sel => {
    await page.evaluate(q => { window.scrollTo(0, 0); if (q === "#cfgDatosEnArchivo") document.querySelector(q).scrollIntoView({ block: "center" }); }, sel);
    await page.click(sel);
  };
  const guardarCopia = async () => {
    await page.waitForFunction(() => !$("btnCopia").disabled, { timeout: 15000 });
    await page.evaluate(() => { window.__descargas = []; document.getElementById("toasts").innerHTML = ""; });
    await pulsar("#btnCopia"); await esperar(300);
  };

  console.log("C1) Sin datos");
  await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
  await borrarNavegador(page);
  await page.reload({ waitUntil: "networkidle0" });
  await listo(page);
  await page.evaluate(instalarDobles);
  const b1 = await bloque();
  assert("C1 -> sin datos no se ve (ni «Última copia»)", !b1.visible && b1.ultima === "", b1);
  const enExportar = await page.evaluate(() => ({ boton: !!$("exCuerpo").querySelector("#btnCopia, #cfgDatosEnArchivo"), texto: $("exCuerpo").textContent }));
  assert("C1 -> 📤 Exportar no tiene la copia", !enExportar.boton && !/Copia de seguridad/.test(enExportar.texto), enExportar);

  console.log("C2) Con datos");
  await meterDatos();
  const b2 = await bloque();
  assert("C2 -> se ve, con la casilla marcada y «Última copia: ninguna.»", b2.visible && b2.marcada && b2.ultima === "Última copia: ninguna.", b2);
  assert("C2 -> «Tus datos» sigue abierto con todo completo", b2.datosAbiertos &&
    await page.evaluate(() => !arrEvaluar(arrFoto()).faltaConfig), b2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, "cap_pm5_inicio.png") });

  console.log("C3) Guardar copia");
  await page.evaluate(() => { const el = $("cfgNif"); el.value = "11111111H"; });   // escrito, aún sin «change»
  await guardarCopia();
  const c3 = await page.evaluate(() => {
    const g = window.__descargas[0], { copia_de_seguridad: marca, ...resto } = (g && g.obj) || {};
    const sinDatos = o => { const x = JSON.parse(JSON.stringify(o)); delete x.configuracion; return JSON.stringify(x); };
    return { n: window.__descargas.length, nombre: g && g.nombre, marca, nif: resto.configuracion && resto.configuracion.inversor.nif,
      csv: (resto.archivo_rendimientos || {}).texto, datos: resto.configuracion, igual: !!g && sinDatos(resto) === sinDatos(state.cache),
      tipo: g && arrTipoArchivo(g.obj), abierta: "copia_de_seguridad" in state.cache,
      aviso: [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent).join(" | ") };
  });
  assert("C3 -> descarga un reental_cache_AAAA-MM-DD_HHMM.json", c3.n === 1 && /^reental_cache_\d{4}-\d{2}-\d{2}_\d{4}\.json$/.test(c3.nombre), c3);
  assert("C3 -> es tu archivo tal cual con la marca (tipo «copia»); el del navegador no la lleva", c3.igual && c3.tipo === "copia" && !c3.abierta, c3);
  assert("C3 -> la marca, solo su fecha; las dos API keys en tus datos, como en tu archivo", Object.keys(c3.marca).join() === "creada" &&
    c3.datos.etherscan_api_key === ETH && c3.datos.coingecko_api_key === CG, c3);
  assert("C3 -> con lo escrito ahora (el NIF) y el archivo de Reental", c3.nif === "11111111H" && c3.csv && c3.csv.includes("Prueba#2"), c3);
  assert("C3 -> el aviso «Copia descargada» con su nombre", c3.aviso.includes("Copia descargada: " + c3.nombre), c3.aviso);
  const b3 = await bloque();
  assert("C3 -> «Última copia: hoy», con el archivo y lo que lleva en su burbuja", b3.ultima === "Última copia: hoy" && b3.burbuja.includes(c3.nombre) &&
    /tus datos y API keys/.test(b3.burbuja) && /2 repartos/.test(b3.burbuja), b3);
  const copiaC3 = await page.evaluate(() => window.__descargas[0].obj);
  await page.reload({ waitUntil: "networkidle0" });
  await listo(page);
  const b3b = await bloque();
  assert("C3 -> «Última copia» sigue al recargar", b3b.ultima === "Última copia: hoy" && b3b.burbuja.includes(c3.nombre), b3b);
  await page.evaluate(instalarDobles);

  console.log("C4) Desmarcada");
  await pulsar("#cfgDatosEnArchivo");
  await esperar(200);
  await guardarCopia();
  const c4 = await page.evaluate(() => ({ texto: JSON.stringify(window.__descargas[0].obj), wallet: window.__descargas[0].obj.configuracion.wallet,
    burbuja: ($("exUltima").querySelector("[title]") || {}).title || "", marcada: $("cfgDatosEnArchivo").checked }));
  assert("C4 -> sin API keys, sin nombre ni NIF; la wallet se queda", !/CLAVE|CG_SINTETICA|Ana Prueba|00000000T|11111111H/.test(c4.texto) && c4.wallet === W, c4.wallet);
  assert("C4 -> «Última copia» ya no dice «API keys»; la casilla sigue como la dejaste", !/API keys/.test(c4.burbuja) && !c4.marcada, c4);
  await pulsar("#cfgDatosEnArchivo");
  await esperar(200);

  console.log("C5) La descarga de verdad");
  {
    // En la misma pestaña (una segunda se quedaría bloqueada), con la descarga de verdad.
    const p2 = page;
    await p2.reload({ waitUntil: "networkidle0" });
    await listo(p2);
    const c5 = await p2.evaluate(async () => {
      window.sincronizar = async () => ({ errores: [] });
      HTMLAnchorElement.prototype.click = function () { window.__descargado = this.download; };
      exEstado.copiaHecha = 0;
      const hecha = await exHacerCopia();
      return { hecha, descargado: window.__descargado, aviso: [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent).join(" | ") };
    });
    assert("C5 -> el enlace de descarga con su nombre y «Copia descargada»", c5.hecha &&
      /^reental_cache_\d{4}-\d{2}-\d{2}_\d{4}\.json$/.test(c5.descargado || "") && c5.aviso.includes("Copia descargada: " + c5.descargado), c5);
  }

  console.log("C6) Otro navegador");
  await borrarNavegador(page);
  await page.reload({ waitUntil: "networkidle0" });
  await listo(page);
  await page.evaluate(instalarDobles);
  await page.evaluate(c => { window.__abrir = c; window.scrollTo(0, 0); }, copiaC3);
  await page.click("#btnAbrirArchivo");
  await esperar(150); await listo(page);
  const c6 = await page.evaluate(async () => {
    const g = await idbOperar("readonly", s => s.get("archivo"));
    return { eth: $("cfgEthKey").value, cg: state.config.coingecko_api_key, nif: $("cfgNif").value,
      guardadas: JSON.parse(localStorage.getItem("reental_config") || "{}").etherscan_api_key, csv: state.filasCsv.length,
      marca: "copia_de_seguridad" in state.cache, dirty: state.cacheDirty,
      enNavegador: g ? { marca: g.texto.includes("copia_de_seguridad"), claves: g.texto.includes("CLAVE_SINTETICA_PM5") } : null,
      copiaOculta: $("btnCopia").hidden };
  });
  assert("C6 -> vuelven tus datos, el archivo de Reental y las dos API keys (también en el navegador)",
    c6.eth === ETH && c6.cg === CG && c6.guardadas === ETH && c6.nif === "11111111H" && c6.csv === 2, c6);
  // Con la casilla marcada (de entrada), las claves van en tus datos de dentro.
  assert("C6 -> sin la marca, guardada en el navegador con las claves en tus datos", !c6.marca && !c6.dirty &&
    c6.enNavegador && !c6.enNavegador.marca && c6.enNavegador.claves, c6);
  assert("C6 -> «🗂️ Guardar copia» a la vista", !c6.copiaOculta, c6);

  console.log("C7) Pantalla");
  await page.evaluate(() => { document.body.classList.add("dark"); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(OUT, "cap_pm5_oscuro.png") });
  assert("C7 -> a 1366 px sin scroll de lado", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  assert("C7 -> 0 errores de consola", errores().length === 0, errores().slice(0, 3));
  assert("C7 -> nada a internet", red === 0, red);

  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
