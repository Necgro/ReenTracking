/* Verificación headless de arreglos que se ven en pantalla.
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS 100 %
 * SINTÉTICOS.
 *
 *  M1) lo que escribes en «Ajustes en JSON» o en un precio de RNT que falta
 *      sigue ahí cuando acaba una actualización o una clasificación.
 *  M8) «Ver en Transacciones» enseña un spam aunque estuviera pulsado otro
 *      motivo del spam.
 * M13) un pagos_diferidos mal escrito (ventas que no son una lista o
 *      asignaciones que no lo son) no deja 📒 ni 🔍 en blanco.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyarreglos1.js
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
  page.on("dialog", d => d.accept());

  function montar() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), T = "0x" + "77".repeat(20);
    const P1 = "0x" + "a1".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = {
      [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1", primera_aparicion: "2024-09-17", refuerzos: ["nombre_csv"] },
    };
    const leg = (h, contrato, unidades, name, sym, t, blk, from, to) => ({
      blockNumber: blk, timeStamp: t, hash: h, from: from || T, to: to || W, contractAddress: contrato,
      value: tok18(unidades), tokenName: name, tokenSymbol: sym, tokenDecimal: "18",
    });
    cache.transacciones.wallet_tokens.push(
      leg(Hh(1), P1, 4, "Reental Prueba Alcazaba 1", "RALC1", ts(2024, 9, 17, 9), "50"),
      leg(Hh(2), RNT, 12, "Reental", "RNT", ts(2025, 4, 1, 9), "80", W, T),
      // Dos spam con motivos distintos (M8): una web en el nombre y sin nombre.
      leg(Hh(3), "0x" + "d1".repeat(20), 100, "visit-claim.com", "CLAIM", ts(2025, 5, 1, 9), "90"),
      leg(Hh(4), "0x" + "d2".repeat(20), 100, "", "", ts(2025, 5, 2, 9), "91"));
    cache.precios_rnt_no_disponibles = { "2025-04-01": "sin precio (sintético)" };
    state.cache = cache;
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
  }

  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(montar);
  await page.evaluate(() => { ejecutarClasificacion(); renderPanel(); });
  await esperar(400);

  console.log("M1) Lo escrito sobrevive al repintado");
  {
    await page.evaluate(() => { document.getElementById("rvPreciosRnt").open = true; document.getElementById("rvAjustes") && (document.getElementById("rvAjustes").open = true); });
    // Sin cambios tuyos, el editor sí enseña los ajustes nuevos (p. ej. una decisión en Revisión).
    await page.evaluate(() => { state.cache.ajustes_usuario = { "0xaaa::0xbbb": { revisar: false } }; renderPanel(); });
    const sinTocar = await page.evaluate(() => document.getElementById("txtAjustes").value);
    assert("sin cambios tuyos, enseña los ajustes nuevos", sinTocar.includes("0xaaa::0xbbb"), sinTocar);

    const ESCRITO = '{\n  "0xabc::0xdef": { "categoria": "SPAM" }\n  ';
    await page.evaluate(t => { document.getElementById("txtAjustes").value = t; }, ESCRITO);
    await page.focus('#tablaPreciosRntFaltantes input[data-fecha="2025-04-01"]');
    await page.keyboard.type("0.42");
    // Lo que hace el final de una actualización o una clasificación.
    await page.evaluate(() => { ejecutarClasificacion(); renderPanel(); });
    await esperar(300);
    const tras = await page.evaluate(() => {
      const inp = document.querySelector('#tablaPreciosRntFaltantes input[data-fecha="2025-04-01"]');
      return { ajustes: document.getElementById("txtAjustes").value, precio: inp && inp.value,
               foco: document.activeElement === inp };
    });
    assert("«Ajustes en JSON» a medio escribir no se borra", tras.ajustes === ESCRITO, tras);
    assert("el precio de RNT escrito sigue ahí y con el cursor dentro", tras.precio === "0.42" && tras.foco, tras);

    // Aplicar deja el texto como lo guardado y los cambios siguientes vuelven a verse.
    await page.evaluate(() => { document.getElementById("txtAjustes").value = '{"0xccc::0xddd": {"revisar": true}}'; });
    await page.evaluate(() => document.getElementById("btnAplicarAjustes").click());
    await esperar(400);
    await page.evaluate(() => { state.cache.ajustes_usuario["0xeee::0xfff"] = { revisar: true }; renderPanel(); });
    const trasAplicar = await page.evaluate(() => document.getElementById("txtAjustes").value);
    assert("tras «Aplicar», los ajustes que cambian después también se ven",
      trasAplicar.includes("0xccc::0xddd") && trasAplicar.includes("0xeee::0xfff"), trasAplicar);
  }

  console.log("M8) «Ver en Transacciones» con otro motivo del spam pulsado");
  {
    const clave = await page.evaluate(() => state.registros.find(r => r.categoria === "SPAM" && !r.token).clave);
    await page.evaluate(() => { location.hash = "#transacciones"; });
    await esperar(300);
    await page.evaluate(() => { const s = document.getElementById("txFiltroCategoria"); s.value = "SPAM"; txMotivoFiltro = "web"; txRenderSeguro(true); });
    await esperar(200);
    const antes = await page.evaluate(c => !!document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + c + '"]'), clave);
    await page.evaluate(c => txMostrarMovimiento(c), clave);
    await esperar(400);
    const despues = await page.evaluate(c => !!document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + c + '"]'), clave);
    assert("con «Web en el nombre» pulsado no se veía; tras «Ver en Transacciones», sí", !antes && despues, { antes, despues });
  }

  console.log("M13) pagos_diferidos mal escrito");
  for (const [nombre, ventas] of [["ventas que no son una lista", { x: 1 }],
    ["asignaciones que no son una lista", [{ id: "pd_x", estado: "CONFIRMADO", salida: { hash: "0x1" }, asignaciones: "mal" }]]]) {
    const filas = await page.evaluate(v => {
      state.cache.pagos_diferidos = { version: 1, ventas: v };
      ejecutarClasificacion(); location.hash = "#transacciones"; txVaciarFiltros(); txRenderSeguro(true);
      renderCorrecciones();
      return { tx: document.querySelectorAll("#txCuerpo tr.tx-fila").length, rv: document.getElementById("ccLista").innerHTML.length };
    }, ventas);
    assert(nombre + ": 📒 y 🔍 se pintan", filas.tx > 0 && filas.rv > 0, filas);
  }
  await page.evaluate(() => { state.cache.pagos_diferidos = { version: 1, ventas: [] }; ejecutarClasificacion(); });

  assert("0 errores de consola", errores.length === 0, errores);
  await browser.close();
  console.log(`\nRESULTADO: ${ok}/${ok + fallos} — ${fallos ? "HAY FALLOS" : "todo en verde"}`);
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
