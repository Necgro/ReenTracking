/* Test unitario del flujo de vincular en dos pasos, sin ruido.
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - T17 · DOS PASOS SIN RUIDO: sin propuestas de emparejamiento en
 *   memoria (ccPropuestas/ccAñadirPar/ccQuitarPar/ccPodarPropuestas y sus
 *   líneas en las cards y contador de cabecera); el botón primario del
 *   buscador es «🔗 Vincular pago…» y abre directo el formulario (se
 *   comprueba en runtime; aquí: título del diálogo y que esas funciones no existen).
 * - T18 · sin casilla «ver todos los entrantes de stablecoin» en cabecera y
 *   diálogo: el acotado es la única vista por defecto; la vía de escape
 *   vive en el vacío del buscador (ccDlg.extra, runtime) y ccResumen sigue
 *   dando cobrosExtras para explicarlo con números en la cabecera.
 * - T19 · formulario MÍNIMO: tarjeta-par VENTA ↔ PAGO DIFERIDO (ccHtmlParColumna:
 *   cantidad grande, propiedad/activo, fecha, hash con enlace, direcciones en
 *   el title, línea «Ya asignado a otras ventas» solo si asignado > 0); sin
 *   etiquetas «Hoy: …», sin ayuda visible de la cantidad (queda su ⓘ), sin
 *   pregunta de liquidación, sin importe pactado, sin moneda y sin plegable
 *   técnico; precarga = {cantidadAsignada, nota}; el borrador se guarda con
 *   estado_liquidacion COMPLETA e importe_esperado_usd/moneda null.
 * - T20 · ccHtmlAvisosVinculo: línea de resumen de lo que hará el motor,
 *   avisos CORTOS de una línea (ccAvisosBorrador: cruce de ejercicio y resto
 *   parcial) y errores de validación, sin campos en crudo; sin diff → aviso
 *   honesto.
 * - Flujos de guardado y gestión INTACTOS: guardar COMPLETA, anular/restaurar
 *   con huellas.
 * - PUERTA: patrón js/13; sin ccPropuestas ni ccVerTodosCobros en el código.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_48.js
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
const get = n => vm.runInContext(n, sandbox);
const { ccContextoCandidatos, ccPrecargaFormulario, ccHtmlFormEstructura, ccHtmlParColumna,
        ccHtmlDialogoEstructura, ccHtmlCabecera, ccHtmlAvisosVinculo, ccAvisosBorrador,
        ccReferenciaDeRegistro, ccBorradorVenta, ccAplicarBorradorABloque, ccSimularBloque,
        ccSimularVinculo, ccAnularVenta, ccRestaurarVenta, ccResumen, ccResumenVenta,
        ccHtmlVenta, ccInfo } = sandbox;
const USDT = get("USDT"), USDC = get("USDC");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "11".repeat(20);
const V = "0x" + "22".repeat(20);
const T = "0x" + "77".repeat(20);
const D = "0x" + "d1".repeat(20);
const P1 = "0x" + "a1".repeat(20);
const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
function reg(hash, contrato, origen, destino, cantidad, categoria,
             { simbolo = null, fecha = "2026-05-12 09:45:46", clave = null,
               revisar = false, nota = "", inmueble = null } = {}) {
  return {
    clave: clave || hash + "::" + contrato, fecha,
    hash: hash.toLowerCase(), contrato: String(contrato).toLowerCase(),
    token: null, simbolo, cantidad, categoria, subcategoria: "PENDIENTE",
    inmueble, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen: origen.toLowerCase(), destino: destino.toLowerCase(),
    fuente: "ONCHAIN", nota, revisar,
  };
}
const CACHE = {
  catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1" } },
  contratos_aprendidos: {},
  transacciones: {
    wallet_tokens: [
      { hash: H(1), contractAddress: P1, from: W, to: T, value: "250000000000000000000", tokenDecimal: "18", timeStamp: "1778556800" },
      { hash: H(2), contractAddress: USDC, from: T, to: W, value: "300000000", tokenDecimal: "6", timeStamp: "1778656800" },
      { hash: H(3), contractAddress: USDT, from: D, to: V, value: "400000000", tokenDecimal: "6", timeStamp: "1775816000" },
    ],
    vault_tokens: [], wallet_normales: [], wallet_internas: [], vault_normales: [],
  },
  pagos_diferidos: { version: 1, ventas: [] },
  ajustes_usuario: {},
};
const CONFIG = { wallet: W, vault: V };
const ctx = ccContextoCandidatos(CACHE, CONFIG);
const SALIDA = reg(H(1), P1, W, T, 250, "REVISAR", { simbolo: "RALC1", revisar: true, inmueble: "Prueba Alcazaba 1", clave: "s1" });
const COBRO = reg(H(2), USDC, T, W, 300, "DEPOSITO", { simbolo: "USDC", fecha: "2026-05-20 18:00:00", clave: "c1" });
const DIV = reg(H(3), USDT, D, V, 400, "RENDIMIENTO", { simbolo: "USDT", fecha: "2026-04-10 12:00:00", clave: "c3" });
const REGS = [SALIDA, COBRO, DIV];
/* js/15 escribe ajustes_usuario a propósito, pero solo en
   ccGuardarAjustesDecision (decisiones de la cola, con su guardado): las
   guardas de aquí miran el resto del módulo. */
