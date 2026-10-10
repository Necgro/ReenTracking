/* Test unitario de la semántica de «por vincular» y del lenguaje llano de
 * los vínculos.
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - T9 · «por vincular» = VINCULABLE Y SIN VÍNCULO:
 *   ccSalidaConContraprestacionPropia / ccEsSalidaPendiente /
 *   ccEsCobroPendiente / ccPendienteDeVincular / ccVinculoDeRegistro /
 *   ccVinculosDeContexto (vía ccContextoCandidatos con registros):
 *   salida VENTA con pago en su propio hash FUERA y burn VENTA sin importe
 *   FUERA (el motor rechaza vincularlas), salida ya vinculada
 *   FUERA, cobro totalmente asignado FUERA (tampoco se propone en el
 *   buscador), cobro parcial DENTRO (resto disponible > 0); los ANULADOS no
 *   cuentan.
 *   Aplicado a ccFiltrar («solo pendientes»), ccResumen (contadores de
 *   cabecera + números N/+M de la casilla) y ccCobrosCoincidentes (buscador).
 * - T11 · botón por estado en ccHtmlTarjeta: «🔗 Vincular cobro…» solo en
 *   salidas pendientes; «➕ Añadir otro cobro» en vinculadas
 *   (title: una venta puede cobrarse en varias transferencias); salida con contraprestación propia SIN botón.
 * - T13 · marca mínima «🔗 vinculada» + id de venta en salida y cobro con
 *   vínculo CONFIRMADO.
 * - T12 · «Total asignado:» (sin «Σ») en ccHtmlVenta con nota de USD nominal
 *   (el € sale en el motor fiscal, con el BCE de cada fecha).
 * - T10 · lenguaje llano: «lista»/«casilla»/«marca» en los textos de UI; sin
 *   «cola», «conmutador» ni «chapa»; ayuda CORTA de la casilla con los
 *   números en vivo (N sin explicar por defecto; +M ya explicados).
 * - T15/T16 · ayudas de una frase + burbuja de
 *   información (ccInfo: ⓘ con tabindex alcanzable con teclado y detalle
 *   completo en .cc-burbuja; CSS solo con tokens → modo oscuro correcto).
 * - Flujos de guardado y gestión de vínculos INTACTOS (borrador -> bloque ->
 *   simulación; anular vuelve a la clasificación original; restaurar
 *   reaplica sin duplicar).
 * - PUERTA: persistencia solo vía patrón js/13.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_47.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
const { ccContextoCandidatos, ccVinculosDeContexto, ccEsSalidaCandidata, ccEsSalidaPendiente,
        ccEsCobroPendiente, ccEsCobroCandidato, ccSalidaConContraprestacionPropia,
        ccPendienteDeVincular, ccVinculoDeRegistro, ccCandidatura, ccResumen,
        ccCobrosCoincidentes, ccHtmlTarjeta, ccHtmlCabecera, ccHtmlDialogoEstructura,
        ccHtmlFormEstructura, ccHtmlVenta, ccPrecargaFormulario, ccReferenciaDeRegistro,
        ccBorradorVenta, ccAplicarBorradorABloque, ccSimularBloque, ccAnularVenta,
        ccRestaurarVenta, ccEditarVenta, ccResumenVenta, ccDisponibleCobro, ccInfo } = sandbox;
const USDT = vm.runInContext("USDT", sandbox);
const USDC = vm.runInContext("USDC", sandbox);
const BURN = vm.runInContext("BURN", sandbox);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

/* ------------------------- Fixture sintética ------------------------- */
const W = "0x" + "11".repeat(20);   // wallet propia
const V = "0x" + "22".repeat(20);   // vault propio
const T = "0x" + "77".repeat(20);   // tercero
const D = "0x" + "d1".repeat(20);   // distribuidor
const P1 = "0x" + "a1".repeat(20);  // propiedad CONFIRMADA 1
const P2 = "0x" + "a2".repeat(20);  // propiedad CONFIRMADA 2
const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);

