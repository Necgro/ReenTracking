/* Verificación headless de 🔍 Revisión (catálogo con botones,
 * direcciones que la app reconoce editables, bloques plegables y contador del menú):
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS 100 %
 * SINTÉTICOS: un inmueble confirmado, uno con dudas, otro con dudas cuyo
 * token está en el spam entero y una salida de RNT a una dirección que no
 * se conoce. Capturas cap_ui3_*.png.
 *
 *  U1) los cinco bloques cerrados, salvo el catálogo (hay uno con dudas),
 *      con su aviso; los precios de RNT se abren solos si falta una fecha.
 *  U2) catálogo: el token en el spam no sale; ningún desplegable de
 *      estado; «Descartar» con su burbuja.
 *  U3) «✔ Confirmar» reclasifica y guarda; «🚫 Descartar» manda todo el
 *      token al spam (sale del catálogo, sin «Descartados») y su ↩ de 📒 lo
 *      devuelve con dudas: misma huella que al principio (P8).
 *  U3b) P4: en la tarjeta de 🔍 del token con dudas, «🏠 Es un inmueble» lo
 *      confirma como el catálogo; «Descartar» y ↩ lo devuelven.
 *  U4) contratos: una dirección mal escrita no se guarda; una buena sale con
 *      su ✕ y reclasifica; quitarla devuelve la huella de antes. Las
 *      semillas también tienen ✕, con su aviso: lo que movía
 *      queda a revisar, sale en «Quitadas» y «↩ Volver a poner» devuelve la
 *      huella de antes.
 *  U5) el número del menú es el de «movimientos por decidir».
 *  U6) 1366 px sin scroll, 375 px sin scroll de página, oscuro; las filas
 *      se resaltan y la letra tenue se lee; 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyui3.js
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
  const dialogos = [];
  page.on("dialog", d => { dialogos.push(d.message()); d.accept(); });

  function montar() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), T = "0x" + "77".repeat(20), X = "0x" + "88".repeat(20);
    const P1 = "0x" + "a1".repeat(20), P3 = "0x" + "a3".repeat(20), P4 = "0x" + "a4".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = {
      [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1", primera_aparicion: "2024-09-17", refuerzos: ["nombre_csv"] },
      [P3]: { estado: "CANDIDATA", nombre_etherscan: "Reental Prueba Dudosa 3", simbolo: "RDUD3", primera_aparicion: "2025-02-01", refuerzos: [] },
      [P4]: { estado: "CANDIDATA", nombre_etherscan: "Reental Prueba Spam 4", simbolo: "RSPM4", primera_aparicion: "2025-03-01", refuerzos: [] },
    };
    cache.spam_usuario = { direcciones: {}, tokens: { [P4]: { nota: "Mandado al spam por ti (sintético)" } } };
    const leg = (h, contrato, unidades, name, sym, t, blk, from, to) => ({
      blockNumber: blk, timeStamp: t, hash: h, from: from || T, to: to || W, contractAddress: contrato,
      value: tok18(unidades), tokenName: name, tokenSymbol: sym, tokenDecimal: "18",
    });
    cache.transacciones.wallet_tokens.push(
      leg(Hh(1), P1, 4, "Reental Prueba Alcazaba 1", "RALC1", ts(2024, 9, 17, 9), "50"),
      leg(Hh(2), P3, 3, "Reental Prueba Dudosa 3", "RDUD3", ts(2025, 2, 1, 9), "60"),
      leg(Hh(3), P4, 7, "Reental Prueba Spam 4", "RSPM4", ts(2025, 3, 1, 9), "70"),
      leg(Hh(4), RNT, 12, "Reental", "RNT", ts(2025, 4, 1, 9), "80", W, X),
      leg(Hh(5), RNT, 4, "Reental", "RNT", ts(2025, 5, 1, 9), "90", W, "0x03e2ca2d684049ea8bfa87e078377980f543b6e3"));   // al pool que trae la app
    cache.precios_rnt = { "2025-04-01": 0.5, "2025-05-01": 0.5 };
    state.cache = cache;
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
  }

  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montar);
  await page.evaluate(() => { ejecutarClasificacion(); renderPanel(); });
  await esperar(600);

  const huella = () => page.evaluate(() => JSON.stringify(state.registros.map(r =>
    [r.clave, r.categoria, r.subcategoria, r.revisar, r.cantidad, r.inmueble, r.nota])));
  const escrituras = () => page.evaluate(() => window.__writes.length);
  const ultimoAviso = () => page.evaluate(() => { const t = [...document.querySelectorAll("#toasts .toast")].pop(); return t ? t.textContent : ""; });
  const catalogo = (tabla = "tablaCatalogo") => page.evaluate(t => [...document.querySelectorAll("#" + t + " tr[data-addr]")].map(tr => ({
    simbolo: tr.children[1].textContent, estado: tr.querySelector(".badge").textContent,
    botones: [...tr.querySelectorAll("button")].map(b => b.firstChild.textContent),
  })), tabla);
  const pulsarCatalogo = async (simbolo, estado) => {
    await page.evaluate((s, e) => {
      const tr = [...document.querySelectorAll("#rvCatalogo tr[data-addr]")].find(x => x.children[1].textContent === s);
      tr.querySelector('button[data-estado="' + e + '"]').click();
    }, simbolo, estado);
    await esperar(300);
  };
  const h0 = await huella();

  /* ============ U1) plegables ============ */
  const u1 = await page.evaluate(() => Object.fromEntries(["rvCatalogo", "rvPreciosRnt", "rvPreciosPol", "rvContratos", "rvAjustes"]
    .map(id => [id, document.getElementById(id).open])));
  assert("U1 -> abierto solo el catálogo (hay uno con dudas)",
    u1.rvCatalogo && !u1.rvPreciosRnt && !u1.rvPreciosPol && !u1.rvContratos && !u1.rvAjustes, u1);
  const aviso = await page.evaluate(() => [document.getElementById("rvCatalogoAviso").textContent,
    getComputedStyle(document.getElementById("rvPreciosRntAviso")).display, document.getElementById("rvRntFaltantes").hidden]);
  assert("U1 -> «⚠ 1 con dudas» en el catálogo; sin aviso ni tabla de fechas sin precio", aviso[0] === "⚠ 1 con dudas" && aviso[1] === "none" && aviso[2], aviso);
  await page.evaluate(() => { state.cache.precios_rnt_no_disponibles = { "2023-01-05": "fuera de los 365 días" }; renderPanel(); });
  const faltan = await page.evaluate(() => [document.getElementById("rvPreciosRnt").open, document.getElementById("rvPreciosRntAviso").textContent,
    document.getElementById("rvRntFaltantes").hidden, document.querySelectorAll("#tablaPreciosRntFaltantes tr").length]);
  assert("U1 -> con una fecha sin precio, los precios de RNT se abren con su aviso y su fila", faltan[0] && faltan[1] === "⚠ 1 sin precio" && !faltan[2] && faltan[3] === 1, faltan);
  const enlace = await page.evaluate(() => {
    const a = document.querySelector("#tablaPreciosRntFaltantes a");
    return a ? { href: a.href, texto: a.textContent, nueva: a.target === "_blank" } : null;
  });
  assert("U1 -> la fecha enlaza a su precio en CoinGecko; sin formulario libre",
    enlace && enlace.href === "https://www.coingecko.com/en/coins/reental/historical_data?start=2023-01-05&end=2023-01-05" &&
    enlace.texto === "05/01/2023 ↗" && enlace.nueva && !(await page.$("#btnAddPrecioRnt")), enlace);
  await page.evaluate(() => { document.getElementById("rvPreciosRnt").open = false; renderPanel(); });
  const sigueCerrado = await page.evaluate(() => document.getElementById("rvPreciosRnt").open);
  assert("U1 -> si lo cierras, no se vuelve a abrir solo", !sigueCerrado);
  await page.evaluate(() => { state.cache.precios_rnt_no_disponibles = {}; renderPanel(); });

  /* ============ U2) catálogo ============ */
  const c0 = await catalogo();
  assert("U2 -> dos filas, en orden, con su estado en llano; el token del spam no sale",
    JSON.stringify(c0.map(f => [f.simbolo, f.estado])) === JSON.stringify([["RALC1", "Inmueble"], ["RDUD3", "Con dudas"]]), c0);
  assert("U2 -> el de dudas, Confirmar y Descartar; sin plegable de descartados (P8)",
    JSON.stringify(c0[1].botones) === JSON.stringify(["✔ Confirmar", "🚫 Descartar"]) &&
    !(await page.$("#rvDescartados")), c0);
  const burbuja = await page.evaluate(async () => {
    const b = document.querySelector('#tablaCatalogo button[data-estado="DESCARTADA"]');
    b.focus();
    const bb = b.querySelector(".rv-burbuja");
    return { texto: bb.textContent };
  });
  await page.hover('#tablaCatalogo button[data-estado="DESCARTADA"]');
  await esperar(150);
  const verBurbuja = await page.evaluate(() => {
    const bb = document.querySelector('#tablaCatalogo button[data-estado="DESCARTADA"] .rv-burbuja');
    const r = bb.getBoundingClientRect();
    return { display: getComputedStyle(bb).display, dentro: r.top >= 0 && r.left >= 0 && r.right <= window.innerWidth };
  });
  assert("U2 -> «Descartar» con su burbuja al pasar el ratón, entera a la vista",
    /pasa a spam/.test(burbuja.texto) && verBurbuja.display === "block" && verBurbuja.dentro, [burbuja, verBurbuja]);
  await page.screenshot({ path: path.join(OUT, "cap_ui3_burbuja.png") });
  await page.mouse.move(5, 5);
  const selects = await page.evaluate(() => document.querySelectorAll("#tablaCatalogo select").length);
  assert("U2 -> sin desplegable de estado (W13)", selects === 0);
  await page.evaluate(() => document.getElementById("rvCatalogo").scrollIntoView({ block: "start" }));
  await page.screenshot({ path: path.join(OUT, "cap_ui3_catalogo.png") });

  /* ============ U3) confirmar y deshacer ============ */
  const w0 = await escrituras();
  await pulsarCatalogo("RDUD3", "CONFIRMADA");
  const u3 = await page.evaluate(() => ({
    estado: state.cache.catalogo_propiedades["0x" + "a3".repeat(20)].estado,
    inmueble: state.registros.some(r => r.simbolo === "RDUD3" && r.inmueble),
    aviso: document.getElementById("rvCatalogoAviso").textContent,
  }));
  assert("U3 -> «Confirmar»: guardado, reclasificado (ya es inmueble) y sin aviso",
    u3.estado === "CONFIRMADA" && u3.inmueble && u3.aviso === "" && (await escrituras()) > w0, u3);
  assert("U3 -> el aviso dice el nuevo estado", /Prueba Dudosa 3 → Inmueble/.test(await ultimoAviso()));
  const descartarYDevolver = async etiqueta => {
    await pulsarCatalogo("RDUD3", "DESCARTADA");
    const desc = await page.evaluate(() => {
      const P3 = "0x" + "a3".repeat(20), r = state.registros.find(x => x.simbolo === "RDUD3");
      return { estado: state.cache.catalogo_propiedades[P3].estado, spam: !!state.cache.spam_usuario.tokens[P3],
        lista: document.querySelectorAll("#tablaCatalogo tr[data-addr]").length, categoria: r.categoria, clave: r.clave,
        regla: !!txReglaSpam(r, construirContexto(state.cache)) };
    });
    assert(etiqueta + " -> «Descartar»: todo el token al spam, fuera del catálogo y con su ↩ en 📒",
      desc.estado === "CANDIDATA" && desc.spam && desc.lista === 1 && desc.categoria === "SPAM" && desc.regla &&
      /^Token mandado al spam: 1 movimiento\./.test(await ultimoAviso()), [desc, await ultimoAviso()]);
    await page.evaluate(k => txQuitarRegla(k), desc.clave);
    await esperar(300);
    const c1 = await catalogo();
    assert(etiqueta + " -> su ↩ de 📒 lo devuelve con dudas, con la misma huella",
      c1.length === 2 && c1[1].estado === "Con dudas" && (await huella()) === h0, c1);
  };
  await descartarYDevolver("U3");

  /* ============ U3b) P4: «Es un inmueble» en la tarjeta ============ */
  const tarjeta = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#ccLista button[data-accion="decidir"][data-opcion="inmueble"]')];
    return { n: b.length, texto: b[0] && b[0].textContent };
  });
  assert("U3b -> la tarjeta del token con dudas trae «🏠 Es un inmueble» (solo esa)",
    tarjeta.n === 1 && /🏠 Es un inmueble/.test(tarjeta.texto), tarjeta);
  await page.click('#ccLista button[data-accion="decidir"][data-opcion="inmueble"]');
  await esperar(300);
  const u3b = await page.evaluate(() => ({
    estado: state.cache.catalogo_propiedades["0x" + "a3".repeat(20)].estado,
    inmueble: state.registros.some(r => r.simbolo === "RDUD3" && r.inmueble),
    boton: !!document.querySelector('#ccLista button[data-opcion="inmueble"]'),
  }));
  assert("U3b -> lo confirma como el catálogo (reclasificado) y el botón se va",
    u3b.estado === "CONFIRMADA" && u3b.inmueble && !u3b.boton && /Prueba Dudosa 3 → Inmueble/.test(await ultimoAviso()), u3b);
  await descartarYDevolver("U3b");

  /* ============ U4) contratos ============ */
  await page.evaluate(() => { document.getElementById("rvContratos").open = true; });
  const semillas = await page.evaluate(() => ({
    filas: document.querySelectorAll("#tablaContratos tr[data-addr]").length,
    quitar: document.querySelectorAll("#tablaContratos button[data-rol]").length,
    tipos: [...document.querySelectorAll("#selContratoTipo option")].map(o => o.textContent),
  }));
  assert("U4 -> las semillas DeFi, con ✕; tipos en llano y sin los de Reental",
    semillas.filas === 6 && semillas.quitar === 6 &&
    JSON.stringify(semillas.tipos) === JSON.stringify(["Pool", "Staking", "Farming", "Recompensas", "Infraestructura"]), semillas);
  const w1 = await escrituras();
  await page.evaluate(() => { document.getElementById("inpContratoDir").value = "0x1234"; document.getElementById("inpContratoNombre").value = "Mal"; document.getElementById("btnAddContrato").click(); });
  await esperar(200);
  assert("U4 -> una dirección mal escrita no se guarda y lo dice",
    (await escrituras()) === w1 && /0x y 40/.test(await ultimoAviso()));
  await page.evaluate(() => {
    document.getElementById("inpContratoDir").value = "0x" + "88".repeat(20);
    document.getElementById("inpContratoNombre").value = "Pool sintético";
    document.getElementById("selContratoTipo").value = "DEFI_POOL";
    document.getElementById("btnAddContrato").click();
  });
  await esperar(300);
  const u4 = await page.evaluate(() => ({
    cache: state.cache.contratos_aprendidos.DEFI_POOL["0x" + "88".repeat(20)],
    quitar: document.querySelectorAll("#tablaContratos button[data-rol]").length,
    campos: document.getElementById("inpContratoDir").value + document.getElementById("inpContratoNombre").value,
  }));
  assert("U4 -> añadido: en la cache, con su ✕ y los campos vacíos", u4.cache === "Pool sintético" && u4.quitar === 7 && u4.campos === "", u4);
  assert("U4 -> reclasifica (la salida de RNT a ese contrato cambia)", (await huella()) !== h0);
  await page.screenshot({ path: path.join(OUT, "cap_ui3_contratos.png") });
  await page.evaluate(() => document.querySelector('#tablaContratos button[data-addr="0x' + "88".repeat(20) + '"]').click());
  await esperar(300);
  const quitado = await page.evaluate(() => !("0x" + "88".repeat(20) in state.cache.contratos_aprendidos.DEFI_POOL));
  assert("U4 -> quitarlo lo borra y devuelve la huella de antes", quitado && (await huella()) === h0);
  // Una semilla: el aviso dice que viene con la app; queda apuntada y, al
  // volver a añadirla con su tipo, todo queda como al principio.
  const POOL = "0x03e2ca2d684049ea8bfa87e078377980f543b6e3";
  dialogos.length = 0;
  await page.evaluate(p => document.querySelector('#tablaContratos button[data-addr="' + p + '"]').click(), POOL);
  await esperar(300);
  const sinSemilla = await page.evaluate(p => ({
    fuera: !(p in state.cache.contratos_aprendidos.DEFI_POOL),
    lista: state.cache.semillas_quitadas,
    reabierta: !(p in asegurarEstructuraCache(JSON.parse(JSON.stringify(state.cache))).contratos_aprendidos.DEFI_POOL),
    alPool: state.registros.filter(r => r.destino === p).map(r => [r.revisar, r.nota]),
    quitadas: document.getElementById("rvSemillasQuitadas").hidden ? null : document.getElementById("nSemillasQuitadas").textContent,
    boton: !!document.querySelector('#tablaSemillasQuitadas button[data-volver="' + p + '"]'),
  }), POOL);
  assert("U4 -> semilla: aviso de que viene con la app; sale, queda apuntada y no vuelve al abrir",
    dialogos[0] === "«Pool RNT/USDT» viene con la app. ¿Seguro que quieres quitarla?" && sinSemilla.fuera &&
    JSON.stringify(sinSemilla.lista) === JSON.stringify([POOL]) && sinSemilla.reabierta, [dialogos, sinSemilla]);
  assert("U4 -> lo que iba al pool queda a revisar, con su nota, y la huella cambia",
    sinSemilla.alPool.length === 1 && sinSemilla.alPool[0][0] === true && /dirección de la app que quitaste/.test(sinSemilla.alPool[0][1]) &&
    (await huella()) !== h0, sinSemilla.alPool);
  assert("U4 -> sale en «Quitadas (1)» con «↩ Volver a poner»", sinSemilla.quitadas === "1" && sinSemilla.boton, sinSemilla);
  await page.evaluate(p => document.querySelector('#tablaSemillasQuitadas button[data-volver="' + p + '"]').click(), POOL);
  await esperar(300);
  const vuelta = await page.evaluate(p => ({
    nombre: state.cache.contratos_aprendidos.DEFI_POOL[p], lista: "semillas_quitadas" in state.cache,
    oculta: document.getElementById("rvSemillasQuitadas").hidden,
  }), POOL);
  assert("U4 -> «↩ Volver a poner»: con su nombre, sin lista, «Quitadas» se oculta y la huella de antes",
    vuelta.nombre === "Pool RNT/USDT" && !vuelta.lista && vuelta.oculta && (await huella()) === h0, vuelta);

  /* ============ U5) contador del menú ============ */
  const u5 = await page.evaluate(() => {
    const n = document.getElementById("ccNavRevision"), cab = document.querySelector("#ccLista .cc-cab b");
    return { n: n.textContent, oculto: n.hidden, cab: cab ? cab.textContent : null };
  });
  assert("U5 -> el número del menú es el de «movimientos por decidir»", !u5.oculto && u5.n === u5.cab && Number(u5.n) > 0, u5);

  const sinFiltros = await page.evaluate(() => !document.getElementById("ccFiltros") && !document.getElementById("ccFiltroPendientes"));
  assert("U5 -> Revisión sin barra de filtros", sinFiltros);
  const nombres = await page.evaluate(() => [document.querySelector("#ccResueltos summary").textContent, document.querySelector("#rvContratos summary").textContent]);
  assert("U5 -> nombres nuevos: «Movimientos ya decididos» y «Direcciones que la app reconoce»",
    /^✅ Movimientos ya decididos \(\d+\)$/.test(nombres[0]) && /^🧭 Direcciones que la app reconoce \(\d+\)$/.test(nombres[1]), nombres);

  await page.evaluate(() => { document.getElementById("rvCatalogo").open = false; document.getElementById("rvPreciosRnt").open = false; arrIrAlCatalogo(); irAFechasSinPrecio(); });
  await esperar(400);
  const saltos = await page.evaluate(() => [document.getElementById("rvCatalogo").open, document.getElementById("rvPreciosRnt").open]);
  assert("U5 -> «ir al catálogo» y «ir a las fechas» de Puesta en marcha abren su bloque", saltos[0] && saltos[1], saltos);

  /* ============ U5a) los avisos cuentan lo mismo que el catálogo ============ */
  const avisosDudas = () => page.evaluate(() => {
    document.querySelectorAll("#toasts .toast").forEach(t => t.remove());
    descubrimientoAntesDeClasificar(false);
    const t = [...document.querySelectorAll("#toasts .toast")].map(x => x.textContent).find(x => /con dudas/.test(x)) || "";
    return { resumen: arrDatosResumen().candidatas, aviso: (t.match(/^(\d+) token/) || [])[1] || "0" };
  });
  const a1 = await avisosDudas();
  assert("U5a -> el resumen de Puesta en marcha y el aviso cuentan 1 (sin el token del spam)", a1.resumen === 1 && a1.aviso === "1", a1);

  /* ============ U5b) sacar el token del spam y volver a mandarlo ============
     Con las mismas funciones que el ↩ y «Todo el token» de 📒 Transacciones
     (el catálogo sigue el flujo normal). */
  const P4 = "0x" + "a4".repeat(20);
  const claveP4 = await page.evaluate(() => state.registros.find(r => r.simbolo === "RSPM4").clave);
  await page.evaluate(c => txQuitarRegla(c), claveP4);
  await esperar(400);
  const fuera = await page.evaluate(p => ({
    bloque: !!(state.cache.spam_usuario && state.cache.spam_usuario.tokens && state.cache.spam_usuario.tokens[p]),
    categoria: state.registros.find(r => r.simbolo === "RSPM4").categoria,
    aviso: document.getElementById("rvCatalogoAviso").textContent,
  }), P4);
  const cFuera = (await catalogo()).find(f => f.simbolo === "RSPM4");
  assert("U5b -> fuera del spam: vuelve a «Con dudas» con Confirmar y Descartar, y el aviso cuenta 2",
    !fuera.bloque && fuera.categoria !== "SPAM" && cFuera.estado === "Con dudas" &&
    JSON.stringify(cFuera.botones) === JSON.stringify(["✔ Confirmar", "🚫 Descartar"]) && fuera.aviso === "⚠ 2 con dudas", [fuera, cFuera]);
  const a2 = await avisosDudas();
  assert("U5b -> fuera del spam, el resumen y el aviso cuentan 2", a2.resumen === 2 && a2.aviso === "2", a2);
  await page.evaluate((c, p) => txApartar(c, "tokens", { token: p }), claveP4, P4);
  await esperar(400);
  const cDentro = (await catalogo()).find(f => f.simbolo === "RSPM4");
  assert("U5b -> otra vez al spam: desaparece del catálogo, el aviso vuelve a 1 y la huella a la de antes",
    !cDentro &&
    (await page.evaluate(() => document.getElementById("rvCatalogoAviso").textContent)) === "⚠ 1 con dudas" &&
    (await huella()) === h0, cDentro);

  /* ============ U6) anchos, oscuro y errores ============ */
  await page.evaluate(() => ["rvCatalogo", "rvPreciosRnt", "rvPreciosPol", "rvContratos", "rvAjustes"].forEach(id => { document.getElementById(id).open = true; }));
  await esperar(150);
  const ancho = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert("U6 -> a 1366 px, todo abierto, sin scroll horizontal", await ancho());
  await page.setViewport({ width: 375, height: 812 });
  await esperar(300);
  assert("U6 -> a 375 px, sin scroll horizontal de la página", await ancho());
  const navMovil = await page.evaluate(() => getComputedStyle(document.getElementById("ccNavRevision")).position);
  assert("U6 -> en el móvil, el número va junto al nombre", navMovil === "static", navMovil);
  await page.setViewport({ width: 1000, height: 900 });
  await esperar(200);
  const rail = await page.evaluate(() => {
    const n = document.getElementById("ccNavRevision").getBoundingClientRect(), a = document.querySelector('a[href="#revision"]').getBoundingClientRect();
    return n.width > 0 && n.right <= a.right + 1 && n.top >= a.top - 1;
  });
  assert("U6 -> con el menú de iconos, el número sigue a la vista dentro del botón", rail);
  await page.setViewport({ width: 1366, height: 900 });
  // La fila bajo el ratón cambia de color y la letra
  // tenue se lee sobre las tarjetas (contraste AA, 4,5), en los dos temas.
  const colores = () => page.evaluate(async () => {
    const fila = document.querySelector("#tablaContratos tr");
    fila.scrollIntoView({ block: "center" });
    const r = fila.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + r.height / 2, normal: getComputedStyle(document.getElementById("rvContratos")).backgroundColor };
  });
  const contraste = () => page.evaluate(() => {
    const css = getComputedStyle(document.body);
    const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const a = lum(css.getPropertyValue("--faint").trim()), b = lum(css.getPropertyValue("--tarjeta").trim());
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  for (const tema of ["claro", "oscuro"]) {
    if (tema === "oscuro") await page.evaluate(() => document.body.classList.add("dark"));
    const c = await colores();
    await page.mouse.move(c.x, c.y);
    await esperar(200);
    const encima = await page.evaluate(() => getComputedStyle(document.querySelector("#tablaContratos tr")).backgroundColor);
    assert("U6 -> " + tema + ": la fila bajo el ratón se resalta", encima !== c.normal && encima !== "rgba(0, 0, 0, 0)", [c.normal, encima]);
    const k = await contraste();
    assert("U6 -> " + tema + ": la letra tenue se lee sobre las tarjetas (≥ 4,5)", k >= 4.5, k.toFixed(2));
  }
  await page.mouse.move(0, 0);
  await page.evaluate(() => { document.body.classList.add("dark"); document.getElementById("rvCatalogo").scrollIntoView({ block: "start" }); });
  await esperar(200);
  const oscuro = await page.evaluate(() => getComputedStyle(document.getElementById("rvCatalogo")).backgroundColor);
  assert("U6 -> en oscuro, los plegables con el color del tema", oscuro !== "rgb(255, 255, 255)" && oscuro !== "rgb(247, 249, 247)", oscuro);
  await page.screenshot({ path: path.join(OUT, "cap_ui3_oscuro.png"), fullPage: true });
  assert("U6 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