const fuente = fs.readFileSync(path.join(BASE, "15-correcciones.js"), "utf8")
  .replace(/async function ccGuardarAjustesDecision[\s\S]*?\r?\n}\r?\n/, "");

// =========================================================================
console.log("== 1. T17 · sin propuesta intermedia: el buscador abre directo el formulario ==");
// =========================================================================
assert("la API de propuestas desaparece del código (ccPropuestas/ccAñadirPar/ccQuitarPar/ccPodarPropuestas)",
  !/let ccPropuestas|ccPropuestas\s*=|ccPropuestas\./.test(fuente) &&
  !/function ccAñadirPar|function ccQuitarPar|function ccPodarPropuestas/.test(fuente));
const dlg = ccHtmlDialogoEstructura(SALIDA);
assert("diálogo: botón primario «🔗 Vincular cobro…» y sin «Proponer emparejamiento»",
  dlg.includes("🔗 Vincular cobro…") && !dlg.includes("Proponer emparejamiento"));
// El pie no explica (lo dice el recuento: «pulsa ➕ en el que pagó esta venta»).
assert("diálogo: el pie sin explicación y el botón para continuar",
  !dlg.includes("continúa al formulario") && dlg.includes("cc-dlg-proponer"));
const card = ccHtmlFormEstructura(SALIDA, COBRO, ccPrecargaFormulario(COBRO, [], CACHE), 0, 300, null, null);
assert("cards y diálogo SIN líneas de propuesta ni botón «📝 Crear vínculo…»",
  !card.includes("cc-prop") && !dlg.includes("📝 Crear vínculo…") &&
  !/class="cc-prop"/.test(fuente));

// =========================================================================
console.log("== 2. T18 · sin casilla «ver todos»: acotado por defecto, escape en el vacío ==");
// =========================================================================
assert("diálogo SIN casilla verTodos (el escape es contextual, en runtime)",
  !dlg.includes('name="verTodos"') && !/cc-ver-todos/.test(fuente));
assert("el código ya no tiene estado global de la casilla (ccVerTodosCobros fuera)",
  !/ccVerTodosCobros/.test(fuente));
const cab = ccHtmlCabecera(REGS, ctx);
const res = ccResumen(REGS, ctx, false);
assert("cabecera sin casilla ni recuento de cobros (4.4b); ccResumen sigue contando cobrosExtras",
  !cab.includes("cc-ver-todos-box") && res.cobrosExtras === 1 &&
  !cab.includes("entrantes ya explicados"),
  { cab: cab.slice(0, 240), res });
assert("ccResumen sigue dando acotados/extras para los números (puro)",
  res.cobrosAcotados === 1 && res.cobrosExtras === 1 && res.salidas === 1, res);

// =========================================================================
console.log("== 3. T19 · formulario mínimo con tarjeta-par ==");
// =========================================================================
const pre = ccPrecargaFormulario(COBRO, [], CACHE);
assert("precarga mínima: {cantidadAsignada: 300, nota: \"\"}",
  JSON.stringify(pre) === JSON.stringify({ cantidadAsignada: 300, nota: "" }), pre);
