/* Test de los arreglos de la zona «pagos diferidos». El motor tiene su
 * paridad en tests/paridad_arreglos_paso_arreglos7.js; aquí va lo de la
 * pantalla y lo que solo tiene la app:
 *
 * - A2  En 🔍 Revisión, un movimiento con vínculo aplicado no tiene botones
 *       (se cambia desde el vínculo); un cobro asignado en parte solo
 *       «✔ Dejar como Depósito». Con eso tampoco se llega a A3 (dejar y
 *       anular).
 * - A4  Tokens de un inmueble de la wallet al vault: traspaso neutro y no
 *       «por vincular».
 * - A6  El formulario dice si la venta sale de revisión o sigue en ella.
 * - A7  Un vínculo guardado que el motor no aplica no se enseña como
 *       vinculado y dice por qué.
 * - A8  Una asignación null no deja en blanco «Movimientos ya decididos».
 * - A9  Al editar, 0 quita ese cobro (queda en el historial); todos, no.
 * - A10 La cache con el bloque mal escrito: se aparta, no se borra.
 * - A13 Editar una asignación sin id la cambia de verdad.
 * - A18 La simulación del formulario aplica tus ajustes después, como el
 *       motor: sin cambios falsos.
 * - A19 📒 no llama «Cobro de una venta» a lo que un ajuste cambió.
 * - A20 Notas con empates a 2 decimales al par (solo los empates exactos).
 *
 * DATOS 100% SINTÉTICOS (la única dirección real es la del contrato de
 * USDC, pública). Ejecución (desde la raíz): node tests/test_arreglos_paso_arreglos7.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
let ok = 0, fallos = 0;
function assert(nombre, cond, detalle) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.log("  FALLO " + nombre + (detalle !== undefined ? " -> " + JSON.stringify(detalle) : "")); }
}

/* La app en un vm, con guardar y reclasificar sin disco: el pipeline de
   js/14 y lo mismo que guarda ejecutarClasificacion en state. */
function nuevo() {
  const sb = { console };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "14-clasificador.js",
                   "15-correcciones.js", "18-transacciones.js"]) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  }
  vm.runInContext(`
    log = function () {};
    __toasts = [];
    toast = function (m, t) { __toasts.push([t, m]); };
    __reclasificar = function () {
      const informe = {};
      state.registros = clasificarTransacciones(state.cache, [], {}, state.config, informe);
      state.informePagos = informe;
      state.registrosSinVinculos = informe.registrosSinVinculos || null;
      return true;
    };
    ccGuardarYReclasificar = async function () { __reclasificar(); return true; };
    ccRenderSeguro = function () {};
    ccAbrirBuscador = function () {};
  `, sb);
  return sb;
}
const run = (sb, code) => vm.runInContext(code, sb);

const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20);
const PROP = "0x" + "c1".repeat(20);
const REC = "0x" + "f1".repeat(20);
const T1 = "0x" + "11".repeat(20), T2 = "0x" + "22".repeat(20);
const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 10) / 1000));
const tok = (u, dec) => (BigInt(Math.round(u * 1e6)) * 10n ** BigInt(dec - 6)).toString();

/* Cache: una salida de 250 tokens a un receptor y dos cobros USDC (300 y
   500). extra.txs añade movimientos; extra.aprendidos, direcciones. */
function montar(sb, extra = {}) {
  const USDC = run(sb, "USDC");
  const leg = (h, from, to, c, value, sym, dec, t) => ({
    blockNumber: "1", timeStamp: t, hash: h, from, to, contractAddress: c, value,
    tokenName: sym, tokenSymbol: sym, tokenDecimal: String(dec) });
  sb.__datos = {
    config: { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100 },
    txs: [
      leg(H(1), W, REC, PROP, tok(250, 18), "P1", 18, ts(2026, 5, 12)),
      leg(H(3), T1, W, USDC, tok(300, 6), "USDC", 6, ts(2026, 5, 20)),
      leg(H(4), T2, W, USDC, tok(500, 6), "USDC", 6, ts(2026, 5, 21)),
    ].concat((extra.txs || []).map(x => leg(x[0], x[1], x[2], x[3] === "USDC" ? USDC : x[3], x[4], x[5], x[6], x[7]))),
    aprendidos: extra.aprendidos || {},
  };
  run(sb, `
    state.config = __datos.config;
    state.cache = cacheVacia();
    state.cache.catalogo_propiedades = { "${PROP}": { estado: "CONFIRMADA", nombre_reental: "Prueba 1", simbolo: "P1" } };
    state.cache.transacciones.wallet_tokens = __datos.txs;
    for (const [rol, dirs] of Object.entries(__datos.aprendidos)) Object.assign(state.cache.contratos_aprendidos[rol], dirs);
    __reclasificar();
  `);
}
const porHash = (sb, h) => run(sb, "state.registros").find(r => r.hash === h.toLowerCase());

