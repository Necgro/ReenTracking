/* Verificación headless de recuperar una copia de seguridad en
 * 🚀 Puesta en marcha: Chrome local + puppeteer-core sobre
 * http://localhost:8765. DATOS 100 % SINTÉTICOS; la red NO se usa (los
 * pasos de la sincronización de js/09 se sustituyen por dobles, como en
 * verifyui7d.js). Capturas cap_ui7b_*.png.
 *
 *  S1) el botón «📂 Abrir copia» en la tarjeta (una copia vieja
 *      se abre con él).
 *  S2) ida y vuelta: la copia vieja (la que hacía 📤 Exportar), recuperada en un
 *      navegador vacío (sin preguntar): config, cache y archivo de
 *      rendimientos como estaban, tu API key sigue (la copia no la trae),
 *      clasifica sola y queda guardada en este navegador.
 *  S3) F5: la copia recuperada sigue aquí (lo guardado es lo de la copia).
 *  S4) con datos pregunta con la fecha y lo que trae; «no» no cambia nada;
 *      «sí» la recupera y la guarda.
 *  S5) archivos que no son tuyos (un JSON roto, cancelar, una copia con la
 *      cache mal): lo dice y no cambia nada.
 *  S6) una copia solo con la config: la cache y el archivo abiertos se
 *      quedan y se vuelve a clasificar.
 *  S7) el botón desactivado mientras trabaja; 375 px sin scroll de lado,
 *      oscuro; sin red y 0 errores.
 *  S8) recuperar encima de una sesión clasificada: las decisiones antiguas
 *      de la copia siguen en su movimiento (A1).
 *  Casos límite también en S2-S6: A3, A6 y A11.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyui7b.js
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
const numTx = c => Object.values(c.transacciones || {}).reduce((a, x) => a + (Array.isArray(x) ? x.length : 0), 0);

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run", "--no-default-browser-check"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });
  let red = 0;
  page.on("request", r => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) red++; });
  // Los confirm() se contestan según `responderSi`; se apunta lo que dicen.
  let responderSi = false;
  const dialogos = [];
  page.on("dialog", async d => { dialogos.push(d.message()); if (responderSi) await d.accept(); else await d.dismiss(); });

  const W = "0x" + "11".repeat(20), W2 = "0x" + "33".repeat(20);
  const esperarFlujo = () => page.waitForFunction(() => !arr.preparando, { timeout: 15000 });
  const toasts = () => page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent));
  const limpiarToasts = () => page.evaluate(() => { document.getElementById("toasts").innerHTML = ""; });
  // Centrado antes del clic: arriba del todo lo tapa la barra superior fija.
  // La copia vieja se abre con «📂 Abrir copia».
  const recuperar = async () => {
    await page.evaluate(() => document.getElementById("btnAbrirArchivo").scrollIntoView({ block: "center" }));
    await page.click("#btnAbrirArchivo");
  };

  // Dobles: sincronización sin red; IndexedDB de verdad. `__abrir` es lo que
  // trae el archivo elegido (un objeto o un texto; null es cancelar).
  const instalarDobles = () => page.evaluate(() => {
    const paso = () => async () => {};
    window.pasoEtherscan = paso(); window.pasoBce = paso(); window.pasoRnt = paso(); window.pasoVault = paso();
    window.cuadreLeer = async () => {};   // el cuadre, sin red (lo prueba verifycuadre3.js)
    window.elegirArchivo = async () => {
      const a = window.__abrir;
      return a === null ? null : { text: async () => typeof a === "string" ? a : JSON.stringify(a) };
    };
  });
  // Tras cargar: lo guardado (o uno vacío) y su flujo, que puede arrancar un momento después.
  const esperarCarga = async () => {
    await page.waitForFunction(() => state.cache && !arr.preparando, { timeout: 15000 });
    await esperar(300);
    await page.waitForFunction(() => !arr.preparando, { timeout: 15000 });
  };
  // Lo guardado en este navegador (registro «archivo»).
  const guardado = () => page.evaluate(async () => {
    const g = await idbOperar("readonly", s => s.get("archivo"));
    return g ? JSON.parse(g.texto) : null;
  });
  // Lo abierto: config (con API key), cache de 3 movimientos con su archivo y archivo de 2 repartos.
  const montar = () => page.evaluate(W => {
    state.config = { wallet: W, vault: "", compra_bancaria_coste_eur_por_token: 100, etherscan_api_key: "CLAVE_LOCAL",
      coingecko_api_key: "", inversor: { nombre: "Prueba", nif: "00000000T" } };
    volcarConfigAFormulario();
    const cache = cacheVacia();
    for (let i = 1; i <= 3; i++) cache.transacciones.wallet_tokens.push({ hash: "0x" + String(i).padStart(64, "0"), value: "1",
      from: W, to: "0x" + "77".repeat(20), contractAddress: "0x" + "a1".repeat(20), tokenName: "Reental Prueba", tokenSymbol: "RPR",
      tokenDecimal: "18", timeStamp: String(1750000000 + i * 1000), blockNumber: String(100 + i) });
    state.cache = cache;
    state.cacheDirty = false;
    const texto = ["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet",
      "\"Prueba Uno#1\",2025-06-10,3,0,3,0,\"['0x" + "1".padStart(64, "0") + "']\",\"[]\"," + W,
      "\"Prueba Uno#2\",2025-12-10,3,0,3,0,\"['0x" + "2".padStart(64, "0") + "']\",\"[]\"," + W].join("\n");
    // El nombre lo apunta js/12 (state.csvArchivo).
    aplicarCsvTexto(texto, true, "rendimientos_prueba.csv");
    window.__textoCsv = texto;
    actualizarChipEstado();
  }, W);
  // Sin nada guardado en el navegador y con los dobles puestos. Se recarga
  // también desde #exportar: ir a #inicio solo cambiaría el hash.
  const empezarLimpio = async () => {
    await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
    await page.evaluate(async () => {
      localStorage.clear();
      await new Promise(r => { const p = indexedDB.deleteDatabase("reental_spa"); p.onsuccess = p.onerror = p.onblocked = () => r(); });
    });
    await page.reload({ waitUntil: "networkidle0" });
    await esperarCarga();
    await instalarDobles();
  };
  const recuperarYEsperar = async () => {
    await recuperar();
    await esperar(200);
    await esperarFlujo();
    await esperar(200);
  };
  const foto = () => page.evaluate(() => ({
    wallet: state.config.wallet, clave: state.config.etherscan_api_key, nif: (state.config.inversor || {}).nif,
    form: document.getElementById("cfgWallet").value, guardadaLocal: JSON.parse(localStorage.getItem("reental_config") || "{}").wallet,
    tx: arrNumTx(state.cache),
    repartos: (state.filasCsv || []).length, csvIgual: window.__textoCsv === (leerArchivoRendimientosCache(state.cache) || {}).texto,
    registros: (state.registros || []).length,
  }));

  await empezarLimpio();

  /* ============ S1) el botón ============ */
  console.log("S1) El botón");
  const s1 = await page.evaluate(() => {
    const b = document.getElementById("btnAbrirArchivo");
    return { texto: b && b.textContent.trim(), enCache: !!(b && b.closest("#arrTarjeta")), activo: b && !b.disabled,
      viejo: !!document.getElementById("btnRecuperarCopia") };
  });
  assert("S1 -> «📂 Abrir copia» en la tarjeta, activo (y sin «📦 Recuperar una copia»)",
    s1.texto === "📂 Abrir copia" && s1.enCache && s1.activo && !s1.viejo, s1);

  /* ============ S2) ida y vuelta ============ */
  console.log("S2) Ida y vuelta con una copia vieja (la de 📤 Exportar antes de PM-5)");
  await montar();
  // La app ya no la hace: se arma a mano en el formato viejo (versión 1, sin API keys).
  const copia = await page.evaluate(() => ({ tipo: "copia_de_seguridad", version: 1, creada: new Date().toISOString(), contenido: {
    config: { ...state.config, etherscan_api_key: "", coingecko_api_key: "" }, cache: JSON.parse(JSON.stringify(state.cache)),
    rendimientos: { nombre: "rendimientos_prueba.csv", texto: window.__textoCsv } } }));
  // Otro navegador: nada guardado salvo una API key escrita a mano.
  await empezarLimpio();
  await page.evaluate(c => { window.__abrir = c; window.__textoCsv = c.contenido.rendimientos.texto; document.getElementById("cfgEthKey").value = "CLAVE_NUEVA";
    document.getElementById("cfgEthKey").dispatchEvent(new Event("change")); }, copia);
  await limpiarToasts();
  dialogos.length = 0;
  await recuperarYEsperar();
  const s2 = await foto();
  assert("S2 -> sin datos no pregunta", dialogos.length === 0, dialogos);
  assert("S2 -> la config de la copia, en el formulario y guardada en el navegador", s2.wallet === W && s2.form === W && s2.guardadaLocal === W && s2.nif === "00000000T", s2);
  assert("S2 -> tu API key sigue (la copia no la traía)", s2.clave === "CLAVE_NUEVA", s2.clave);
  assert("S2 -> la cache de la copia (3 movimientos) y el archivo de rendimientos (2 repartos)", s2.tx === 3 && s2.repartos === 2 && s2.csvIgual, s2);
  assert("S2 -> clasifica sola", s2.registros > 0, s2.registros);
  const g2 = await guardado();
  assert("S2 -> queda guardada en este navegador (3 movimientos), sin «💾 Guardar»", !!g2 && numTx(g2) === 3 &&
    !(await page.evaluate(() => !!document.getElementById("btnGuardarCache"))), g2 && numTx(g2));
  const t2 = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => ({ t: t.textContent, b: !!t.querySelector("button") })));
  assert("S2 -> aviso «Copia recuperada.» sin botón repetido (A11)", t2.some(x => x.t === "Copia recuperada." && !x.b), t2);
  // El archivo de rendimientos de la copia entra en la cache (con su nombre).
  const recordado = await page.evaluate(async () => ({ claves: await idbOperar("readonly", s => s.getAllKeys()),
    dentro: leerArchivoRendimientosCache(state.cache), texto: window.__textoCsv }));
  assert("S2 -> el archivo de rendimientos de la copia entra en la cache (no aparte en el navegador)",
    recordado.claves.join() === "archivo" && !!recordado.dentro && recordado.dentro.texto === recordado.texto,
    { claves: recordado.claves, dentro: !!recordado.dentro });
  assert("S2 -> y con su nombre (rendimientos_prueba.csv)", !!recordado.dentro && recordado.dentro.nombre === "rendimientos_prueba.csv",
    recordado.dentro && recordado.dentro.nombre);
  await page.screenshot({ path: path.join(OUT, "cap_ui7b_recuperada.png"), fullPage: true });

  /* ============ S3) F5: la recuperada sigue aquí ============ */
  console.log("S3) F5: la copia recuperada sigue en este navegador");
  const g3 = await guardado();
  assert("S3 -> lo guardado es la cache de la copia", !!g3 &&
    JSON.stringify(g3.transacciones) === JSON.stringify(copia.contenido.cache.transacciones) &&
    JSON.stringify(g3.ajustes_usuario) === JSON.stringify(copia.contenido.cache.ajustes_usuario) && !("ajustes_movimiento" in g3), g3);
  await page.reload({ waitUntil: "networkidle0" });
  await esperarCarga();
  await instalarDobles();
  await page.evaluate(t => { window.__textoCsv = t; }, copia.contenido.rendimientos.texto);
  const s3 = await foto();
  assert("S3 -> tras F5 sale todo: tus datos, 3 movimientos, 2 repartos y clasificado",
    s3.wallet === W && s3.clave === "CLAVE_NUEVA" && s3.tx === 3 && s3.repartos === 2 && s3.csvIgual && s3.registros > 0, s3);

  /* ============ S4) con datos ============ */
  console.log("S4) Con datos pregunta");
  const otra = JSON.parse(JSON.stringify(copia));
  otra.contenido.config.wallet = W2;
  otra.contenido.cache.transacciones.wallet_tokens.pop();
  await montar();
  await page.evaluate(c => { window.__abrir = c; window.__cacheAntes = state.cache; }, otra);
  dialogos.length = 0;
  responderSi = false;
  await recuperar();
  await esperar(300);
  const s4no = await page.evaluate(() => ({ misma: state.cache === window.__cacheAntes, wallet: state.config.wallet }));
  const fecha = await page.evaluate(c => arrFechaCopia(c.creada), copia);
  assert("S4 -> pregunta con la fecha y lo que trae",
    dialogos.length === 1 && dialogos[0].startsWith("¿Recuperar la copia del " + fecha + "?") && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(fecha) &&
    dialogos[0].includes("Trae: 2 transacciones · 2 repartos · tus datos.") &&
    dialogos[0].endsWith("Sustituye a lo que hay en este navegador."), dialogos);
  assert("S4 -> «no»: no cambia nada", s4no.misma && s4no.wallet === W, s4no);
  responderSi = true;
  await recuperarYEsperar();
  const s4si = await foto();
  responderSi = false;
  assert("S4 -> «sí»: la copia sustituye a lo de antes", s4si.wallet === W2 && s4si.tx === 2 && s4si.registros > 0, s4si);
  const g4 = await guardado();
  assert("S4 -> y queda guardada en este navegador", !!g4 && numTx(g4) === 2, g4 && numTx(g4));

  /* ============ S5) lo que no es una copia ============ */
  console.log("S5) Lo que no es tuyo");
  await montar();
  await page.evaluate(() => { window.__cacheAntes = state.cache; window.__abrir = state.cache; });
  const intentar = async () => {
    await limpiarToasts();
    dialogos.length = 0;
    await recuperar();
    await esperar(250);
    return { toasts: await toasts(), dialogos: dialogos.slice(),
      misma: await page.evaluate(() => state.cache === window.__cacheAntes && state.config.wallet === "0x" + "11".repeat(20)) };
  };
  await page.evaluate(() => { window.__abrir = "{roto"; });
  let s5 = await intentar();
  assert("S5 -> un JSON roto: «Ese archivo no es de esta app. No ha cambiado nada.»",
    s5.toasts.some(t => t === "Ese archivo no es de esta app. No ha cambiado nada.") && s5.misma, s5);
  await page.evaluate(() => { window.__abrir = null; });
  s5 = await intentar();
  assert("S5 -> cancelar: ni aviso ni cambios", !s5.toasts.length && s5.misma, s5);
  // La config y el archivo de la copia rota son otros: si se aplicaran se vería.
  const rota = cache => page.evaluate((c, W2, cache) => { const m = JSON.parse(JSON.stringify(c)); m.contenido.cache = cache;
    m.contenido.config.wallet = W2; m.contenido.rendimientos.texto = m.contenido.rendimientos.texto.split("\n").slice(0, 2).join("\n");
    window.__abrir = m; }, copia, W2, cache);
  // (La wallet ya la mira «misma».)
  const sinTocar = () => page.evaluate(() => state.filasCsv.length === 2);
  await rota({ transacciones: 5 });
  s5 = await intentar();
  assert("S5 -> una copia con la cache mal: lo dice y no aplica ni la config ni el archivo",
    s5.toasts.some(t => /su archivo de la app no vale/.test(t)) && s5.misma && await sinTocar(), s5);
  await rota({ transacciones: {}, tipos_bce: null });
  s5 = await intentar();
  assert("S5 -> A6: una cache que rompería al pintarla (tipos_bce: null) tampoco se aplica",
    s5.toasts.some(t => /su archivo de la app no vale/.test(t)) && s5.misma && await sinTocar() && !errores.length, { s5, errores });

  /* ============ S6) solo la config ============ */
  console.log("S6) Una copia solo con la config");
  await page.evaluate(c => {
    const m = JSON.parse(JSON.stringify(c));
    m.contenido.config.wallet = "0x" + "44".repeat(20);
    m.contenido.cache = null; m.contenido.rendimientos = null;
    window.__abrir = m;
  }, copia);
  responderSi = true;
  await limpiarToasts();
  await recuperarYEsperar();
  responderSi = false;
  const s6 = await page.evaluate(() => ({ misma: state.cache === window.__cacheAntes, wallet: state.config.wallet,
    repartos: state.filasCsv.length, registros: (state.registros || []).length,
    huella: arr.configClasificada }));
  assert("S6 -> la config cambia; la cache y el archivo de rendimientos se quedan",
    s6.wallet === "0x" + "44".repeat(20) && s6.misma && s6.repartos === 2, s6);
  assert("S6 -> se vuelve a clasificar con la config nueva", s6.registros > 0 && s6.huella && s6.huella.startsWith("0x" + "44".repeat(20)), s6);
  assert("S6 -> aviso «Copia recuperada.» sin botón", (await toasts()).includes("Copia recuperada."), await toasts());
  // A3: sin cache en la copia, la de este navegador se queda: no dice «se pierden».
  dialogos.length = 0;
  await recuperar();
  await esperar(300);
  assert("S6 -> A3: no avisa de que se pierde la cache que se queda", dialogos.length === 1 && !/se pierden/.test(dialogos[0]), dialogos);

  /* ============ S8) las decisiones de la copia siguen en su movimiento (A1) ============ */
  console.log("S8) Recuperar encima de una sesión clasificada");
  await montar();
  await page.evaluate(() => { arrClasificarAhora(); });
  const s8prep = await page.evaluate(() => {
    const r = state.registros.find(x => String(x.clave || "").startsWith("0x" + "1".padStart(64, "0")));
    const b = JSON.parse(JSON.stringify(state.cache));
    // En la copia, ese movimiento va a otro sitio y lleva una decisión antigua (sin sello).
    b.transacciones.wallet_tokens[0].to = "0x" + "bb".repeat(20);
    b.ajustes_usuario = { [r.clave]: { nota: "MI_DECISION" } };
    delete b.ajustes_movimiento;
    window.__abrir = { tipo: "copia_de_seguridad", version: 1, creada: new Date().toISOString(),
      contenido: { config: null, cache: b, rendimientos: null } };
    return { clave: r && r.clave, sinVinculos: Array.isArray(state.registrosSinVinculos) };
  });
  responderSi = true;
  await recuperarYEsperar();
  responderSi = false;
  const s8 = await page.evaluate(clave => ({ sello: state.cache.ajustes_movimiento || null,
    nota: (state.registros || []).filter(r => r.clave === clave).map(r => r.nota || "") }), s8prep.clave);
  assert("S8 -> había una clasificación con sus registros", !!s8prep.clave && s8prep.sinVinculos, s8prep);
  assert("S8 -> A1: la decisión antigua de la copia no se sella con el movimiento de la cache de antes", s8.sello === null, s8);
  assert("S8 -> A1: y se aplica a su movimiento", s8.nota.length === 1 && s8.nota[0].includes("MI_DECISION"), s8);

  /* ============ S7) ocupado, móvil, oscuro ============ */
  console.log("S7) Ocupado, móvil y oscuro");
  await page.evaluate(() => { arr.preparando = true; arrPintar(); });
  assert("S7 -> desactivado mientras trabaja", await page.evaluate(() => document.getElementById("btnAbrirArchivo").disabled));
  await page.evaluate(() => { arr.preparando = false; arrPintar(); });
  await page.setViewport({ width: 375, height: 800 });
  await page.evaluate(() => { document.body.classList.add("dark"); location.hash = "#inicio"; });
  await esperar(300);
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  assert("S7 -> 375 px sin scroll de lado", ancho <= 375, ancho);
  await page.evaluate(() => document.getElementById("arrTarjeta").scrollIntoView());
  await page.screenshot({ path: path.join(OUT, "cap_ui7b_movil_oscuro.png") });
  assert("S7 -> sin red", red === 0, red);
  assert("S7 -> 0 errores de consola", errores.length === 0, errores);

  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("FALLO inesperado: " + (e && e.stack || e)); process.exit(1); });