assert("tarjeta-par: etiquetas VENTA y COBRO, cantidades grandes y hash con enlace",
  card.includes(">VENTA<") && card.includes('cc-par-label">COBRO') &&
  card.includes("250 RALC1") && card.includes("300 USDC") &&
  card.includes('class="cc-hash-enlace mono cc-par-hash"') && card.includes("https://polygonscan.com/tx/" + SALIDA.hash) &&
  card.includes("https://polygonscan.com/tx/" + COBRO.hash));
assert("tarjeta-par: propiedad y activo como subtítulo; fechas presentes",
  card.includes("Prueba Alcazaba 1") && card.includes("USDC") &&
  card.includes("12/05/2026") && card.includes("20/05/2026"));
assert("tarjeta-par: direcciones completas en el title de la columna (menos texto visible)",
  card.includes('title="' + W + " → " + T + '"') && // solo las dos direcciones
  card.includes('title="' + T + " → " + W + '"'));
assert("tarjeta-par: SIN etiquetas «Hoy: …» de categoría/subcategoría",
  !card.includes("Hoy:"));
assert("sin asignaciones previas: ningún bloque «COBRO YA VINCULADO»",
  !card.includes("COBRO YA VINCULADO"));
const cardAsig = ccHtmlFormEstructura(SALIDA, COBRO, pre, [{ reg: COBRO, asignado: 100 }], null, null);
assert("4.10: con asignaciones previas, el cobro ya vinculado se ve por separado y en lectura («COBRO YA VINCULADO · asignado 100»)",
  cardAsig.includes("COBRO YA VINCULADO · asignado 100") && cardAsig.includes("300 USDC"));
assert("columna pura ccHtmlParColumna: sin hash -> estado honesto",
  ccHtmlParColumna("VENTA", reg("", P1, W, T, 5, "REVISAR"), null, null).includes("sin hash"));
assert("cantidad: label llano + input name=cantidad + ⓘ con lo precargado (sin ayuda visible)",
  card.includes("Para esta venta (USDC)") &&
  card.includes('name="cantidad"') && card.includes('class="cc-info" tabindex="0"') &&
  !card.includes("cc-form-ayuda") && card.includes("Todo lo libre de este cobro."));
assert("nota documental conservada (name=nota)", card.includes('name="nota"'));
assert("fuera pregunta/importe/moneda/avanzado-técnico y botón «✅ Confirmar vínculo»",
  !card.includes("¿Está cobrada del todo") && !card.includes('name="importe"') &&
  !card.includes('name="moneda"') && !card.includes("estado_tecnico") &&
  card.includes("✅ Confirmar vínculo") && !card.includes("Confirmar y guardar"));

// =========================================================================
console.log("== 4. T19 · liquidación siempre COMPLETA al guardar ==");
// =========================================================================
const refS = ccReferenciaDeRegistro(SALIDA, CACHE);
const refC = ccReferenciaDeRegistro(COBRO, CACHE);
const borrador = ccBorradorVenta({
  salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC,
  cantidadAsignada: 300, estadoLiquidacion: "COMPLETA",
  importeEsperado: null, monedaEsperada: "USD", nota: "cierre",
});
const resBloque = ccAplicarBorradorABloque([], { borrador, refSalida: refS, refCobro: refC });
assert("venta guardada: estado_liquidacion COMPLETA, importe_esperado_usd y moneda esperada null/USD",
  resBloque.ventas[0].estado_liquidacion === "COMPLETA" &&
  resBloque.ventas[0].importe_esperado_usd === null &&
  resBloque.ventas[0].moneda_esperada === "USD");
const regsConf = REGS.map(r => Object.assign({}, r));
get("aplicarPagosDiferidos")(regsConf, { pagos_diferidos: { version: 1, ventas: resBloque.ventas }, ajustes_usuario: {} });
assert("motor: con COMPLETA la venta sale de revisión (D5 cumplido sin pregunta)",
  regsConf.find(r => r.clave === "s1").revisar === false &&
  regsConf.find(r => r.clave === "s1").categoria === "VENTA");