/* «Formulario» falso: ccForm con un overlay cuyos campos son valores
   (cantidad null = el campo no está; "" = vacío). */
function abrirForm(sb, salidaClave, cobros, nota, edicion) {
  sb.__f = { salidaClave, cobros, nota, edicion: edicion || null };
  run(sb, `
    (function () {
      const f = __f;
      const vals = {};
      for (const c of f.cobros) vals[c.clave] = c.cantidad === undefined ? null : String(c.cantidad);
      const overlay = {
        querySelector(sel) {
          const m = /data-clave="([^"]+)"/.exec(sel);
          if (m) return vals[m[1]] === null ? null : { value: vals[m[1]] };
          if (sel.includes('name="nota"')) return { value: f.nota || "" };
          return null;
        },
        remove() {},
      };
      let edicionAsignaciones = null;
      if (f.edicion) {
        const v = ccVentasGuardadas().find(x => x && x.id === f.edicion.ventaId);
        edicionAsignaciones = ccAsignacionesValidas(v).map((a, i) => ({ asignacionId: a.id || null, indice: i }));
      }
      ccForm = { overlay, onKey: null, trigger: null, salida: f.salidaClave,
        cobros: f.cobros.map(c => c.clave), edicion: f.edicion, edicionAsignaciones,
        refs: { confirmar: { disabled: false }, confirmarOtro: { disabled: false } } };
    })();
  `);
}
const estadoForm = sb => run(sb, "ccFormLeerEstado()");
async function confirmar(sb) {
  sb.document = { removeEventListener() {}, contains() { return false; } };
  await run(sb, "ccConfirmarVinculo(false)");
}
async function vincular(sb, salidaClave, cobros, nota) {
  abrirForm(sb, salidaClave, cobros, nota);
  const st = estadoForm(sb);
  if (!st.validacion.ok) return { ok: false, motivos: st.validacion.motivos, st };
  await confirmar(sb);
  return { ok: true, st };
}
const ventas = sb => run(sb, "ccVentasGuardadas()");
const ctxDe = sb => run(sb, "ccContextoSesion(state.registros)");