function reg(hash, contrato, origen, destino, cantidad, categoria,
             { simbolo = null, fecha = "2026-05-12 09:45:46", clave = null,
               revisar = false, nota = "", inmueble = null,
               importe_usdt = null, subcategoria = "PENDIENTE" } = {}) {
  return {
    clave: clave || hash + "::" + contrato, fecha,
    hash: hash.toLowerCase(), contrato: String(contrato).toLowerCase(),
    token: null, simbolo, cantidad, categoria, subcategoria,
    inmueble, periodo_fiscal: null, importe_usdt, coste_eur: null,
    via_compra: null, origen: origen.toLowerCase(), destino: destino.toLowerCase(),
    fuente: "ONCHAIN", nota, revisar,
  };
}

const CACHE = {
  catalogo_propiedades: {
    [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1" },
    [P2]: { estado: "CONFIRMADA", nombre_reental: "Prueba Brezo 2" },
  },
  contratos_aprendidos: {},
  transacciones: {
    wallet_tokens: [
      { hash: H(1), contractAddress: P1, from: W, to: T, value: "250000000000000000000", tokenDecimal: "18", timeStamp: "1778556800" },
      { hash: H(2), contractAddress: P2, from: W, to: T, value: "100000000000000000000", tokenDecimal: "18", timeStamp: "1778606800" },
      { hash: H(3), contractAddress: USDC, from: T, to: W, value: "300000000", tokenDecimal: "6", timeStamp: "1778656800" },
      { hash: H(7), contractAddress: P1, from: W, to: T, value: "40000000000000000000", tokenDecimal: "18", timeStamp: "1778756800" },
    ],
    vault_tokens: [
      { hash: H(4), contractAddress: USDT, from: D, to: V, value: "400000000", tokenDecimal: "6", timeStamp: "1775816000" },
      { hash: H(5), contractAddress: USDT, from: D, to: V, value: "12000000", tokenDecimal: "6", timeStamp: "1775916000" },
      { hash: H(6), contractAddress: USDT, from: T, to: V, value: "60000000", tokenDecimal: "6", timeStamp: "1778856800" },
    ],
    wallet_normales: [], wallet_internas: [], vault_normales: [],
  },
  pagos_diferidos: { version: 1, ventas: [] },
  ajustes_usuario: {},
};
const CONFIG = { wallet: W, vault: V };

/* Salidas: s1 y s2 REVISAR sin contraprestación; v1 = VENTA con su pago en el
   propio hash (importe_usdt asignado por el clasificador: vinculable pero NO
   pendiente, el motor rechaza vincularla).
   Cobros: c1 USDC 300 DEPOSITO (caso «verificar origen»), c3 RENDIMIENTO 400 y
   c4 REWARD 12 (contraparte explicada: solo con la casilla), c5 USDT 60
   REVISAR (sin contraparte). */
const s1 = reg(H(1), P1, W, T, 250, "REVISAR", { simbolo: "RALC1", revisar: true, inmueble: "Prueba Alcazaba 1", nota: "envio de tokens de un inmueble sin contraprestacion en el hash", clave: "s1" });
const s2 = reg(H(2), P2, W, T, 100, "REVISAR", { simbolo: "RBRE2", revisar: true, inmueble: "Prueba Brezo 2", nota: "envio de tokens de un inmueble sin contraprestacion en el hash", clave: "s2" });
const v1 = reg(H(7), P1, W, T, 40, "VENTA", { simbolo: "RALC1", fecha: "2026-08-02 12:00:00", inmueble: "Prueba Alcazaba 1", importe_usdt: 500, subcategoria: "GPP_INMUEBLE", nota: "venta con contraprestacion correlacionada en el hash", clave: "v1" });
const v2 = reg(H(8), P1, W, BURN, 40, "VENTA", { simbolo: "RALC1", fecha: "2026-08-03 12:00:00", inmueble: "Prueba Alcazaba 1", subcategoria: "GPP_INMUEBLE", revisar: true, nota: "burn sin contraprestacion localizada en el hash", clave: "v2" });
const c1 = reg(H(3), USDC, T, W, 300, "DEPOSITO", { simbolo: "USDC", fecha: "2026-05-20 18:00:00", nota: "verificar origen (venta P2P, bridge o exchange)", clave: "c1" });
const c3 = reg(H(4), USDT, D, V, 400, "RENDIMIENTO", { simbolo: "USDT", fecha: "2026-04-10 12:00:00", clave: "c3" });
const c4 = reg(H(5), USDT, D, V, 12, "REWARD", { simbolo: "USDT", fecha: "2026-04-11 12:00:00", clave: "c4" });
const c5 = reg(H(6), USDT, T, V, 60, "REVISAR", { simbolo: "USDT", fecha: "2026-07-25 09:00:00", revisar: true, clave: "c5" });
const REGS = [s1, s2, v1, v2, c1, c3, c4, c5];
const clavesDe = l => l.map(r => r.clave).join(",");
const firma = regs => JSON.stringify(regs.map(r =>
  [r.clave, r.categoria, r.subcategoria, r.importe_usdt, r.revisar, r.nota, r.pago_diferido || null]));
const copiar = () => REGS.map(r => Object.assign({}, r));
const cacheCon = ventas => Object.assign({}, CACHE,
  { pagos_diferidos: { version: 1, ventas: ventas } });
const aplicar = ventas => { const regs = copiar();
  vm.runInContext("aplicarPagosDiferidos", sandbox)(regs, cacheCon(ventas)); return regs; };
const sinF = { categoria: "", inmueble: "", desde: "", hasta: "", soloPendientes: false };

/* Vínculo CONFIRMADO s1 ↔ c1 (todo el cobro: 300 de 300). */
const refS1 = ccReferenciaDeRegistro(s1, CACHE);
const refC1 = ccReferenciaDeRegistro(c1, CACHE);
const borrador = ccBorradorVenta({
  salida: s1, cobro: c1, refSalida: refS1, refCobro: refC1,
  cantidadAsignada: 300, estadoLiquidacion: "COMPLETA",
  importeEsperado: null, monedaEsperada: "USD", nota: "cierre sintético",
});
const resBloque = ccAplicarBorradorABloque([], { borrador, refSalida: refS1, refCobro: refC1 });
const VENTAS = resBloque.ventas;
const VID = resBloque.ventaId;
const REGS_CONF = aplicar(VENTAS);
const CTX_CONF = ccContextoCandidatos(cacheCon(VENTAS), CONFIG, REGS_CONF);
const s1Conf = REGS_CONF.find(r => r.clave === "s1");
const c1Conf = REGS_CONF.find(r => r.clave === "c1");

// =========================================================================
console.log("== 1. T9 · «por vincular» = vinculable Y sin vínculo ==");
// =========================================================================
const ctx0 = ccContextoCandidatos(CACHE, CONFIG, REGS);
assert("ctx sin vínculos: mapas vacíos (y compatibilidad sin registros)",
  ctx0.salidasVinculadas.size === 0 && ctx0.cobrosAsignados.size === 0 &&
  ccContextoCandidatos(CACHE, CONFIG).salidasVinculadas.size === 0);
assert("sanidad: sin vínculos s1 y c1 son pendientes; s2 y c5 también",
  ccEsSalidaPendiente(s1, ctx0) && ccEsSalidaPendiente(s2, ctx0) &&
  ccEsCobroPendiente(c1, ctx0, false) && ccEsCobroPendiente(c5, ctx0, false));
assert("v1 (VENTA con pago en su propio hash): VINCULABLE pero NO pendiente (§3/1.2)",
  ccEsSalidaCandidata(v1, ctx0) === true && ccCandidatura(v1, ctx0) === "salida" &&
  ccSalidaConContraprestacionPropia(v1) === true && ccEsSalidaPendiente(v1, ctx0) === false &&
  ccPendienteDeVincular(v1, ctx0) === null);
assert("v2 (burn VENTA sin importe_usdt): VINCULABLE pero NO pendiente (el motor rechaza toda VENTA correlacionada, §3/1.2)",
  ccEsSalidaCandidata(v2, ctx0) === true && ccSalidaConContraprestacionPropia(v2) === false &&
  ccEsSalidaPendiente(v2, ctx0) === false && ccPendienteDeVincular(v2, ctx0) === null);
assert("importe_usdt null/undefined no se trata como contraprestación propia",
  ccSalidaConContraprestacionPropia(s1) === false &&
  ccSalidaConContraprestacionPropia({ importe_usdt: undefined }) === false);
assert("motor aplicado: s1 → VENTA con importe y marcador; c1 → DEPOSITO asignado del todo",
  s1Conf.categoria === "VENTA" && s1Conf.importe_usdt === 300 &&
  s1Conf.pago_diferido.rol === "salida" && c1Conf.pago_diferido.rol === "pago", s1Conf.pago_diferido);
assert("salida ya vinculada: NO pendiente (y sigue vinculable por estructura)",
  ccEsSalidaPendiente(s1Conf, CTX_CONF) === false &&
  ccPendienteDeVincular(s1Conf, CTX_CONF) === null &&
  ccEsSalidaCandidata(s1Conf, CTX_CONF) === true);
assert("cobro totalmente asignado: NO pendiente, ni con la casilla «ver todos»",
  ccEsCobroPendiente(c1Conf, CTX_CONF, false) === false &&
  ccEsCobroPendiente(c1Conf, CTX_CONF, true) === false &&
  ccEsCobroCandidato(c1Conf, CTX_CONF, true) === true);
assert("ccVinculoDeRegistro: salida → rol salida + id de venta; cobro → rol pago + Σ asignada",
  JSON.stringify(ccVinculoDeRegistro(s1Conf, CTX_CONF)) === JSON.stringify({ rol: "salida", ventaIds: [VID], asignado: null }) &&
  JSON.stringify(ccVinculoDeRegistro(c1Conf, CTX_CONF)) === JSON.stringify({ rol: "pago", ventaIds: [VID], asignado: 300 }),
  ccVinculoDeRegistro(c1Conf, CTX_CONF));
assert("registros sin vínculo: ccVinculoDeRegistro null; s2 y c5 siguen pendientes",
  ccVinculoDeRegistro(s2, CTX_CONF) === null && ccVinculoDeRegistro(c5, CTX_CONF) === null &&
  ccEsSalidaPendiente(s2, CTX_CONF) && ccEsCobroPendiente(c5, CTX_CONF, false));
/* Cobro parcial: se edita la asignación a 100 (resto 200 disponible). */
const VENTAS_PAR = ccEditarVenta(VENTAS, {
  ventaId: VID, asignacionId: "as_001", cantidadAsignada: 100,
  importeEsperado: null, monedaEsperada: "USD", estadoLiquidacion: "PARCIAL", nota: "cierre sintético",
});
const REGS_PAR = aplicar(VENTAS_PAR);
const CTX_PAR = ccContextoCandidatos(cacheCon(VENTAS_PAR), CONFIG, REGS_PAR);
const c1Par = REGS_PAR.find(r => r.clave === "c1");
assert("cobro parcial (resto 200 > 0): SÍ pendiente y con marca de vinculada",
  ccEsCobroPendiente(c1Par, CTX_PAR, false) === true &&
  ccVinculoDeRegistro(c1Par, CTX_PAR).asignado === 100 &&
  ccDisponibleCobro(c1Par, VENTAS_PAR, CACHE) === 200);
assert("el cobro parcial SÍ se propone en el buscador; el total asignado NO",
  ccCobrosCoincidentes(REGS_PAR, CTX_PAR, { activo: "USDC" }).map(r => r.clave).join(",") === "c1" &&
  ccCobrosCoincidentes(REGS_CONF, CTX_CONF, { activo: "USDC" }).length === 0);
/* Vínculo ANULADO: vuelve todo a pendiente. */
const VENTAS_ANUL = ccAnularVenta(VENTAS, VID);
const REGS_ANUL = aplicar(VENTAS_ANUL);
const CTX_ANUL = ccContextoCandidatos(cacheCon(VENTAS_ANUL), CONFIG, REGS_ANUL);
assert("vínculo ANULADO (D6): s1 y c1 vuelven a pendientes y pierden la marca",
  ccEsSalidaPendiente(REGS_ANUL.find(r => r.clave === "s1"), CTX_ANUL) === true &&
  ccEsCobroPendiente(REGS_ANUL.find(r => r.clave === "c1"), CTX_ANUL, false) === true &&
  ccVinculoDeRegistro(REGS_ANUL.find(r => r.clave === "s1"), CTX_ANUL) === null &&
  ccVinculoDeRegistro(REGS_ANUL.find(r => r.clave === "c1"), CTX_ANUL) === null);
assert("anular devuelve la clasificación ORIGINAL exacta (huella)",
  firma(REGS_ANUL) === firma(REGS));
/* Filtro, contadores y buscador con esta definición. */
const porVincular = (regs, c, verTodos) => regs.filter(r => ccPendienteDeVincular(r, c, verTodos)); // sin filtros en Revisión; se comprueba la definición de «por vincular»
assert("por vincular: s2+c5 (2); con verTodos +c3+c4 (4); vinculados y v1 fuera",
  clavesDe(porVincular(REGS_CONF, CTX_CONF, false)) === "s2,c5" &&
  clavesDe(porVincular(REGS_CONF, CTX_CONF, true)) === "s2,c3,c4,c5",
  clavesDe(porVincular(REGS_CONF, CTX_CONF, true)));
const resConf = ccResumen(REGS_CONF, CTX_CONF, false);
assert("ccResumen (cabecera): 1 salida y 1 cobro por vinculars; N=1 sin explicar, +M=2 ya explicados",
  resConf.salidas === 1 && resConf.cobros === 1 &&
  resConf.cobrosAcotados === 1 && resConf.cobrosExtras === 2 &&
  resConf.pendientes === 3 && resConf.total === 8, resConf);
assert("buscador: solo cobros por vincular (por defecto c5; con la casilla c3,c4,c5)",
  clavesDe(ccCobrosCoincidentes(REGS_CONF, CTX_CONF, {})) === "c5" &&
  clavesDe(ccCobrosCoincidentes(REGS_CONF, CTX_CONF, { verTodos: true })) === "c3,c4,c5");

// =========================================================================
console.log("== 2. T11 · botón por estado ==");
// =========================================================================
const cardS2 = ccHtmlTarjeta(s2, { candidatura: ccPendienteDeVincular(s2, CTX_CONF), vinculada: ccVinculoDeRegistro(s2, CTX_CONF) });
assert("salida pendiente → «🔗 Vincular cobro…» (sin «Añadir otro cobro»)",
  cardS2.includes("🔗 Vincular cobro…") && !cardS2.includes("Añadir otro cobro") &&
  cardS2.includes('data-accion="abrir-buscador"'));
const cardS1 = ccHtmlTarjeta(s1Conf, { candidatura: ccPendienteDeVincular(s1Conf, CTX_CONF), vinculada: ccVinculoDeRegistro(s1Conf, CTX_CONF) });
// El title explica en llano que una venta puede cobrarse en varias transferencias, sin códigos.
assert("salida ya vinculada → «➕ Añadir otro cobro» (sin «Vincular cobro…») y title de varias transferencias",
  cardS1.includes("➕ Añadir otro cobro") && !cardS1.includes("🔗 Vincular cobro…") &&
  !/\(D4\)/.test(cardS1) && // el botón no lleva burbuja
  cardS1.includes('data-accion="abrir-buscador"'));
const cardV1 = ccHtmlTarjeta(v1, { candidatura: ccPendienteDeVincular(v1, CTX_CONF), vinculada: ccVinculoDeRegistro(v1, CTX_CONF) });
const cardV2 = ccHtmlTarjeta(v2, { candidatura: ccPendienteDeVincular(v2, CTX_CONF), vinculada: ccVinculoDeRegistro(v2, CTX_CONF) });
assert("salida con contraprestación en su hash → SIN botón y SIN marca de pendiente",
  !cardV1.includes("abrir-buscador") && !cardV1.includes("cc-cand") && !cardV1.includes("vinculada"));
assert("burn VENTA sin importe → también SIN botón y SIN marca de pendiente (el motor la rechaza)",
  !cardV2.includes("abrir-buscador") && !cardV2.includes("cc-cand") && !cardV2.includes('class="cc-vinculada"'));

// =========================================================================
console.log("== 3. T13 · marca mínima «🔗 vinculada» + id de venta ==");
// =========================================================================
assert("salida vinculada: marca «🔗 vinculada» + id de venta + data-vinc",
  cardS1.includes("🔗 Venta vinculada · " + VID) && cardS1.includes('data-accion="ver-vinculo" data-venta="' + VID + '"') && cardS1.includes('data-vinc="' + VID + '"') &&
  cardS1.includes('title="Ver el vínculo."'));
const cardC1 = ccHtmlTarjeta(c1Conf, { candidatura: ccPendienteDeVincular(c1Conf, CTX_CONF), vinculada: ccVinculoDeRegistro(c1Conf, CTX_CONF) });
assert("cobro totalmente asignado: marca «🔗 vinculada» (sin marca de pendiente) y total asignado en el title",
  cardC1.includes("🔗 Cobro de una venta · " + VID) && !cardC1.includes("cc-cand") &&
  cardC1.includes("Asignado 300 de 300") && !cardC1.includes("D1:")); // «Asignado X de Y», sin códigos
const cardC1Par = ccHtmlTarjeta(c1Par, { candidatura: ccPendienteDeVincular(c1Par, CTX_PAR), vinculada: ccVinculoDeRegistro(c1Par, CTX_PAR) });
assert("cobro parcial: marca de vinculada (4.4b: sin marca de cobro por vincular)",
  !cardC1Par.includes("cc-cand") && cardC1Par.includes("🔗 Cobro de una venta · " + VID));
assert("registro sin vínculo: sin marca «vinculada» ni data-vinc",
  !cardS2.includes('class="cc-vinculada"') && cardS2.includes('data-vinc=""'));

// =========================================================================
console.log("== 4. T12 · «Total asignado:» en USD nominal ==");
// =========================================================================
const htmlVenta = ccHtmlVenta(VENTAS[0], ccResumenVenta(VENTAS[0], REGS_CONF));
// «Cobrado: 300 USD», sin burbuja ni etiquetas.
assert("card de vínculo: «Cobrado: 300 USD» sin «Σ» ni etiquetas que siempre dicen lo mismo",
  htmlVenta.includes("Cobrado: 300 USD") && !htmlVenta.includes("Σ") && !htmlVenta.includes("CONFIRMADO") &&
  !htmlVenta.includes("liquidación") && !htmlVenta.includes("Fase 5") && !/\b(D[0-9]|DU-[0-9])\b/.test(htmlVenta));
/* js/15 escribe ajustes_usuario a propósito, pero solo en
   ccGuardarAjustesDecision (decisiones de la cola, con su guardado): las
   guardas de aquí miran el resto del módulo. */
const fuente = fs.readFileSync(path.join(BASE, "15-correcciones.js"), "utf8")
  .replace(/async function ccGuardarAjustesDecision[\s\S]*?\r?\n}\r?\n/, "");
