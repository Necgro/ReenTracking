/* Verificación headless de 🚀 Puesta en marcha (todo automático):
 * Chrome local + puppeteer-core sobre http://localhost:8765.
 * DATOS 100 % SINTÉTICOS; la red NO se usa: los pasos de sincronización
 * (pasoEtherscan/pasoBce/pasoRnt/pasoVault de js/09) se sustituyen en la
 * página por dobles, así se ejercita el orquestador real `sincronizar`.
 * Capturas cap_ui7d_*.png en esta carpeta.
 *
 *  A) Arranque en frío: 8 vistas, 100 €/token, una sola tarjeta, botón
 *     «🔄 Actualizar» desactivado, registro plegado, nada guardado (la
 *     explicación, sin «🗂️ Guardar copia»).
 *  B) Los botones y bloques retirados siguen fuera.
 *  C) Direcciones antiguas: #config, #sync, #clasificacion y #panel.
 *  D) Configuración en «Tus datos» (se guarda sola; copia con 100 €/token).
 *  E) Primera vez: sin API key «🔄 Actualizar» no se puede
 *     pulsar; con ella descarga sola, sin CSV espera («Carga el archivo de
 *     rendimientos») y lo descargado queda guardado en este navegador.
 *  F) Cargar el CSV clasifica solo y sin avisos flotantes.
 *  G) Resumen único: transacciones nuevas, vault ✓/⚠ (ámbar si no
 *     cuadra, nunca verde); «🔄 Actualizar» vuelve a descargar.
 *  H) Datos viejos: abrir otra copia o cargar otro CSV borra la
 *     clasificación anterior de Transacciones.
 *  I) Clasificación automática: config válida sí, a medio escribir
 *     no, NIF no; decidir un token y aplicar ajustes reclasifican.
 *  J) Registro técnico plegado que se abre solo con un error.
 *  K) Recordar entre visitas: F5 y sale todo de este
 *     navegador (transacciones, el CSV de dentro, clasificado) sin descargar.
 *  L) Móvil, modo oscuro, sin red y 0 errores de consola.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyui7d.js
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
const arrNumTxNodo = c => Object.values(c.transacciones || {}).reduce((a, x) => a + (Array.isArray(x) ? x.length : 0), 0);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1600,1200"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });
  const consola = [];
  page.on("console", m => consola.push({ tipo: m.type(), texto: m.text(), url: (m.location() || {}).url || "" }));
  page.on("pageerror", e => consola.push({ tipo: "pageerror", texto: String(e && e.message || e), url: "" }));
  const errores = () => consola.filter(m =>
    (m.tipo === "error" || m.tipo === "pageerror") && !/favicon/i.test(m.url + " " + m.texto));
  let red = 0;
  const urlsRed = [];
  page.on("request", r => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) { red++; urlsRed.push(r.url().slice(0, 80)); } });
  // Los confirm() se contestan según `responderSi` (por defecto «no»). Se
  // decide aquí y no en la página: mientras el diálogo está abierto la página
  // no puede evaluar nada.
  let responderSi = false;
  page.on("dialog", async d => {
    consola.push({ tipo: "dialog", texto: d.message(), url: "" });
    if (responderSi) await d.accept(); else await d.dismiss();
  });

  const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), W2 = "0x" + "33".repeat(20);
  const vistaActiva = () => page.evaluate(() => (document.querySelector("section.view.active") || {}).id);
  // Sin tarjetas de paso (#arrPasoConfig/Cache/Csv) ni su data-state:
  // lo que falta lo dice #arrFaltan.
  const faltanAhora = () => page.evaluate(() => [...document.querySelectorAll("#arrFaltan .arr-falta:not(.ok)")]
    .map(x => x.textContent.replace(/^[✖✔]\s*/, "").replace(/\s*ir$/, "").trim()));
  const esperarFlujo = () => page.waitForFunction(() => !arr.preparando &&
    !document.getElementById("arrPreparar").textContent.includes("Trabajando"), { timeout: 15000 });
  const toasts = () => page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent));
  const limpiarToasts = () => page.evaluate(() => { document.getElementById("toasts").innerHTML = ""; });
  // Tras cargar: lo guardado (o uno vacío) y su flujo, que puede arrancar un momento después.
  const esperarCarga = async () => {
    await page.waitForFunction(() => state.cache && !arr.preparando, { timeout: 15000 });
    await esperar(300);
    await page.waitForFunction(() => !arr.preparando, { timeout: 15000 });
  };
  // Lo guardado en este navegador (registro «archivo»).
  const guardado = () => page.evaluate(async () => {
    const claves = await idbOperar("readonly", s => s.getAllKeys());
    const g = await idbOperar("readonly", s => s.get("archivo"));
    return { claves, cache: g ? JSON.parse(g.texto) : null };
  });
  const CSV = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet\n" +
    "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;

  // Dobles de la sincronización y de elegir un archivo (se instalan en la página).
  function instalarDobles() {
    window.__orden = [];
    window.__falla = null;
    window.__vault = null;
    window.__sinNuevas = false;
    const T = "0x" + "77".repeat(20), P1 = "0x" + "a1".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
    const tok6 = u => BigInt(Math.trunc(u * 1e6)).toString();
    const leg = (h, from, to, contrato, value, name, sym, dec, t, blk) => ({
      blockNumber: blk, timeStamp: t, hash: h, from, to, contractAddress: contrato,
      value, tokenName: name, tokenSymbol: sym, tokenDecimal: dec,
    });
    const paso = nombre => async () => {
      window.__orden.push(nombre);
      if (window.__falla === nombre) throw new Error("fallo simulado de " + nombre);
      const Wc = state.config.wallet;
      if (nombre === "etherscan" && !window.__sinNuevas && !state.cache.transacciones.wallet_tokens.length) {
        state.cache.transacciones.wallet_tokens.push(
          leg(Hh(1), Wc, T, P1, tok18(200), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 6, 14, 22), "100"),
          leg(Hh(2), T, Wc, USDT, tok6(3204), "Tether USD", "USDT", "6", ts(2026, 6, 19, 18), "102"),
          leg(Hh(3), T, Wc, USDC, tok6(400), "USD Coin", "USDC", "6", ts(2026, 6, 12, 10), "103"),
          leg(Hh(4), T, Wc, "0x" + "5a".repeat(20), tok18(1000000), "Visit claim-reward.xyz", "SCAM", "18", ts(2026, 2, 1, 9), "105"));
      }
      if (nombre === "vault" && window.__vault) { state.sync.vault = window.__vault; return window.__vault; }
    };
    window.pasoEtherscan = paso("etherscan"); window.pasoBce = paso("bce");
    window.pasoRnt = paso("rnt"); window.pasoVault = paso("vault");
    window.cuadreLeer = async () => {};   // el cuadre, sin red (lo prueba verifycuadre3.js)
    // Lo guardado va de verdad a IndexedDB; se cuentan las escrituras.
    window.__writes = 0;
    const escribir = window.__escribirReal || (window.__escribirReal = window.escribirArchivoNavegador);
    window.escribirArchivoNavegador = async (c, extra) => { window.__writes++; return escribir(c, extra); };
    window.elegirArchivo = async () => window.__abrir == null ? null : ({ text: async () => JSON.stringify(window.__abrir) });
  }

  /* ============ A) arranque en frío ============ */
  console.log("A) Arranque en frío");
  await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise(r => { const p = indexedDB.deleteDatabase("reental_spa"); p.onsuccess = p.onerror = p.onblocked = () => r(); });
  });
  await page.reload({ waitUntil: "networkidle0" });
  await esperarCarga();
  const menu = await page.evaluate(() => [...document.querySelectorAll("#navPrincipal a")].map(a => a.getAttribute("href")));
  assert("menú de 8 vistas (con 📖 Ayuda) sin ⚙️ Config, 🔄 Sincronización ni 🧮 Clasificación",
    menu.length === 8 && !menu.includes("#vault") && !menu.includes("#defi") && !menu.includes("#config") && !menu.includes("#sync") && !menu.includes("#clasificacion"), menu);
  const a = await page.evaluate(() => ({
    coste: state.config.compra_bancaria_coste_eur_por_token,
    // Sin datos se ve la explicación y «Tus datos» abierto.
    tx: arrNumTx(state.cache), copia: !document.getElementById("btnCopia").hidden,
    explica: !document.getElementById("arrExplica").hidden, lineaArchivo: document.getElementById("arrArchivo").hidden,
    datosAbiertos: document.getElementById("arrDatos").open,
    prep: document.getElementById("arrPreparar").disabled,
    rotulo: document.getElementById("arrPreparar").textContent.trim(),
    faltan: [...document.querySelectorAll("#arrFaltan .arr-falta:not(.ok)")].map(x => x.textContent.replace(/^[✖✔]\s*/, "").trim()),
    fin: document.getElementById("arrFin").hidden,
    cardSync: document.getElementById("arrPasoSync").hidden,
    tarjetas: [...document.querySelectorAll("#view-inicio .card")].filter(c => c.offsetParent !== null).length,
    registro: (() => { const d = document.getElementById("arrRegistro"); return !!d && d.tagName === "DETAILS" && !d.open && !!d.querySelector("#consola"); })(),
    abrir: document.getElementById("btnAbrirArchivo").textContent.trim(),
    nueva: !!document.getElementById("btnNuevaCache"),
  }));
  assert("100 € por token ya fijados sin tocar nada (T46)", a.coste === 100, a.coste);
  assert("el botón final es «🔄 Actualizar» y nace desactivado con 2 cosas en la lista (T35, ALMACEN-1)",
    a.rotulo === "🔄 Actualizar" && a.prep && a.faltan.length === 2, a);
  assert("se abre una copia con «📂 Abrir copia»; sin «✨ Empezar de cero» (ALMACEN-1)",
    a.abrir === "📂 Abrir copia" && !a.nueva, a);
  // Una sola tarjeta (sin cabecera, pasos ni botón aparte).
  assert("la tarjeta de sincronización está oculta hasta el primer flujo: 1 tarjeta a la vista", a.cardSync && a.fin && a.tarjetas === 1, a);
  assert("el registro técnico existe, va plegado y contiene la consola (T40)", a.registro, a);
  assert("nada guardado: vacío, con la explicación y sin «🗂️ Guardar copia» ni la línea de tu archivo",
    a.tx === 0 && a.explica && a.lineaArchivo && !a.copia, a);
  // Primero va tu archivo; se busca la línea de «Tus datos».
  const fDatos = a.faltan.find(x => /^Tus datos:/.test(x)) || "";
  assert("la lista pide wallet y API key, y NO el vault ni el precio por token",
    /wallet/.test(fDatos) && /API key/.test(fDatos) &&
    !/vault/i.test(a.faltan.join(" ")) && !/por token/.test(a.faltan.join(" ")), a.faltan);
  // Tu archivo no falta (vive en este navegador).
  assert("falta solo tus datos y el archivo de Reental; «Tus datos» abierto",
    !!fDatos && /^Carga el archivo de rendimientos de Reental/.test(a.faltan[1]) && a.datosAbiertos, a);
  await page.screenshot({ path: path.join(OUT, "cap_ui7d_frio.png"), fullPage: true });

  /* ============ B) lo retirado ============ */
  console.log("\nB) Lo retirado en UI-7c sigue fuera");
  const RETIRADOS = ["btnClasificar", "resultadoClasificacion", "btnSyncTodo", "btnSyncEth", "btnSyncBce",
    "btnSyncRnt", "btnProbarGuardado", "btnDescubrimiento", "dzDatos", "fileDatos", "resumenDatos",
    "btnGuardarCacheDash", "cfgCosteToken", "cfgFechaAdq", "cfgRetencion", "cfgCgKey",
    "btnGuardarConfigLocal", "arrWallet", "arrVault", "arrEthKey", "arrCoste", "arrCargarConfig",
    "arrPasoClasificar",
    // Fuera la barra de pasos, las tarjetas de paso y sus botones.
    "arrStepper", "arrPasoConfig", "arrPasoCache", "arrPasoCsv", "btnAbrirCache", "btnRecuperarCopia",
    "btnAbrirConfig", "btnGuardarConfig",
    // Fuera el archivo del disco, «Empezar de cero», «Seguir con…» y la copia aparte.
    "btnGuardarCache", "btnNuevaCache", "arrSeguirCache", "arrRecordados", "exCopia"];
  const b = await page.evaluate(ids => ({
    presentes: ids.filter(id => document.getElementById(id)),
    textos: document.getElementById("view-inicio").textContent,
    privacidad: document.querySelector(".privacy").textContent,
    todo: document.body.textContent,
  }), RETIRADOS);
  assert("ninguno de los " + RETIRADOS.length + " elementos retirados existe", b.presentes.length === 0, b.presentes);
  assert("sin «Conteo por categoría», «reental_datos.json», «Parámetros fiscales» ni «Probar guardado»",
    !/Conteo por categoría|reental_datos\.json|Parámetros fiscales|Probar guardado|sincronizar por partes/.test(b.textos));
  assert("ALMACEN-1: ningún texto habla de «Empezar de cero», «💾 Guardar» ni «abre tu archivo»",
    !/Empezar de cero|💾 Guardar|abre tu archivo/i.test(b.todo), (b.todo.match(/.{0,40}(Empezar de cero|💾 Guardar|abre tu archivo).{0,40}/i) || [])[0]);
  // El pie solo dice dónde se guarda.
  assert("el pie de la barra dice dónde se guarda (MENU-1)", /Datos solo en este navegador/.test(b.privacidad), b.privacidad);
  assert("el CSV se llama «de distribuciones de Reental» (T54)",
    /Archivo de rendimientos de Reental/.test(b.textos) && !/CSV de dividendos/.test(b.textos));

  /* ============ C) direcciones antiguas ============ */
  console.log("\nC) Direcciones antiguas");
  for (const [hash, ancla] of [["#sync", "arrPasoSync"], ["#clasificacion", "arrPasoSync"], ["#config", "arrDatos"]]) {  // #config baja a «Tus datos»
    await page.evaluate(() => { location.hash = "#dashboard"; }); await esperar(120);
    await page.evaluate(h => { location.hash = h; }, hash); await esperar(450);
    const r = await page.evaluate(id => { const el = document.getElementById(id);
      return { h: location.hash, v: (document.querySelector("section.view.active") || {}).id,
        oculta: el.hidden, top: Math.round(el.getBoundingClientRect().top), y: Math.round(window.scrollY),
        alto: window.innerHeight }; }, ancla);
    // «Tus datos» está arriba, en la única tarjeta: puede verse sin bajar (y = 0).
    assert(hash + " → Puesta en marcha" + (ancla === "arrPasoSync" ? "" : " y su sitio queda a la vista"),
      r.v === "view-inicio" && r.h === "#inicio" &&
      (r.oculta || ((r.y > 0 || ancla === "arrDatos") && r.top >= 0 && r.top < r.alto - 80)), r);
  }
  await page.evaluate(() => { location.hash = "#panel"; }); await esperar(200);
  assert("#panel heredado → Revisión", (await vistaActiva()) === "view-revision");
  await page.evaluate(() => { location.hash = "#inicio"; }); await esperar(200);

  /* ============ D) configuración en la tarjeta 1 ============ */
  console.log("\nD) Configuración («Tus datos»)");
  await page.type("#cfgWallet", W); await page.keyboard.press("Tab");
  await page.type("#cfgVault", V); await page.keyboard.press("Tab");
  await esperar(80);
  const d1 = await page.evaluate(() => ({ st: state.config.wallet, v: state.config.vault,
    ls: JSON.parse(localStorage.getItem("reental_config") || "{}") }));
  const d1f = await faltanAhora();
  assert("lo escrito pasa a state.config y se guarda solo en el navegador",
    d1.st === W && d1.v === V && d1.ls.vault === V && d1.ls.compra_bancaria_coste_eur_por_token === 100, d1);
  // Lo que falta de «Tus datos» es solo la API key.
  const d1d = d1f.find(x => /^Tus datos:/.test(x)) || "";
  assert("sin API key: «Tus datos» pide solo la API key", /API key/.test(d1d) && !/wallet/.test(d1d), d1f);

  /* ============ E) primera vez ============ */
  console.log("\nE) Primera vez: tus datos y «🔄 Actualizar» (ALMACEN-1)");
  await page.evaluate(instalarDobles);
  await limpiarToasts();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click("#arrPreparar"); await esperar(250);
  const e0 = await page.evaluate(() => ({ apagado: document.getElementById("arrPreparar").disabled, tx: arrNumTx(state.cache), orden: window.__orden.join(",") }));
  assert("sin API key «🔄 Actualizar» está apagado y no descarga nada", e0.apagado && e0.tx === 0 && e0.orden === "", e0);
  await page.type("#cfgEthKey", "TEST_SINTETICA"); await page.keyboard.press("Tab"); await esperar(80);
  await limpiarToasts();
  await page.evaluate(() => { window.__writes = 0; window.scrollTo(0, 0); });
  await page.click("#arrPreparar");
  await esperarFlujo(); await esperar(300);
  const e1 = await page.evaluate(() => ({
    orden: window.__orden.join(","), tx: arrNumTx(state.cache), registros: state.registros ?? null, dirty: state.cacheDirty, writes: window.__writes,
    fin: document.getElementById("arrFin").textContent.replace(/\s+/g, " "),
    cardSync: document.getElementById("arrPasoSync").hidden,
    linea: document.getElementById("arrArchivo").hidden ? "" : document.getElementById("arrNombreArchivo").textContent,
    copia: !document.getElementById("btnCopia").hidden, explica: !document.getElementById("arrExplica").hidden,
  }));
  const t1 = await toasts();
  const g1e = await guardado();
  assert("descarga sola (4 pasos)", e1.orden === "etherscan,bce,rnt,vault", e1.orden);
  assert("lo descargado queda guardado en este navegador", e1.tx === 4 && !e1.dirty && e1.writes > 0 &&
    g1e.claves.join() === "archivo" && g1e.cache && arrNumTxNodo(g1e.cache) === 4, { e1, claves: g1e.claves });
  assert("su línea «📄 4 transacciones · se guarda solo en este navegador» y «🗂️ Guardar copia»",
    e1.linea === "📄 4 transacciones · se guarda solo en este navegador" && e1.copia && !e1.explica, e1);
  assert("sin CSV no clasifica: espera con «Carga el archivo de rendimientos de Reental.»",
    e1.registros === null && /Carga el archivo de rendimientos de Reental\./.test(e1.fin), { reg: e1.registros, fin: e1.fin });
  assert("el resumen recuerda que aún no hay copia, con «guardar una copia»",
    /Aún no tienes ninguna copia\. guardar una copia/.test(e1.fin), e1.fin);
  assert("aparece la tarjeta de sincronización con el resumen", !e1.cardSync, e1);
  assert("modo silencioso: sin avisos flotantes de la sincronización", t1.length === 0, t1);

  /* ============ F) el CSV clasifica solo ============ */
  console.log("\nF) Cargar el CSV clasifica solo (T35/T47b)");
  await limpiarToasts();
  await page.evaluate(csv => { window.__orden = []; return cargarCsv(new File([csv], "reental_rendimientos.csv", { type: "text/csv" })); }, CSV);
  await esperarFlujo(); await esperar(100);
  const f = await page.evaluate(() => ({
    n: (state.registros || []).length, rev: (state.registros || []).filter(r => r.revisar).length,
    orden: window.__orden.join(","),
    fin: document.getElementById("arrFin").textContent.replace(/\s+/g, " "),
    // Lo que falta, la línea de tu archivo y la zona del CSV cargada.
    faltan: document.querySelectorAll("#arrFaltan .arr-falta:not(.ok)").length,
    archivo: document.getElementById("arrArchivo").hidden ? "" : document.getElementById("arrNombreArchivo").textContent,
    dz: document.getElementById("dzCsv").classList.contains("cargado") ? document.getElementById("dzTexto").textContent : "",
    faltaOk: (document.querySelector("#arrFaltan .arr-falta.ok") || {}).textContent || "",
    boton: !document.getElementById("arrPreparar").disabled,
  }));
  const tf = await toasts();
  assert("clasifica al cargar el CSV, sin pulsar nada y sin volver a descargar", f.n > 0 && f.orden === "", f);
  assert("resumen con la frase corta «✅ Todo listo.» (PM-6) y lo que hay por revisar en su botón",
    /(✅ Todo listo|⚠ Listo, con avisos)\./.test(f.fin) && f.fin.includes("Ir a Revisión" + (f.rev ? " (" + f.rev + ")" : "")), f.fin);
  assert("conserva lo que dijo la descarga: «4 nuevas»", /Transacciones: 4 nuevas \(4 en total\)/.test(f.fin), f.fin);
  assert("«📒 Ver transacciones» y «🔍 Ir a Revisión» en el resumen", /Ver transacciones/.test(f.fin) && /Ir a Revisión/.test(f.fin), f.fin);
  assert("nada falta y «🔄 Actualizar» activo", f.faltan === 0 && f.boton && /Actualizar/.test(f.faltaOk), f);
  assert("la tarjeta dice «📄 4 transacciones · se guarda solo en este navegador» y «✔ 1 reparto, hasta 10/06/2026 · cambiar»",
    f.archivo === "📄 4 transacciones · se guarda solo en este navegador" && f.dz === "✔ 1 reparto, hasta 10/06/2026 · cambiar", f);
  assert("solo el aviso de CSV cargado, ninguno de clasificación (silencioso)",
    tf.length === 1 && /Archivo de rendimientos cargado/.test(tf[0]), tf);
  await page.evaluate(() => { location.hash = "#transacciones"; }); await esperar(400);
  const filasTx = await page.evaluate(() => document.querySelectorAll("#txCuerpo tr.tx-fila").length);
  const nSpamTx = await page.evaluate(() => state.registros.filter(r => r.categoria === "SPAM").length);
  assert("📒 Transacciones ya muestra los registros (el spam, oculto por defecto)", filasTx === f.n - nSpamTx, { filasTx, n: f.n, spam: nSpamTx });
  await page.evaluate(() => { location.hash = "#inicio"; }); await esperar(200);

  /* ============ G) resumen único y «🔄 Actualizar» ============ */
  console.log("\nG) Resumen único (T35/T47d) y «🔄 Actualizar»");
  await page.evaluate(() => { window.__orden = []; window.__vault = { coincide: false, saldo_calculado_usdt: 10, saldo_onchain_usdt: 12.5, diferencia_usdt: -2.5 }; });
  await limpiarToasts();
  await page.click("#arrPreparar"); await esperarFlujo(); await esperar(100);
  const g1 = await page.evaluate(() => ({
    orden: window.__orden.join(","), dotVault: document.getElementById("dot-vault").className,
    lineas: [...document.querySelectorAll("#arrFin .arr-linea")].map(l => l.className + " " + l.textContent.replace(/\s+/g, " ")),
  }));
  assert("«🔄 Actualizar» vuelve a descargar (4 pasos) y a clasificar", g1.orden === "etherscan,bce,rnt,vault", g1.orden);
  assert("vault que NO cuadra: indicador en ámbar, no en verde (T47d)", /warn/.test(g1.dotVault) && !/\bok\b/.test(g1.dotVault), g1.dotVault);
  assert("…y el resumen lo dice con las cifras",
    g1.lineas.some(l => /warn/.test(l) && /NO cuadra/.test(l) && /10,00 USDT/.test(l) && /12,50 USDT/.test(l) && /-2,50/.test(l)), g1.lineas);
  assert("transacciones: nada nuevo", g1.lineas.some(l => /Transacciones: nada nuevo \(4 en total\)/.test(l)), g1.lineas);
  // Sin la línea «Guardado en…»: ya lo dice la línea de tu archivo.
  await page.evaluate(() => { window.__vault = { coincide: true, saldo_calculado_usdt: 12.5, saldo_onchain_usdt: 12.5, diferencia_usdt: 0 }; });
  await page.click("#arrPreparar"); await esperarFlujo(); await esperar(100);
  const g2 = await page.evaluate(() => ({ dotVault: document.getElementById("dot-vault").className,
    fin: document.getElementById("arrFin").textContent.replace(/\s+/g, " ") }));
  assert("vault que cuadra: verde y «el saldo cuadra (12,50 USDT)»", /\bok\b/.test(g2.dotVault) && /el saldo cuadra \(12,50 USDT\)/.test(g2.fin), g2);
  await page.evaluate(() => { window.__falla = "bce"; });
  await page.click("#arrPreparar"); await esperarFlujo(); await esperar(100);
  const g3 = await page.evaluate(() => ({ fin: document.getElementById("arrFin").textContent.replace(/\s+/g, " "),
    n: (state.registros || []).length, registroAbierto: document.getElementById("arrRegistro").open }));
  assert("si falla un paso, el resumen lo dice y aun así clasifica con lo que hay",
    /La descarga falló en: bce/.test(g3.fin) && g3.n > 0, g3);
  assert("el error abre solo el registro técnico (T40)", g3.registroAbierto, g3);
  await page.evaluate(() => { window.__falla = null; document.getElementById("arrRegistro").open = false; });
  assert("tras el fallo, sin avisos flotantes salvo el de error",
    (await toasts()).every(t => !/Sincronización completa|Clasificación completada/.test(t)), await toasts());
  await page.screenshot({ path: path.join(OUT, "cap_ui7d_resumen.png"), fullPage: true });

  /* ============ H) datos viejos ============ */
  console.log("\nH) Abrir otra copia o cargar otro CSV borra lo anterior (T47a)");
  await page.evaluate(() => { window.__sinNuevas = true; window.__abrir = cacheVacia(); });
  // Otra copia se abre con «📂 Abrir copia» (con datos, pregunta: «sí»). Arriba del
  // todo: tras el flujo la página bajó al resumen.
  await page.evaluate(() => window.scrollTo(0, 0));
  responderSi = true;
  await page.click("#btnAbrirArchivo"); await esperar(200); await esperarFlujo(); await esperar(150);
  responderSi = false;
  await page.evaluate(() => { location.hash = "#transacciones"; }); await esperar(400);
  // Los rendimientos salen del CSV aunque la cache esté vacía:
  // queda solo lo que dice el CSV cargado, nada de la clasificación anterior.
  const h1 = await page.evaluate(() => ({ n: (state.registros || []).length,
    soloCsv: (state.registros || []).every(r => r.categoria === "RENDIMIENTO" && r.fuente === "CSV_REENTAL"),
    filasCsv: state.filasCsv.length,
    filas: document.querySelectorAll("#txCuerpo tr.tx-fila").length, tx: arrNumTx(state.cache) }));
  // Tampoco el archivo de Reental del archivo anterior (la vacía no trae).
  assert("abrir otra copia (vacía): Transacciones ya no enseña la clasificación anterior ni el archivo de Reental del otro",
    h1.n === 0 && h1.filasCsv === 0 && h1.filas === 0 && h1.tx === 0, h1);
  await page.evaluate(() => { location.hash = "#inicio"; window.__sinNuevas = false; }); await esperar(150);
  // vuelve una cache con datos para lo que sigue
  await page.evaluate(() => { state.cache.transacciones.wallet_tokens = []; });
  await page.evaluate(csv => cargarCsv(new File([csv], "de_esta.csv", { type: "text/csv" })), CSV); await esperarFlujo();
  await page.click("#arrPreparar"); await esperarFlujo(); await esperar(100);
  const nBase = await page.evaluate(() => (state.registros || []).length);
  // Un CSV que no se puede clasificar (wallet a medio escribir) deja la vista vacía, no con lo viejo.
  await page.evaluate(() => { const w = document.getElementById("cfgWallet"); w.value = "0x1234"; w.dispatchEvent(new Event("change")); });
  await esperar(150);
  const h2 = await page.evaluate(() => (state.registros || []).length);
  await page.evaluate(csv => cargarCsv(new File([csv], "otro.csv", { type: "text/csv" })), CSV);
  await esperar(250);
  const h3 = await page.evaluate(() => ({ reg: state.registros,
    fin: document.getElementById("arrFin").textContent.replace(/\s+/g, " ") }));
  assert("con datos: " + nBase + " registros; una wallet a medio escribir NO reclasifica (T47b)", nBase > 0 && h2 === nBase, { nBase, h2 });
  assert("cargar otro CSV sin poder clasificar borra la clasificación vieja y pide la wallet",
    h3.reg === null && /Completa tu dirección de wallet \(tus datos\)/.test(h3.fin), h3);

  /* ============ I) clasificación automática ============ */
  console.log("\nI) Clasificación automática (T47b)");
  const setCampo = (id, valor) => page.evaluate((i, v) => { const el = document.getElementById(i); el.value = v; el.dispatchEvent(new Event("change")); }, id, valor);
  await setCampo("cfgWallet", W); await esperarFlujo(); await esperar(200);
  const i1 = await page.evaluate(() => { window.__ref = state.registros; return (state.registros || []).length; });
  assert("wallet válida otra vez → clasifica sola", i1 > 0, i1);
  await setCampo("cfgNif", "00000000T"); await esperar(200);
  assert("cambiar el NIF no reclasifica (no cambia el resultado)", await page.evaluate(() => state.registros === window.__ref));
  await setCampo("cfgVault", "0xabc"); await esperar(200);
  assert("vault a medio escribir no reclasifica", await page.evaluate(() => state.registros === window.__ref));
  await setCampo("cfgVault", ""); await esperarFlujo(); await esperar(200);
  assert("vault vacío (es opcional) sí reclasifica", await page.evaluate(() => state.registros !== window.__ref && state.registros.length > 0));
  await setCampo("cfgVault", V); await esperarFlujo(); await esperar(200);
  await setCampo("cfgWallet", W2); await esperarFlujo(); await esperar(200);
  assert("otra wallet válida reclasifica", await page.evaluate(() => state.registros !== window.__ref && Array.isArray(state.registros)));
  await setCampo("cfgWallet", W); await esperarFlujo(); await esperar(200);
  // decidir un token en el catálogo
  const i2 = await page.evaluate(async () => {
    const cat = state.cache.catalogo_propiedades;
    if (!Object.keys(cat).length) cat["0x" + "a1".repeat(20)] = { nombre_etherscan: "Reental Prueba Alcazaba 1", simbolo: "RALC1", estado: "CONFIRMADA", via: "arnes", refuerzos: [] };
    renderPanel();
    window.__ref = state.registros;
    // El catálogo se decide con botones, sin desplegable.
    const boton = document.querySelector('#tablaCatalogo button[data-estado="DESCARTADA"]');
    boton.click();
    await new Promise(r => setTimeout(r, 250));
    return { hay: !!boton, cambia: state.registros !== window.__ref, n: state.registros.length };
  });
  assert("decidir un token del catálogo reclasifica sola", i2.hay && i2.cambia, i2);
  const i3 = await page.evaluate(async () => {
    window.__ref = state.registros;
    document.getElementById("toasts").innerHTML = "";
    document.getElementById("txtAjustes").value = "{}";
    document.getElementById("btnAplicarAjustes").click();
    await new Promise(r => setTimeout(r, 250));
    return { cambia: state.registros !== window.__ref,
      toasts: [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent) };
  });
  // «Ajustes aplicados: N.» sin «Clasificación actualizada».
  assert("aplicar ajustes reclasifica y lo dice", i3.cambia && i3.toasts.some(t => /^Ajustes aplicados: \d+\.$/.test(t)), i3);

  /* ============ J) registro plegado ============ */
  console.log("\nJ) Registro técnico (T40)");
  const j = await page.evaluate(() => {
    const d = document.getElementById("arrRegistro");
    d.open = false; log("aviso de prueba", "warn");
    const trasAviso = d.open;
    log("error de prueba", "error");
    const trasError = d.open;
    d.open = false;
    return { trasAviso, trasError };
  });
  assert("un aviso no lo abre; un error sí", !j.trasAviso && j.trasError, j);

  /* ============ K) recordar entre visitas ============ */
  console.log("\nK) Recordar entre visitas (T47g, ALMACEN-1)");
  await esperar(300);
  const k0 = await page.evaluate(() => ({ tx: arrNumTx(state.cache), n: (state.registros || []).length }));
  const g0 = await guardado();
  const csvDentro = await page.evaluate(c => (leerArchivoRendimientosCache(c) || {}).texto, g0.cache);
  assert("el CSV cargado va dentro de lo guardado, no aparte", g0.claves.join() === "archivo" && csvDentro === CSV, g0.claves);
  const redAntes = red;
  await page.reload({ waitUntil: "networkidle0" });
  await esperarCarga();
  const k1 = await page.evaluate(() => ({ tx: arrNumTx(state.cache), n: (state.registros || []).length, csv: state.csvCargado,
    repartos: (state.filasCsv || []).length, wallet: state.config.wallet,
    dz: document.getElementById("dzCsv").classList.contains("cargado") ? document.getElementById("dzTexto").textContent : "",
    linea: document.getElementById("arrArchivo").hidden ? "" : document.getElementById("arrNombreArchivo").textContent,
    descargo: document.getElementById("consola").textContent.includes("=== Actualizar") }));
  assert("F5: sale lo guardado en este navegador (transacciones, tus datos y su línea)",
    k1.tx === k0.tx && k1.tx > 0 && k1.wallet === W && k1.linea === "📄 " + k0.tx + " transacciones · se guarda solo en este navegador", { k0, k1 });
  assert("y el archivo de Reental de dentro, ya cargado", k1.csv && k1.repartos === 1 && /^✔ 1 reparto/.test(k1.dz), k1);
  assert("clasifica sola con lo guardado", k1.n === k0.n && k1.n > 0, { k0, k1 });
  assert("sin descargar nada", !k1.descargo && red === redAntes, { descargo: k1.descargo, red: red - redAntes });

  /* ============ L) móvil, oscuro, consola ============ */
  console.log("\nL) Móvil, modo oscuro y consola");
  await page.evaluate(() => { location.hash = "#inicio"; document.getElementById("toasts").innerHTML = ""; window.scrollTo(0, 0); }); await esperar(200);
  await page.evaluate(() => document.body.classList.add("dark")); await esperar(250);
  await page.screenshot({ path: path.join(OUT, "cap_ui7d_oscuro.png"), fullPage: true });
  await page.evaluate(() => document.body.classList.remove("dark"));
  await page.setViewport({ width: 390, height: 844 }); await esperar(300);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert("móvil (390 px): sin desbordamiento horizontal", m.sw <= m.cw + 1, m);
  await page.screenshot({ path: path.join(OUT, "cap_ui7d_movil.png"), fullPage: false });
  const vistas = await page.evaluate(async () => {
    const ids = [...document.querySelectorAll("section.view")].map(s => s.id.replace("view-", ""));
    const res = [];
    for (const id of ids) { location.hash = "#" + id; await new Promise(r => setTimeout(r, 60)); res.push(document.getElementById("view-" + id).classList.contains("active")); }
    return { n: ids.length, todas: res.every(Boolean) };
  });
  assert("8 vistas y todas enrutan", vistas.n === 8 && vistas.todas, vistas);
  assert("ninguna petición de red fuera de localhost", red === 0, urlsRed);
  await page.evaluate(async () => { await new Promise(r => { const p = indexedDB.deleteDatabase("reental_spa"); p.onsuccess = p.onerror = p.onblocked = () => r(); }); });
  await browser.close();
  assert("0 errores de consola", errores().length === 0, errores());
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