(async () => {
  // =========================================================================
  console.log("== A2 · Revisión: lo vinculado se cambia desde el vínculo ==");
  // =========================================================================
  {
    const sb = nuevo();
    montar(sb);
    const sal = porHash(sb, H(1)), c1 = porHash(sb, H(3));
    const r = await vincular(sb, sal.clave, [{ clave: c1.clave, cantidad: 100 }]);
    assert("se vincula 100 de un cobro de 300", r.ok, r.motivos);
    const salV = porHash(sb, H(1)), c1V = porHash(sb, H(3));
    assert("el cobro en parte queda depósito y a revisar (motor, A5)",
      c1V.categoria === "DEPOSITO" && c1V.revisar === true && c1V.pago_diferido.rol === "pago", c1V);
    const ops = run(sb, "ccOpcionesDecision")(c1V, ctxDe(sb));
    assert("cobro en parte: solo «✔ Dejar como Depósito» (sin neutro ni spam)",
      ops.length === 1 && ops[0].id === "dejar" && ops[0].etiqueta === "✔ Ingreso de dinero", ops);
    assert("la venta vinculada: ningún botón",
      run(sb, "ccOpcionesDecision")(salV, ctxDe(sb)).length === 0);
    const html = run(sb, "ccHtmlDecisiones")(salV, { estado: "libre", opciones: [] });
    assert("…y la tarjeta dice dónde se cambia", html.includes("Se cambia desde su vínculo."), html);
    const htmlPropio = run(sb, "ccHtmlDecisiones")(salV, { estado: "propio", opciones: [] });
    assert("A16: mandada a revisar por ti, dice que se quita con ↩ en 📒",
      htmlPropio.includes("Mandado a revisar por ti: se quita con ↩ en 📒 Transacciones.") && !htmlPropio.includes("vínculo"), htmlPropio);
    assert("un movimiento sin vínculo conserva sus botones",
      run(sb, "ccOpcionesDecision")(porHash(sb, H(4)), ctxDe(sb)).some(o => o.id === "neutro"));
    // «Dejar como Depósito»: el resto es dinero tuyo; deja de pedir revisión
    // y no hay conflicto con el vínculo.
    await run(sb, `ccDecidir(${JSON.stringify(c1V.clave)}, "dejar", null)`);
    const c1D = porHash(sb, H(3));
    assert("tras «Dejar»: depósito, sin revisar, con su vínculo y sin conflicto",
      c1D.categoria === "DEPOSITO" && c1D.revisar === false && c1D.pago_diferido &&
      run(sb, "state.informePagos.conflictos").length === 0, run(sb, "state.informePagos.conflictos"));
  }

  // =========================================================================
  console.log("== A4 · traspaso de tokens de la wallet al vault ==");
  // =========================================================================
  {
    const sb = nuevo();
    montar(sb, { txs: [[H(9), W, V, PROP, tok(2, 18), "P1", 18, ts(2026, 7, 1)]] });
    const tr = porHash(sb, H(9));
    assert("es un traspaso neutro, no una compra bancaria",
      tr.categoria === "MOVIMIENTO" && tr.subcategoria === "NEUTRO" && tr.coste_eur === null && !tr.revisar, tr);
    assert("y no sale «por vincular» en Revisión",
      run(sb, "ccPendienteDeVincular")(tr, ctxDe(sb), false) === null);
  }

  // =========================================================================
  console.log("== A6 y A18 · el formulario dice lo que pasará ==");
  // =========================================================================
  {
    const sb = nuevo();
    montar(sb);
    const sal = porHash(sb, H(1)), c1 = porHash(sb, H(3));
    abrirForm(sb, sal.clave, [{ clave: c1.clave, cantidad: 300 }]);
    let st = estadoForm(sb);
    let html = run(sb, "ccHtmlAvisosVinculo")(st.sim, [], [], st.registros);
    assert("sin nada más: «la venta queda cobrada y sale de la lista»",
      html.includes("la venta queda cobrada y sale de la lista"), html.slice(0, 300));
    // «Mandado a revisar» en la salida: tu ajuste manda, y el formulario lo dice.
    run(sb, `state.cache.ajustes_usuario = { [${JSON.stringify(sal.clave)}]: { revisar: true, nota: ccNotaMandarRevisar("comprobar", "2026-10-03") } }; __reclasificar();`);
    abrirForm(sb, sal.clave, [{ clave: c1.clave, cantidad: 300 }]);
    st = estadoForm(sb);
    html = run(sb, "ccHtmlAvisosVinculo")(st.sim, [], [], st.registros);
    assert("con «Mandado a revisar» en la venta: «sigue en la lista por otro motivo» (A18: los ajustes van después)",
      html.includes("sigue en la lista por otro motivo"), html.slice(0, 300));
    const cambioSalida = st.sim.diff.find(d => d.clave === sal.clave);
    assert("y la simulación no dice que la venta deja de estar a revisar",
      !cambioSalida || !cambioSalida.cambios.some(c => c.campo === "revisar"), cambioSalida);
    await confirmar(sb);
    // Editar sin cambiar nada: ningún cambio falso (ni en revisar ni en la nota).
    const vid = ventas(sb)[0].id;
    abrirForm(sb, sal.clave, [{ clave: c1.clave, cantidad: 300 }], "", { ventaId: vid });
    st = estadoForm(sb);
    assert("editar sin cambios con un ajuste en la venta: 0 cambios", st.sim.diff.length === 0, st.sim.diff);
  }

  // =========================================================================
  console.log("== A7 · un vínculo que el motor no aplica ==");
  // =========================================================================
  {
    const sb = nuevo();
    montar(sb);
    const sal = porHash(sb, H(1)), c1 = porHash(sb, H(3));
    await vincular(sb, sal.clave, [{ clave: c1.clave, cantidad: 300 }]);
    const vid = ventas(sb)[0].id;
    assert("aplicado: «Venta vinculada»", run(sb, "ccVinculoDeRegistro")(porHash(sb, H(1)), ctxDe(sb)).rol === "salida");
    // Después aparece dinero en el hash de la venta (se bajó lo que faltaba).
    run(sb, `state.cache.transacciones.wallet_tokens.push({ blockNumber: "1", timeStamp: "${ts(2026, 5, 12)}",
      hash: "${H(1)}", from: "${REC}", to: "${W}", contractAddress: USDC, value: "${tok(10, 6)}",
      tokenName: "USDC", tokenSymbol: "USDC", tokenDecimal: "6" }); __reclasificar();`);
    const ctx = ctxDe(sb);
    const salN = porHash(sb, H(1)), c1N = porHash(sb, H(3));
    assert("el motor lo rechaza (venta P2P de 10 en su hash)", salN.importe_usdt === 10 && !salN.pago_diferido, salN);
    assert("la venta ya no se enseña como vinculada", run(sb, "ccVinculoDeRegistro")(salN, ctx) === null);
    assert("ni el cobro como pago de una venta, y vuelve a estar libre",
      run(sb, "ccVinculoDeRegistro")(c1N, ctx) === null && run(sb, "ccEsCobroPendiente")(c1N, ctx, false));
    assert("el vínculo se sabe no aplicado", ctx.noAplicadas.has(vid));
    const v = ventas(sb)[0];
    const problema = run(sb, "state.informePagos.problemas").find(m => run(sb, "ccProblemaDeVenta")(m, vid));
    const html = run(sb, "ccHtmlVenta")(v, run(sb, "ccResumenVenta")(v, run(sb, "state.registros")),
      { noAplicada: true, problema });
    assert("su tarjeta lo dice con el motivo del motor, en llano (MENORES-1)",
      html.includes("⚠ No se aplica: Esta venta ya tiene su cobro en la misma transacción."), html);
  }

  // =========================================================================
  console.log("== A8 · una asignación null en el bloque ==");
  // =========================================================================
  {
    const sb = nuevo();
    montar(sb);
    const sal = porHash(sb, H(1)), c1 = porHash(sb, H(3));
    await vincular(sb, sal.clave, [{ clave: c1.clave, cantidad: 300 }]);
    run(sb, "state.cache.pagos_diferidos.ventas[0].asignaciones.push(null); __reclasificar();");
    let html = null, error = null;
    try {
      const v = ventas(sb)[0];
      html = run(sb, "ccHtmlVenta")(v, run(sb, "ccResumenVenta")(v, run(sb, "state.registros")), {});
    } catch (e) { error = String(e); }
    assert("la tarjeta del vínculo se pinta (antes: TypeError y «Resueltos» en blanco)",
      !error && html.includes("Cobrado:"), error);
  }

  // =========================================================================
  console.log("== A9 y A13 · editar un vínculo ==");
  // =========================================================================
  {
    const sb = nuevo();
    montar(sb);
    const sal = porHash(sb, H(1)), c1 = porHash(sb, H(3)), c2 = porHash(sb, H(4));
    await vincular(sb, sal.clave, [{ clave: c1.clave, cantidad: 300 }, { clave: c2.clave, cantidad: 500 }]);
    const vid = ventas(sb)[0].id;
    abrirForm(sb, sal.clave, [{ clave: c1.clave, cantidad: 300 }, { clave: c2.clave, cantidad: 0 }], "", { ventaId: vid });
    let st = estadoForm(sb);
    assert("con 0 en un cobro: se puede guardar", st.validacion.ok, st.validacion.motivos);
    await confirmar(sb);
    const v = ventas(sb)[0];
    assert("ese cobro sale del vínculo y queda en su historial",
      v.asignaciones.length === 1 && v.historial.length === 1 && v.historial[0].quitada &&
      v.historial[0].asignacion.cantidad_asignada === 500, v);
    assert("la venta cobra 300 y el cobro quitado vuelve a su depósito sin marca",
      porHash(sb, H(1)).importe_usdt === 300 && !porHash(sb, H(4)).pago_diferido);
    abrirForm(sb, sal.clave, [{ clave: c1.clave, cantidad: "" }], "", { ventaId: vid });
    st = estadoForm(sb);
    assert("quitarlos todos no se puede: hay que deshacer el vínculo",
      !st.validacion.ok && st.validacion.motivos.includes("Para quitar todos los cobros, usa «↩ Deshacer»."), st.validacion.motivos);
    // A13: una asignación sin id (escrita a mano) se edita por su sitio.
    run(sb, "delete state.cache.pagos_diferidos.ventas[0].asignaciones[0].id; __reclasificar();");
    abrirForm(sb, sal.clave, [{ clave: c1.clave, cantidad: 120 }], "", { ventaId: vid });
    st = estadoForm(sb);
    await confirmar(sb);
    assert("sin id: la cantidad cambia de verdad (antes decía «actualizado» y seguía en 300)",
      ventas(sb)[0].asignaciones[0].cantidad_asignada === 120 && porHash(sb, H(1)).importe_usdt === 120,
      ventas(sb)[0].asignaciones);
  }

  // =========================================================================
  console.log("== A10 · la cache con el bloque mal escrito ==");
  // =========================================================================
  {
    const sb = nuevo();
    const asegurar = run(sb, "asegurarEstructuraCache");
    const base = () => run(sb, "cacheVacia()");
    let c = base(); c.pagos_diferidos = null; asegurar(c);
    assert("null: bloque vacío, sin apartar nada",
      JSON.stringify(c.pagos_diferidos) === '{"version":1,"ventas":[]}' && c.pagos_diferidos_no_leidos === undefined);
    const malas = { version: 1, ventas: { pd_1: { id: "pd_1" } } };
    c = base(); c.pagos_diferidos = malas; asegurar(c);
    assert("«ventas» como objeto: se aparta tal cual (antes se borraba al guardar)",
      JSON.stringify(c.pagos_diferidos_no_leidos) === JSON.stringify([malas]) &&
      JSON.stringify(c.pagos_diferidos) === '{"version":1,"ventas":[]}', c);
    c = base(); c.pagos_diferidos = ["x"]; c.pagos_diferidos_no_leidos = [1]; asegurar(c);
    assert("una lista: se añade a lo ya apartado", JSON.stringify(c.pagos_diferidos_no_leidos) === '[1,["x"]]');
    c = base(); c.pagos_diferidos = { version: null, ventas: null }; asegurar(c);
    assert("version y ventas null: se completan", JSON.stringify(c.pagos_diferidos) === '{"version":1,"ventas":[]}');
  }

  // =========================================================================
  console.log("== A19 y A20 · Transacciones y notas ==");
  // =========================================================================
  {
    const sb = nuevo();
    const txOperacion = run(sb, "txOperacion");
    const pd = { venta_id: "pd_1", rol: "pago" };
    assert("cobro del vínculo: «Cobro de una venta»",
      txOperacion({ categoria: "DEPOSITO", subcategoria: "COSTE_BASE", pago_diferido: pd }) === "Cobro de una venta");
    assert("si tu ajuste lo hizo neutro, ya no lo dice",
      txOperacion({ categoria: "MOVIMIENTO", subcategoria: "NEUTRO", pago_diferido: pd }) !== "Cobro de una venta");
    const numEs = run(sb, "numEs");
    assert("100,125 con 2 decimales: «100,12»", numEs(100.125, 2) === "100,12", numEs(100.125, 2));
    assert("0,375 -> «0,38» y 2,5 sin decimales -> «2» (al par en los empates exactos)",
      numEs(0.375, 2) === "0,38" && numEs(2.5, 0) === "2");
    assert("lo que no es empate exacto sigue igual (1,005 -> 1,00; 100,135 -> 100,14)",
      numEs(1.005, 2) === "1,00" && numEs(100.135, 2) === "100,14");
  }

  console.log("");
  console.log(fallos ? `RESULTADO: ${ok}/${ok + fallos} — HAY FALLOS` : `RESULTADO: ${ok}/${ok} — todo en verde`);
  process.exit(fallos ? 1 : 0);
})();