assert("el fuente ya no pinta «Σ» en la card de vínculo (solo queda en comentarios)",
  !/cc-amt">Σ/.test(fuente) && !/">Σ /.test(fuente));

// =========================================================================
console.log("== 5. T10 · lenguaje llano (lista/casilla/marca) y 4.8 sin casilla ==");
// =========================================================================
const cab = ccHtmlCabecera(REGS_CONF, CTX_CONF);
assert("cabecera: «por decidir» y, si las hay, «por vincular» (textos simplificados)",
  cab.includes("por decidir") && cab.includes("por vincular") &&
  !cab.includes("pendientes") && !cab.includes("registros en la cola"));
assert("4.8/T18 y 4.4b: sin casilla «ver todos» ni recuento de cobros en la cabecera",
  !cab.includes("cc-ver-todos-box") && !cab.includes("entrantes ya explicados"), cab.slice(0, 260));
const dlg = ccHtmlDialogoEstructura(s2);
const dlgVinc = ccHtmlDialogoEstructura(s1Conf, { ventaIds: [VID] });
assert("4.8/T18: buscador sin casilla «ver todos» (el escape vive en su vacío)",
  !dlg.includes('name="verTodos"') && !dlg.includes("ver todos los entrantes de stablecoin"));
// Sin el aviso de «otro cobro» (repetiría el título).
assert("buscador desde salida vinculada (T11/4.9/4.10): título «➕ Añadir otro cobro», sin aviso D4",
  dlgVinc.includes("➕ Añadir otro cobro") &&
  !dlgVinc.includes("Se añadirá como otro cobro") && dlg.includes("🔗 Vincular cobro"));