const firmaBase = JSON.stringify(REGS.map(r => [r.clave, r.categoria, r.importe_usdt, r.revisar, r.pago_diferido || null]));
const regsAnul = REGS.map(r => Object.assign({}, r));
get("aplicarPagosDiferidos")(regsAnul, { pagos_diferidos: { version: 1, ventas: ccAnularVenta(resBloque.ventas, resBloque.ventaId) }, ajustes_usuario: {} });
assert("4.3 intacto: anular devuelve la clasificación original exacta",
  JSON.stringify(regsAnul.map(r => [r.clave, r.categoria, r.importe_usdt, r.revisar, r.pago_diferido || null])) === firmaBase);
const regsRest = REGS.map(r => Object.assign({}, r));
get("aplicarPagosDiferidos")(regsRest, { pagos_diferidos: { version: 1, ventas: ccRestaurarVenta(ccAnularVenta(resBloque.ventas, resBloque.ventaId), resBloque.ventaId) }, ajustes_usuario: {} });
assert("4.3 intacto: restaurar reaplica sin duplicar (huella = confirmado)",
  JSON.stringify(regsRest.map(r => [r.clave, r.categoria, r.importe_usdt, r.revisar, r.pago_diferido || null])) ===
  JSON.stringify(regsConf.map(r => [r.clave, r.categoria, r.importe_usdt, r.revisar, r.pago_diferido || null])));

// =========================================================================
console.log("== 5. T20 · avisos cortos + diff plegado ==");
// =========================================================================
const sim = ccSimularVinculo(REGS, CACHE, borrador);
const av = ccAvisosBorrador(SALIDA, COBRO, borrador, 300, sim);
assert("avisos vacíos sin cruce de ejercicio ni resto parcial", av.avisos.length === 0, av.avisos);
const zona = ccHtmlAvisosVinculo(sim, av.avisos, av.errores, REGS);
assert("zona de avisos: resumen de lo que hará el motor + aplicado con total",
  zona.includes("✔ Al confirmar, la venta queda cobrada y sale de la lista.") &&
  zona.includes("✔ Cobrado: 300 USD (300)."));
// Sin el plegable «Ver cambios» (campos en crudo).
assert("zona de avisos: sin el plegable «Ver cambios» ni campos en crudo",
  !zona.includes("Ver cambios") && !zona.includes("cc-form-avanzado") &&
  !zona.includes("pago_diferido"));
const simVacia = { diff: [], info: { aplicados: [], problemas: [], conflictos: [] } };
const zonaVacia = ccHtmlAvisosVinculo(simVacia, [], [], REGS);
assert("sin diff: aviso honesto «el motor no aplicaría este vínculo» y sin plegable",
  zonaVacia.includes("Este vínculo no cambiaría nada.") && !zonaVacia.includes("Ver cambios"));
const SALIDA_X = Object.assign({}, SALIDA, { fecha: "2025-12-15 10:00:00" });
const COBRO_X = Object.assign({}, COBRO, { fecha: "2026-01-10 10:00:00" });
const avX = ccAvisosBorrador(SALIDA_X, COBRO_X, borrador, 300, sim);
assert("aviso CORTO de cruce de ejercicio (D1) con ambos años en una línea",
  avX.avisos.length === 1 && avX.avisos[0] === "Venta de 2025 y cobro de 2026." && !avX.avisos[0].includes("D1") && // sin códigos
  avX.avisos[0].includes("2025") && avX.avisos[0].includes("2026") && avX.avisos[0].length < 160,
  avX.avisos);
const avP = ccAvisosBorrador(SALIDA, COBRO,
  ccBorradorVenta({ salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC,
                    cantidadAsignada: 100, estadoLiquidacion: "COMPLETA", importeEsperado: null, nota: "" }),
  300, ccSimularVinculo(REGS, CACHE, ccBorradorVenta({ salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC,
    cantidadAsignada: 100, estadoLiquidacion: "COMPLETA", importeEsperado: null, nota: "" })));
assert("aviso CORTO de resto parcial en una línea",
  avP.avisos.length === 1 && avP.avisos[0].includes("Quedan 200 USDC") && avP.avisos[0].length < 120,
  avP.avisos);
