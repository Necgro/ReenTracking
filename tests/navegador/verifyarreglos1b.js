/* Verificación headless de arreglos que se ven en pantalla (ajustes en JSON,
 * vínculos mal escritos y config guardada). Chrome local + puppeteer-core sobre http://localhost:8765.
 * DATOS 100 % SINTÉTICOS.
 *
 *  R1) con texto a medio escribir en «Ajustes en JSON», una decisión
 *      tomada mientras tanto no se borra al pulsar «Aplicar» sin avisar:
 *      se pregunta; «Cancelar» la conserva y «Aceptar» aplica tu texto.
 *      Con un texto que no es JSON no pregunta: avisa y no toca nada.
 *  R3) «➕ Añadir otro cobro…» a un vínculo guardado sin asignaciones, con
 *      un null y otro vínculo mal escrito al lado: el formulario se abre y
 *      guarda, y lo mal escrito se queda como estaba.
 * A14) al arrancar, la config guardada en el navegador que no es una config
 *      (una lista, la cache, un número) se descarta y se olvida.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyarreglos1b.js
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
  /* Los diálogos: se apuntan y se responde lo que diga «respuesta». */
  const dialogos = [];
  let respuesta = true;
  page.on("dialog", d => { dialogos.push(d.message()); respuesta ? d.accept() : d.dismiss(); });

  function montar() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), T = "0x" + "77".repeat(20);
    const P1 = "0x" + "a1".repeat(20);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = {
      [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1", primera_aparicion: "2024-09-17", refuerzos: ["nombre_csv"] },
    };
    cache.transacciones.wallet_tokens.push({
      blockNumber: "50", timeStamp: ts(2024, 9, 17, 9), hash: "0x0001" + "ab".repeat(30), from: T, to: W, contractAddress: P1,
      value: "4000000000000000000", tokenName: "Reental Prueba Alcazaba 1", tokenSymbol: "RALC1", tokenDecimal: "18",
    });
    cache.ajustes_usuario = { "0xaaa::0xbbb": { revisar: true } };
    state.cache = cache;
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
  }

  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(montar);
  await page.evaluate(() => { ejecutarClasificacion(); renderPanel(); });
  await esperar(400);

  console.log("R1) «Aplicar» con los ajustes cambiados mientras escribías");
  {
    const ajustes = () => page.evaluate(() => state.cache.ajustes_usuario);
    const ESCRITO = '{"0xaaa::0xbbb": {"revisar": false}}';
    const escribir = () => page.evaluate(t => { document.getElementById("txtAjustes").value = t; }, ESCRITO);
    /* Una decisión tomada en otro sitio mientras escribes (como la de una
       tarjeta de Revisión: cambia los ajustes y repinta). */
    const decidir = () => page.evaluate(() => {
      state.cache.ajustes_usuario = Object.assign({}, state.cache.ajustes_usuario, { "0xccc::0xddd": { categoria: "SPAM" } });
      renderPanel();
    });
    const aplicar = async () => { await page.evaluate(() => document.getElementById("btnAplicarAjustes").click()); await esperar(400); };

    // Sin cambios por debajo, «Aplicar» no pregunta.
    await escribir();
    await aplicar();
    assert("sin cambios por debajo: aplica sin preguntar", dialogos.length === 0 &&
      JSON.stringify(await ajustes()) === JSON.stringify({ "0xaaa::0xbbb": { revisar: false } }), [dialogos, await ajustes()]);

    // Escribes, se toma una decisión y pulsas «Aplicar»: pregunta; «Cancelar» la conserva.
    await escribir();
    await decidir();
    const w0 = await page.evaluate(() => window.__writes.length);
    respuesta = false;
    await aplicar();
    const a1 = await ajustes();
    assert("pregunta: «Los ajustes cambiaron mientras escribías.»",
      dialogos.length === 1 && /cambiaron mientras escribías/.test(dialogos[0]), dialogos);
    assert("«Cancelar»: la decisión sigue, nada se escribe y tu texto sigue en el editor",
      a1["0xccc::0xddd"] && (await page.evaluate(() => window.__writes.length)) === w0 &&
      (await page.evaluate(() => document.getElementById("txtAjustes").value)) === ESCRITO, a1);

    // «Aceptar»: aplica tu texto (lo que pediste, sabiéndolo).
    respuesta = true;
    await aplicar();
    assert("«Aceptar»: aplica tu texto", dialogos.length === 2 &&
      JSON.stringify(await ajustes()) === JSON.stringify({ "0xaaa::0xbbb": { revisar: false } }), await ajustes());

    // Tu texto ya incluye la decisión: no pregunta.
    await page.evaluate(() => { document.getElementById("txtAjustes").value = '{"0xaaa::0xbbb": {"revisar": true}}'; });
    await decidir();
    await page.evaluate(() => {
      document.getElementById("txtAjustes").value = JSON.stringify(state.cache.ajustes_usuario);
    });
    await aplicar();
    assert("tu texto ya es lo de ahora: no pregunta", dialogos.length === 2, dialogos);

    // Un texto que no es JSON no pregunta: dice que no vale y no toca nada.
    await page.evaluate(() => { document.getElementById("txtAjustes").value = '{"0xaaa::0xbbb": '; });
    await page.evaluate(() => {  // otra decisión mientras escribes (una clave nueva)
      state.cache.ajustes_usuario = Object.assign({}, state.cache.ajustes_usuario, { "0xeee::0xfff": { categoria: "SPAM" } });
      renderPanel();
    });
    const a11 = JSON.stringify(await ajustes());
    await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
    await aplicar();
    const avisoA11 = await page.evaluate(() => { const t = [...document.querySelectorAll("#toasts .toast")].pop(); return t ? t.textContent : ""; });
    assert("A11: con un texto que no vale, no pregunta: avisa del JSON y no toca los ajustes",
      dialogos.length === 2 && /Los ajustes no son un JSON válido\./.test(avisoA11) && JSON.stringify(await ajustes()) === a11, [dialogos.length, avisoA11]);

    // Un JSON que vale pero con un importe negativo no se
    // aplica, y el aviso no dice «JSON inválido».
    await page.evaluate(() => { document.getElementById("txtAjustes").value = JSON.stringify(Object.assign({}, state.cache.ajustes_usuario, { "0x999::0": { coste_eur: -1 } })); });
    await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
    const antesNeg = JSON.stringify(await ajustes());
    await aplicar();
    const avisoNeg = await page.evaluate(() => { const t = [...document.querySelectorAll("#toasts .toast")].pop(); return t ? t.textContent : ""; });
    assert("NEGATIVOS-1: un coste negativo no se aplica, no pregunta y el aviso dice por qué",
      dialogos.length === 2 && /No se aplican los ajustes: «coste_eur» de «0x999::0» no puede ser negativo/.test(avisoNeg) && !/JSON válido/.test(avisoNeg) &&
      JSON.stringify(await ajustes()) === antesNeg, avisoNeg);
  }

  console.log("R3) «➕ Añadir otro cobro…» con vínculos mal escritos en la cache");
  {
    await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), T = "0x" + "77".repeat(20);
      const P1 = "0x" + "a1".repeat(20);
      const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
      const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
      state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
      const cache = cacheVacia();
      cache.catalogo_propiedades = { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" } };
      const leg = (h, from, to, contrato, value, name, sym, dec, t, blk) => ({
        blockNumber: blk, timeStamp: t, hash: h, from, to, contractAddress: contrato,
        value, tokenName: name, tokenSymbol: sym, tokenDecimal: dec });
      cache.transacciones.wallet_tokens.push(
        leg(Hh(1), W, T, P1, "250000000000000000000", "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 5, 12, 10), "100"),
        leg(Hh(3), T, W, USDC, "300000000", "USD Coin", "USDC", "6", ts(2026, 5, 20, 18), "102"));
      state.cache = asegurarEstructuraCache(cache);
      const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
      const csv = cargarCsvRendimientos([cab, "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W].join("\n"));
      state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
      window.__writes = [];
      window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
      ejecutarClasificacion();
      /* El vínculo de la venta, guardado sin asignaciones, con un null y
         otro vínculo con las asignaciones como objeto al lado. */
      const salida = state.registros.find(r => r.hash === Hh(1) && r.contrato === P1);
      state.cache.pagos_diferidos = { version: 1, ventas: [null,
        { id: "pd_20260512_001", estado: "CONFIRMADO", salida: ccReferenciaDeRegistro(salida, state.cache),
          estado_liquidacion: "COMPLETA", nota: "", creado: "2026-05-12T12:00:00", modificado: null, anulado: null },
        { id: "pd_20260512_002", estado: "CONFIRMADO", salida: { hash: Hh(9) }, asignaciones: { raro: 1 } }] };
      ejecutarClasificacion();
    });
    await esperar(500);
    const errAntes = errores.length;
    await page.evaluate(() => { document.getElementById("ccResueltos").open = true; renderCorrecciones(); });
    await esperar(300);
    const boton = '#ccListaResueltos [data-accion="abrir-buscador"]';
    assert("el vínculo sin cobros sale en «Resueltos» con «➕ Añadir otro cobro…»", !!(await page.$(boton)));
    if (await page.$(boton)) {
      await page.evaluate(s => { const b = document.querySelector(s); b.scrollIntoView({ block: "center" }); b.click(); }, boton);
      await esperar(400);
      await page.evaluate(() => {
        const f = [...document.querySelectorAll(".cc-dlg-item")].find(x => x.querySelector(".cc-dlg-amt").title === "300 USDC"); // el importe exacto, en su burbuja
        if (f) f.querySelector('[data-accion="toggle-cobro"]').click();
      });
      await esperar(150);
      await page.evaluate(() => { const b = document.querySelector(".cc-dlg-proponer"); if (b) b.click(); });
      await esperar(500);
      const form = await page.evaluate(() => ({
        abierto: !!document.querySelector(".cc-form"),
        confirmar: !!document.querySelector(".cc-form-confirmar:not([disabled])"),
      }));
      assert("el formulario se abre (sin errores) y se puede guardar", form.abierto && form.confirmar &&
        errores.length === errAntes, [form, errores.slice(errAntes)]);
      if (form.confirmar) {
        await page.click(".cc-form-confirmar");
        await esperar(700);
        const ventas = await page.evaluate(() => state.cache.pagos_diferidos.ventas);
        const v = ventas.find(x => x && x.id === "pd_20260512_001");
        assert("se guarda: el vínculo queda con su cobro y lo demás como estaba",
          v && Array.isArray(v.asignaciones) && v.asignaciones.length === 1 && v.asignaciones[0].cantidad_asignada === 300 &&
          ventas[0] === null && JSON.stringify(ventas[2].asignaciones) === JSON.stringify({ raro: 1 }), ventas);
      }
    }
  }

  // Lo guardado mal escrito lo prueba test_arranque_paso_almacen1.js.

  console.log("A14) Al arrancar, la config guardada en el navegador pasa la misma comprobación que «Cargar config.json»");
  {
    const W = "0x" + "11".repeat(20);
    const casos = [
      ["una lista", "[1,2]", false],
      ["la cache", JSON.stringify({ transacciones: {}, catalogo_propiedades: {} }), false],
      ["un número", "5", false],
      ["una config de verdad", JSON.stringify({ wallet: W, etherscan_api_key: "K" }), true],
    ];
    for (const [nombre, guardada, vale] of casos) {
      await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
      // Sin lo guardado en el navegador de los pasos de antes (al recargar volvería con sus datos).
      await page.evaluate(async g => {
        await new Promise(r => { const p = indexedDB.deleteDatabase("reental_spa"); p.onsuccess = p.onerror = p.onblocked = () => r(); });
        localStorage.setItem("reental_config", g);
      }, guardada);
      await page.reload({ waitUntil: "networkidle0" });
      const r = await page.evaluate(() => ({
        esObjeto: !!state.config && typeof state.config === "object" && !Array.isArray(state.config),
        wallet: state.config && state.config.wallet, tieneTransacciones: !!(state.config && state.config.transacciones),
        guardada: localStorage.getItem("reental_config"),
      }));
      assert("A14: " + nombre + (vale ? " se carga" : " se descarta (config vacía) y se olvida"),
        r.esObjeto && !r.tieneTransacciones && (vale ? r.wallet === W && r.guardada !== null : !r.wallet && r.guardada === null), r);
    }
    await page.evaluate(() => localStorage.removeItem("reental_config"));
  }

  assert("0 errores de consola", errores.length === 0, errores.slice(0, 3));
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