const form = ccHtmlFormEstructura(s2, c5, ccPrecargaFormulario(c5, [], CACHE), [], null, null);
const uiHtml = [cab, cardS1, cardS2, cardC1, cardV1, cardV2, dlg, dlgVinc, form].join("\n");
assert("sin jerga en los textos de UI: ni «cola», ni «conmutador», ni «chapa»",
  !/\bcola\b/i.test(uiHtml) && !/conmutador/i.test(uiHtml) && !/chapa/i.test(uiHtml));

// =========================================================================
console.log("== 6. T15/T16 + 4.8/T19 · menos texto, detalle en burbujas ==");
// =========================================================================
assert("4.8/T19: sin ayudas visibles largas ni campos retirados (pregunta, importe, moneda, avanzado)",
  !form.includes("cc-form-ayuda") && !form.includes("¿Está cobrada del todo") &&
  !form.includes("Importe pactado") && !form.includes('name="moneda"') &&
  !form.includes("estado_tecnico"));
// La burbuja dice solo el dato.
assert("lo precargado de 4.6 se explica en la burbuja de la cantidad",
  form.includes("Todo lo libre de este cobro.") &&
  form.includes('class="cc-info" tabindex="0"'));
assert("burbujas alcanzables con teclado: cc-info con tabindex=0 y aria-label con el detalle",
  (form.match(/class="cc-info" tabindex="0"/g) || []).length >= 1 &&
  /aria-label="Información: [^"]+"/.test(form) &&
  ccInfo("detalle x") === '<span class="cc-info" tabindex="0" aria-label="Información: detalle x">ⓘ<span class="cc-burbuja" role="tooltip">detalle x</span></span>');
