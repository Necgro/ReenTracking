/* Verificación en navegador de 🚀 Puesta en marcha: 🚀 en
 * una tarjeta y tu archivo guardado solo en este navegador. Datos 100 %
 * sintéticos; IndexedDB de verdad (se cuentan las escrituras); elegir un
 * archivo es un doble.
 *
 *  P1) Usuario nuevo: tus datos y el archivo de Reental → lo guardado en el
 *      navegador lleva tus datos (con la API key) y el archivo de Reental;
 *      la tarjeta dice «N transacciones · se guarda solo en este navegador».
 *  P2) Otro ordenador: sin nada en el navegador, «📂 Abrir copia» con eso →
 *      vuelven tus datos, la API key y el archivo de Reental; queda guardado.
 *  P3) Cada mes: un archivo de Reental más antiguo pregunta («no» no cambia
 *      nada); uno más nuevo entra en tu archivo.
 *  P4) Copia nueva (con la marca de copia): pregunta con su fecha, sustituye
 *      a lo del navegador, sin la marca, guardada ya y un aviso con su fecha.
 *  P5) Copia vieja (formato anterior): se abre y queda en el formato nuevo.
 *  P6) Un config.json: solo tus datos, que entran en tu archivo.
 *  P6b) La casilla de «Tus datos». Desmarcarla lo guarda ya sin API
 *      keys, nombre ni NIF; se recuerda al recargar; marcarla los vuelve a meter.
 *  P7) Otra cosa: «no es de esta app» y nada cambia; cancelar, tampoco.
 *  P8) Sin barra de pasos ni botones viejos («💾 Guardar», «✨ Empezar de
 *      cero», «📂 Seguir con…»); capturas en claro y oscuro; 0 errores de
 *      consola y nada a internet.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifypm4.js
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
  page.on("console", m => consola.push({ tipo: m.type(), texto: m.text(), url: (m.location() || {}).url || "" }));
  page.on("pageerror", e => consola.push({ tipo: "pageerror", texto: String(e && e.message || e), url: "" }));
  const errores = () => consola.filter(m => (m.tipo === "error" || m.tipo === "pageerror") && !/favicon/i.test(m.url + " " + m.texto));
  let red = 0;
  page.on("request", r => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) red++; });
  let responderSi = true;
  const dialogos = [];
  page.on("dialog", async d => { dialogos.push(d.message()); if (responderSi) await d.accept(); else await d.dismiss(); });

  const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), W2 = "0x" + "33".repeat(20);
  const CLAVE = "CLAVE_SINTETICA_PM4";
  const CAB = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
  const csv = fechas => [CAB, ...fechas.map((f, i) => "\"Prueba#" + (i + 1) + "\"," + f + ",2,0,2,0,\"[]\",\"[]\"," + W)].join("\n") + "\n";
  const C2 = csv(["2026-01-10", "2026-02-10"]), C3 = csv(["2026-01-10", "2026-02-10", "2026-03-10"]);

  // Dobles: elegir un archivo (null = cancelar) y la red. El guardado en el
  // navegador es el de verdad, contado.
  function instalarDobles() {
    window.__writes = 0; window.__ultimo = null; window.__abrir = null;
    const real = window.__escribirReal || (window.__escribirReal = window.escribirArchivoNavegador);
    window.escribirArchivoNavegador = async (c, x) => { window.__writes++; window.__ultimo = JSON.parse(JSON.stringify(c)); return real(c, x); };
    window.elegirArchivo = async () => window.__abrir === null ? null : ({ text: async () => JSON.stringify(window.__abrir) });
    window.sincronizar = async () => ({ errores: [] });
    // El cuadre lee saldos de Etherscan; aquí no hay red (lo prueba verifycuadre3.js).
    window.cuadreLeer = async () => {};
  }
  // Tras cargar la página o abrir algo: el flujo puede empezar un momento después.
  const listo = async () => {
    for (let i = 0; i < 2; i++) { await page.waitForFunction(() => state.cache && !arr.preparando, { timeout: 15000 }); await esperar(250); }
  };
  const borrarNavegador = () => page.evaluate(async () => {
    localStorage.clear();
    await new Promise(r => { const p = indexedDB.deleteDatabase("reental_spa"); p.onsuccess = p.onerror = p.onblocked = () => r(); });
  });
  const guardado = () => page.evaluate(async () => {
    const g = await idbOperar("readonly", s => s.get("archivo"));
    return g ? JSON.parse(g.texto) : null;
  });
  const toasts = () => page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent));
  const limpiarToasts = () => page.evaluate(() => { document.getElementById("toasts").innerHTML = ""; });
  const cargarCsvEnPagina = (texto, nombre) => page.evaluate((t, n) => cargarCsv(new File([t], n, { type: "text/csv" })), texto, nombre);
  const abrir = async obj => {
    await page.evaluate(o => { window.__abrir = o; window.scrollTo(0, 0); }, obj);
    await page.click("#btnAbrirArchivo");
    await esperar(150); await listo();
  };
  const tarjeta = () => page.evaluate(() => ({
    explica: !document.getElementById("arrExplica").hidden,
    archivo: document.getElementById("arrArchivo").hidden ? null : document.getElementById("arrNombreArchivo").textContent,
    dz: document.getElementById("dzTexto").textContent,
    faltan: document.getElementById("arrFaltan").textContent,
    datosAbiertos: document.getElementById("arrDatos").open,
  }));

  console.log("P1) Usuario nuevo");
  await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
  await borrarNavegador();
  await page.reload({ waitUntil: "networkidle0" });
  await listo();
  await page.evaluate(instalarDobles);
  await page.screenshot({ path: path.join(OUT, "cap_pm4_vacio.png") });
  const t0 = await tarjeta();
  assert("P1 -> sin datos: la explicación, tus datos abiertos y lo que falta, empezando por tus datos",
    t0.explica && t0.archivo === null && t0.datosAbiertos && /^✖ Tus datos:/.test(t0.faltan.trim()), t0);
  await page.evaluate((w, k) => {
    for (const [id, v] of [["cfgWallet", w], ["cfgEthKey", k], ["cfgNombre", "Ana Prueba"]]) {
      const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("change"));
    }
  }, W, CLAVE);
  await cargarCsvEnPagina(C2, "rendimientos_octubre.csv");
  await listo();
  const g1 = await guardado();
  assert("P1 -> lo guardado en el navegador lleva tus datos y el archivo de Reental",
    g1 && g1.configuracion && g1.configuracion.wallet === W && g1.configuracion.inversor.nombre === "Ana Prueba" &&
    g1.archivo_rendimientos && g1.archivo_rendimientos.texto === C2 && g1.archivo_rendimientos.nombre === "rendimientos_octubre.csv", g1 && Object.keys(g1));
  // Con la casilla marcada (de entrada), la API key va también dentro.
  assert("P1 -> con la API key (casilla marcada de entrada)", g1.configuracion.etherscan_api_key === CLAVE, g1.configuracion);
  assert("P1 -> guardado con el guardado de la app", await page.evaluate(() => window.__writes > 0 && !state.cacheDirty));
  const t1 = await tarjeta();
  assert("P1 -> la línea «N transacciones · se guarda solo en este navegador»; el archivo de Reental, en una línea",
    t1.archivo === "📄 0 transacciones · se guarda solo en este navegador" && !t1.explica && /✔ 2 repartos, hasta 10\/02\/2026/.test(t1.dz), t1);
  await page.screenshot({ path: path.join(OUT, "cap_pm4_con_archivo.png") });
  const archivoP1 = g1;

  console.log("P2) Otro ordenador");
  await borrarNavegador();
  await page.reload({ waitUntil: "networkidle0" });
  await listo();
  await page.evaluate(instalarDobles);
  dialogos.length = 0;
  await abrir(archivoP1);
  const p2 = await page.evaluate(() => ({ wallet: document.getElementById("cfgWallet").value, nombre: document.getElementById("cfgNombre").value,
    key: document.getElementById("cfgEthKey").value, csv: state.filasCsv.length }));
  const t2 = await tarjeta(), g2 = await guardado();
  assert("P2 -> sin nada en el navegador, no pregunta", dialogos.length === 0, dialogos);
  assert("P2 -> vuelven tus datos y el archivo de Reental", p2.wallet === W && p2.nombre === "Ana Prueba" && p2.csv === 2, p2);
  assert("P2 -> vuelve también la API key: todo listo", p2.key === CLAVE && /^✔ Todo listo/.test(t2.faltan.trim()), t2);
  assert("P2 -> queda guardado en este navegador", g2 && g2.configuracion.wallet === W && (g2.archivo_rendimientos || {}).texto === C2 &&
    /se guarda solo en este navegador/.test(t2.archivo), t2);

  console.log("P3) Cada mes");
  responderSi = false; dialogos.length = 0;
  const w0 = await page.evaluate(() => window.__writes);
  await cargarCsvEnPagina(csv(["2026-01-10"]), "viejo.csv");
  const p3 = await page.evaluate(() => ({ n: state.filasCsv.length, writes: window.__writes }));
  assert("P3 -> uno más antiguo pregunta; «no» no cambia nada",
    /más antiguo que el que ya tienes \(hasta 10\/02\/2026\)/.test(dialogos[0] || "") && p3.n === 2 && p3.writes === w0, [dialogos, p3]);
  responderSi = true;
  await cargarCsvEnPagina(C3, "noviembre.csv");
  await listo();
  const p3b = { dentro: await page.evaluate(() => (state.cache.archivo_rendimientos || {}).nombre), guardado: ((await guardado()).archivo_rendimientos || {}).texto };
  assert("P3 -> uno más nuevo entra en tu archivo y se guarda", p3b.dentro === "noviembre.csv" && p3b.guardado === C3, p3b);

  console.log("P4) Copia nueva");
  const copia = Object.assign(JSON.parse(JSON.stringify(archivoP1)), { copia_de_seguridad: { creada: "2026-10-07T10:00:00Z" } });
  dialogos.length = 0; await limpiarToasts();
  const w4 = await page.evaluate(() => window.__writes);
  await abrir(copia);
  const p4 = await page.evaluate(() => ({ marca: "copia_de_seguridad" in state.cache, dirty: state.cacheDirty,
    archivo: document.getElementById("arrNombreArchivo").textContent, writes: window.__writes,
    faltan: document.getElementById("arrFaltan").textContent }));
  const t4 = await toasts(), g4 = await guardado();
  assert("P4 -> pregunta (había datos) con la fecha de la copia",
    /^¿Abrir la copia del 07\/10\/2026 \d\d:\d\d\?\n\nSustituye a lo que hay en este navegador\.$/.test(dialogos[0] || ""), dialogos);
  assert("P4 -> sustituye a lo del navegador: sin la marca y guardada ya",
    !p4.marca && !p4.dirty && p4.writes > w4 && g4 && !("copia_de_seguridad" in g4) && (g4.archivo_rendimientos || {}).texto === C2 &&
    /se guarda solo en este navegador/.test(p4.archivo) && !/cambios sin guardar/i.test(p4.faltan), p4);
  assert("P4 -> el aviso con su fecha", t4.some(t => /^Copia del 07\/10\/2026 \d\d:\d\d abierta\.$/.test(t)), t4);
  await page.screenshot({ path: path.join(OUT, "cap_pm4_copia.png") });

  console.log("P5) Copia vieja");
  const vieja = { tipo: "copia_de_seguridad", version: 1, creada: "2026-01-15T21:21:00Z", contenido: {
    config: { wallet: W2, vault: V, etherscan_api_key: "", inversor: { nombre: "Copia", nif: "" } },
    cache: await page.evaluate(() => cacheVacia()), rendimientos: { nombre: "de_la_copia.csv", texto: C3 } } };
  dialogos.length = 0;
  await abrir(vieja);
  const p5 = await page.evaluate(() => ({ cfg: state.cache.configuracion, csv: (state.cache.archivo_rendimientos || {}).nombre }));
  const g5 = await guardado();
  assert("P5 -> se abre y queda en el formato nuevo (tus datos y el archivo de Reental dentro, guardado)",
    p5.cfg && p5.cfg.wallet === W2 && p5.cfg.vault === V && p5.cfg.inversor.nombre === "Copia" && p5.csv === "de_la_copia.csv" &&
    g5 && g5.configuracion.wallet === W2 && (g5.archivo_rendimientos || {}).nombre === "de_la_copia.csv", p5);

  console.log("P6) Un config.json");
  await abrir({ wallet: W, vault: "", etherscan_api_key: "OTRA_CLAVE", inversor: { nombre: "Config", nif: "1X" } });
  await esperar(300);
  const p6 = await page.evaluate(() => ({ wallet: state.config.wallet, key: state.config.etherscan_api_key, enCache: state.cache.configuracion }));
  const g6 = await guardado();
  assert("P6 -> solo tus datos; entran en tu archivo, con la API key (casilla marcada)",
    p6.wallet === W && p6.key === "OTRA_CLAVE" && p6.enCache.wallet === W && p6.enCache.inversor.nif === "1X" && p6.enCache.etherscan_api_key === "OTRA_CLAVE" &&
    g6.configuracion.etherscan_api_key === "OTRA_CLAVE", p6.enCache);

  console.log("P6b) La casilla de «Tus datos»");
  const casilla = () => page.evaluate(() => {
    const c = document.getElementById("cfgDatosEnArchivo");
    return { dentroDeTusDatos: !!c.closest("#arrDatos"), marcada: c.checked, visible: c.offsetParent !== null, texto: c.parentElement.textContent.trim() };
  });
  const pulsarCasilla = async () => {
    await page.evaluate(() => document.getElementById("cfgDatosEnArchivo").scrollIntoView({ block: "center" }));
    await page.click("#cfgDatosEnArchivo");
    await esperar(300);
  };
  const c0 = await casilla();
  assert("P6b -> en «Tus datos», a la vista y marcada de entrada", c0.dentroDeTusDatos && c0.visible && c0.marcada &&
    c0.texto === "Incluir API keys, nombre y NIF en tus copias", c0);
  await abrir(archivoP1);   // tus datos de P1 dentro (P6 dejó los del config.json)
  const w6 = await page.evaluate(() => window.__writes);
  await pulsarCasilla();
  const p6b = await page.evaluate(() => ({ ultimo: window.__ultimo && window.__ultimo.configuracion, writes: window.__writes,
    navegador: JSON.parse(localStorage.getItem("reental_config") || "{}") }));
  assert("P6b -> desmarcarla guarda ya tu archivo sin API keys, nombre ni NIF; se quedan en el navegador",
    p6b.writes === w6 + 1 && !("etherscan_api_key" in p6b.ultimo) && p6b.ultimo.inversor.nombre === "" && p6b.ultimo.inversor.nif === "" &&
    p6b.ultimo.wallet === W && p6b.navegador.etherscan_api_key === CLAVE && p6b.navegador.inversor.nif === "1X", p6b);
  await page.reload({ waitUntil: "networkidle0" });
  await listo();
  const c1 = await casilla(), g6b = await guardado();
  assert("P6b -> al recargar sigue desmarcada y lo guardado, sin API keys", !c1.marcada && !("etherscan_api_key" in g6b.configuracion), [c1, g6b.configuracion]);
  await page.evaluate(instalarDobles);
  await abrir(archivoP1);
  await pulsarCasilla();
  const p6c = await page.evaluate(() => window.__ultimo && window.__ultimo.configuracion);
  assert("P6b -> marcarla los vuelve a meter", p6c && p6c.etherscan_api_key === CLAVE && p6c.inversor.nombre === "Ana Prueba" && p6c.inversor.nif === "1X", p6c);

  console.log("P7) Otra cosa");
  await limpiarToasts();
  const foto = () => page.evaluate(() => JSON.stringify([state.config, state.cache]));
  const antes = await foto(), w7 = await page.evaluate(() => window.__writes);
  await abrir({ cualquier: "cosa" });
  assert("P7 -> «no es de esta app» y nada cambia",
    (await toasts()).some(t => t === "Ese archivo no es de esta app. No ha cambiado nada.") && antes === await foto() &&
    w7 === await page.evaluate(() => window.__writes));
  await limpiarToasts();
  await abrir(null);
  assert("P7 -> cancelar: nada cambia y sin avisos", antes === await foto() && (await toasts()).length === 0);

  console.log("P8) Pantalla");
  const viejos = await page.evaluate(() => ["arrStepper", "arrPasoConfig", "arrPasoCache", "arrPasoCsv", "btnAbrirCache", "btnRecuperarCopia",
    "btnAbrirConfig", "btnGuardarConfig", "btnGuardarCache", "btnNuevaCache", "arrSeguirCache", "arrRecordados", "exCopia"].filter(id => document.getElementById(id)));
  assert("P8 -> sin barra de pasos ni botones viejos", viejos.length === 0, viejos);
  assert("P8 -> sin «Sin guardar en tu disco» ni «Hay cambios sin guardar»",
    !/Sin guardar en tu disco|Hay cambios sin guardar/.test(await page.evaluate(() => document.body.innerText)));
  assert("P8 -> a 1366 px sin scroll de lado", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.evaluate(() => { document.body.classList.add("dark"); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(OUT, "cap_pm4_oscuro.png") });
  assert("P8 -> 0 errores de consola", errores().length === 0, errores().slice(0, 3));
  assert("P8 -> nada a internet", red === 0, red);

  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