const zonaErr = ccHtmlAvisosVinculo(simVacia, [], ["motivo de bloqueo"], REGS);
assert("errores de validación visibles (nada se guarda a ciegas)",
  zonaErr.includes("⛔ motivo de bloqueo"));
const regsConf48 = REGS.map(r => Object.assign({}, r));
get("aplicarPagosDiferidos")(regsConf48, { pagos_diferidos: { version: 1, ventas: resBloque.ventas }, ajustes_usuario: {} });
const simYa = ccSimularBloque(regsConf48, CACHE, resBloque.ventas);
const zonaYa = ccHtmlAvisosVinculo(simYa, [], [], regsConf48);
assert("edición sin cambios: mensaje honesto «✔ Sin cambios.» (sin falso «no aplicaría»)",
  simYa.diff.length === 0 && simYa.info.aplicados.length === 1 &&
  zonaYa.includes("✔ Sin cambios.") && !zonaYa.includes("no cambiaría nada"), zonaYa);
assert("burbuja ⓘ reutilizable (T16) intacta",
  ccInfo("x").includes('class="cc-info" tabindex="0"') && ccInfo("x").includes('class="cc-burbuja"'));

// =========================================================================
console.log("== 6. T21 · «➕ Añadir otro cobro…» también en Resueltos ==");
// =========================================================================
const ventaConf48 = resBloque.ventas[0];
const resumenConSalida = ccResumenVenta(ventaConf48, regsConf48);
const htmlVinc = ccHtmlVenta(ventaConf48, resumenConSalida);
assert("venta CONFIRMADA con salida en la sesión: botón «➕ Añadir otro cobro…» con la clave de la salida",
  htmlVinc.includes("➕ Añadir otro cobro<") &&
  htmlVinc.includes('data-accion="abrir-buscador" data-clave="s1"') &&
  !htmlVinc.includes("D4"), htmlVinc.slice(0, 80)); // sin códigos ni burbuja
const resumenSinSalida = ccResumenVenta(ventaConf48, []);
assert("venta cuya salida NO está en la sesión: sin botón ➕ (estado honesto)",
  !ccHtmlVenta(ventaConf48, resumenSinSalida).includes("Añadir otro cobro"));
const ventaAnul48 = ccAnularVenta(resBloque.ventas, resBloque.ventaId)[0];
// Un anulado no se enseña ni se restaura; si llegara a pintarse, sin botones.
assert("venta ANULADA: sin ➕ ni «Restaurar»",
  !ccHtmlVenta(ventaAnul48, ccResumenVenta(ventaAnul48, regsConf48)).includes("Añadir otro cobro") &&
  !ccHtmlVenta(ventaAnul48, ccResumenVenta(ventaAnul48, regsConf48)).includes("Restaurar"));

// =========================================================================
console.log("== 7. PUERTA: patrón js/13 ==");
const prohibidos = [
  [/guardarCacheDisco\s*\(/, "guardarCacheDisco("],
  [/guardarJsonComo\s*\(/, "guardarJsonComo("],
  [/descargarJson\s*\(/, "descargarJson("],
  [/localStorage\s*\./, "localStorage."],
  [/state\.cache\s*=[^=]/, "state.cache = ..."],
  [/state\.cacheDirty\s*=[^=]/, "state.cacheDirty = ..."],
  [/state\.registros\s*=[^=]/, "state.registros = ..."],
  [/\.ajustes_usuario\s*=[^=]/, ".ajustes_usuario = ..."],
];
for (const [re, nombre] of prohibidos) assert("fuente sin " + nombre, !re.test(fuente));
assert("fuente CON marcarCacheDirty( y autoGuardarCache( (patrón js/13)",
  /marcarCacheDirty\s*\(/.test(fuente) && /autoGuardarCache\s*\(/.test(fuente));
assert("CSS de la tarjeta-par solo con tokens (modo oscuro correcto)",
  fuente.split("\n").filter(l => l.includes(".cc-par") && l.includes("{"))
    .every(l => !/#[0-9a-fA-F]{3,8}\b/.test(l)));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