const lineasCss = fuente.split("\n").filter(l => /cc-info|cc-burbuja|cc-vinculada/.test(l) && l.includes("{"));
assert("CSS de burbujas/marca: visible en hover Y :focus (teclado), oculta por defecto",
  fuente.includes(".cc-info .cc-burbuja{display:none") &&
  fuente.includes(".cc-info:hover .cc-burbuja,.cc-info:focus .cc-burbuja,.cc-info:focus-within .cc-burbuja{display:block}") &&
  lineasCss.length >= 5);
assert("CSS nuevo solo con tokens del design system (modo oscuro correcto): sin hex hardcodeados",
  lineasCss.every(l => !/#[0-9a-fA-F]{3,8}\b/.test(l)),
  lineasCss.filter(l => /#[0-9a-fA-F]{3,8}\b/.test(l)));

// =========================================================================
console.log("== 7. Flujos 4.2/4.3 INTACTOS con la definición nueva ==");
// =========================================================================
const refS2 = ccReferenciaDeRegistro(s2, CACHE);
const refC5 = ccReferenciaDeRegistro(c5, CACHE);
const borrador2 = ccBorradorVenta({
  salida: s2, cobro: c5, refSalida: refS2, refCobro: refC5,
  cantidadAsignada: 60, estadoLiquidacion: "COMPLETA",
  importeEsperado: null, monedaEsperada: "USD", nota: "segundo vínculo",
});
const res2 = ccAplicarBorradorABloque(VENTAS, { borrador: borrador2, refSalida: refS2, refCobro: refC5 });
assert("4.2: nueva venta CONFIRMADA con ids pd_*/as_* sin colisiones",
  res2.ventas.length === 2 && res2.ventas[1].estado === "CONFIRMADO" &&
  /^pd_\d{8}_\d{3}$/.test(res2.ventas[1].id) && res2.ventas[1].id !== VID &&
  res2.ventas[1].asignaciones[0].id === "as_002");
const sim2 = ccSimularBloque(REGS, CACHE, res2.ventas);
const dS2 = sim2.diff.find(d => d.clave === "s2");
const campo = (d, c) => (d.cambios.find(x => x.campo === c) || {});
assert("4.2: la simulación aplica VENTA/GPP_INMUEBLE con importe 60 y marcador en s2",
  sim2.info.aplicados.length === 2 && dS2 &&
  campo(dS2, "categoria").despues === "VENTA" &&
  campo(dS2, "importe_usdt").despues === 60 &&
  campo(dS2, "pago_diferido").despues.rol === "salida");
const REGS_CONF2 = aplicar(res2.ventas);
const CTX_CONF2 = ccContextoCandidatos(cacheCon(res2.ventas), CONFIG, REGS_CONF2);
assert("con 2 vínculos: 0 salidas y 0 cobros por vincular acotados (todo vinculado o explicado)",
  ccResumen(REGS_CONF2, CTX_CONF2, false).salidas === 0 &&
  ccResumen(REGS_CONF2, CTX_CONF2, false).cobrosAcotados === 0 &&
  ccVinculoDeRegistro(REGS_CONF2.find(r => r.clave === "s2"), CTX_CONF2).rol === "salida");
const ventasRest = ccRestaurarVenta(VENTAS_ANUL, VID);
assert("4.3: restaurar reaplica sin duplicar (huella idéntica al confirmado)",
  firma(aplicar(ventasRest)) === firma(REGS_CONF) &&
  firma(aplicar(VENTAS)) === firma(REGS_CONF));
assert("4.3: editar cambia la cantidad en su sitio (id de asignación conservado)",
  VENTAS_PAR[0].asignaciones[0].id === "as_001" &&
  REGS_PAR.find(r => r.clave === "s1").importe_usdt === 100 &&
  REGS_PAR.find(r => r.clave === "s1").revisar === true); // PARCIAL → sigue en revisión

// =========================================================================
console.log("== 8. PUERTA: persistencia solo vía patrón js/13 ==");
// =========================================================================
const prohibidos = [
  [/guardarCacheDisco\s*\(/, "guardarCacheDisco("],
  [/guardarJsonComo\s*\(/, "guardarJsonComo("],
  [/descargarJson\s*\(/, "descargarJson("],
  [/localStorage\s*\./, "localStorage."],
  [/state\.cache\s*=[^=]/, "state.cache = ..."],
  [/state\.cacheDirty\s*=[^=]/, "state.cacheDirty = ..."],
  [/state\.registros\s*=[^=]/, "state.registros = ..."],
  [/\.ajustes_usuario\s*=[^=]/, ".ajustes_usuario = ..."],
  [/pagos_diferidos\.ventas\.(push|pop|shift|unshift|splice)\s*\(/, "mutación directa de ventas"],
];
for (const [re, nombre] of prohibidos) {
  assert("fuente sin " + nombre, !re.test(fuente));
}
assert("fuente CON marcarCacheDirty( y autoGuardarCache( (guardado 4.2)",
  /marcarCacheDirty\s*\(/.test(fuente) && /autoGuardarCache\s*\(/.test(fuente));
assert("4.8/T18: sin casilla global «ver todos» ni propuestas en memoria (fuentes limpias)",
  !/ccVerTodosCobros/.test(fuente) && !/cc-ver-todos/.test(fuente) &&
  !/let ccPropuestas|ccPropuestas\s*=|ccPropuestas\./.test(fuente));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
