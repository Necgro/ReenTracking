/* Test unitario de la UX de vínculos: sin pregunta de liquidación, importe
 * pactado, moneda ni plegable técnico en la UI (liquidación siempre
 * COMPLETA); «ver todos» es la vía de escape del buscador.
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - T2 · copy llano del formulario: «Parte de este cobro que corresponde a
 *   esta venta» con el detalle del reparto en la burbuja ⓘ (un cobro
 *   repartido entre 2 salidas); los nombres de los campos que leen el
 *   guardado y la gestión de vínculos (cantidad/nota) no cambian.
 * - T3 · buscador (ccHtmlDialogoEstructura + ccCobrosCoincidentes): importe
 *   como RANGO desde/hasta (importeMin/importeMax).
 * - T4 · candidatos a cobro acotados (ccEsCobroEntrante/ccEsCobroCandidato/
 *   ccCandidatura/ccFiltrar/ccResumen): por defecto solo entrantes de
 *   stablecoin sin contraparte explicada (DEPOSITO o REVISAR); verTodos=true
 *   (parámetro puro, usado por la vía de escape del buscador) devuelve la
 *   definición completa; las salidas NO cambian; un DEPOSITO «verificar
 *   origen» sigue siendo candidato.
 * - Flujos de guardado y gestión de vínculos INTACTOS: borrador -> bloque ->
 *   simulación aplicable; anular vuelve a la clasificación original;
 *   restaurar reaplica sin duplicar; editar cambia la cantidad.
 * - PUERTA: persistencia solo vía patrón js/13; sin propuestas en memoria
 *   ni casilla global «ver todos».
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_46.js
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
const { ccHtmlFormEstructura, ccHtmlDialogoEstructura, ccHtmlCabecera, ccHtmlTarjeta,
        ccPrecargaFormulario, ccContextoCandidatos, ccCandidatura, ccEsCobroCandidato,
        ccEsCobroEntrante, ccCobrosCoincidentes, ccPendienteDeVincular, ccResumen,
        ccReferenciaDeRegistro, ccBorradorVenta, ccAplicarBorradorABloque, ccSimularBloque,
        ccAnularVenta, ccRestaurarVenta, ccEditarVenta, ccDisponibleCobro } = sandbox;
const CC_CATEGORIAS_COBRO_ACOTADO = get("CC_CATEGORIAS_COBRO_ACOTADO");
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
    ],
    vault_tokens: [
      { hash: H(3), contractAddress: USDT, from: D, to: V, value: "400000000", tokenDecimal: "6", timeStamp: "1775816000" },
      { hash: H(4), contractAddress: USDT, from: D, to: V, value: "12000000", tokenDecimal: "6", timeStamp: "1775916000" },
    ],
    wallet_normales: [], wallet_internas: [], vault_normales: [],
  },
  pagos_diferidos: { version: 1, ventas: [] },
  ajustes_usuario: {},
};
const CONFIG = { wallet: W, vault: V };
const ctx = ccContextoCandidatos(CACHE, CONFIG);

const SALIDA = reg(H(1), P1, W, T, 250, "REVISAR", { simbolo: "RALC1", revisar: true, inmueble: "Prueba Alcazaba 1", nota: "envio de tokens de un inmueble sin contraprestacion en el hash", clave: "s1" });
const COBRO = reg(H(2), USDC, T, W, 300, "DEPOSITO", { simbolo: "USDC", fecha: "2026-05-20 18:00:00", nota: "verificar origen (venta P2P, bridge o exchange)", clave: "c1" });
const DIV = reg(H(3), USDT, D, V, 400, "RENDIMIENTO", { simbolo: "USDT", fecha: "2026-04-10 12:00:00", clave: "c3" });
const REW = reg(H(4), USDT, D, V, 12, "REWARD", { simbolo: "USDT", fecha: "2026-04-11 12:00:00", clave: "c4" });
const REGS = [SALIDA, COBRO, DIV, REW];

// =========================================================================
console.log("== 1. T4 · candidatos a cobro acotados (puro) ==");
// =========================================================================
assert("categorías acotadas = DEPOSITO y REVISAR",
  JSON.stringify(CC_CATEGORIAS_COBRO_ACOTADO) === JSON.stringify(["DEPOSITO", "REVISAR"]),
  CC_CATEGORIAS_COBRO_ACOTADO);
assert("DEPOSITO entrante (caso real «verificar origen») SIGUE siendo cobro",
  ccCandidatura(COBRO, ctx) === "cobro");
assert("REVISAR entrante es cobro (sin contraparte explicada)",
  ccCandidatura(reg(H(5), USDT, T, V, 60, "REVISAR", { revisar: true, clave: "c5" }), ctx) === "cobro");
assert("RENDIMIENTO entrante NO es cobro por defecto (contraparte explicada por CSV)",
  ccCandidatura(DIV, ctx) === null && ccEsCobroCandidato(DIV, ctx) === false);
assert("REWARD entrante NO es cobro por defecto", ccCandidatura(REW, ctx) === null);
assert("con verTodos=true ambos vuelven a ser cobros (definición completa 3.2)",
  ccCandidatura(DIV, ctx, true) === "cobro" && ccCandidatura(REW, ctx, true) === "cobro");
assert("la estructura no cambia: traspaso propio NO es cobro ni con verTodos",
  ccCandidatura(reg(H(6), USDT, W, V, 100, "DEPOSITO", { clave: "n1" }), ctx, true) === null);
assert("ccEsCobroEntrante ignora la categoría (estructura 3.2 intacta)",
  ccEsCobroEntrante(DIV, ctx) === true && ccEsCobroEntrante(SALIDA, ctx) === false);
assert("las salidas NO cambian (con y sin verTodos)",
  ccCandidatura(SALIDA, ctx) === "salida" && ccCandidatura(SALIDA, ctx, true) === "salida");
const porVincular = (regs, c, verTodos) => regs.filter(r => ccPendienteDeVincular(r, c, verTodos)); // sin filtros en Revisión; se comprueba la definición de «por vincular»
assert("por vincular respeta el parámetro verTodos (2 por defecto: s1+c1; 4 con verTodos)",
  porVincular(REGS, ctx).length === 2 && porVincular(REGS, ctx, true).length === 4);
const resD = ccResumen(REGS, ctx), resV = ccResumen(REGS, ctx, true);
assert("ccResumen: 1 cobro por defecto, 3 con verTodos; salidas iguales",
  resD.cobros === 1 && resV.cobros === 3 && resD.salidas === 1 && resV.salidas === 1,
  { resD, resV });

// =========================================================================
console.log("== 2. T4/4.8 · cabecera sin casilla: el acotado se explica con números ==");
// =========================================================================
const cabD = ccHtmlCabecera(REGS, ctx);
assert("cabecera: SIN casilla «ver todos» (4.8/T18: la vía de escape vive en el buscador)",
  !cabD.includes("cc-ver-todos-box") && !cabD.includes('name="verTodos"'));
// La cabecera no cuenta cobros: Revisión solo lleva lo que pide una decisión.
// Solo «M ventas por vincular» (cuántos hay por decidir lo dice su fila, P21).
assert("cabecera: ventas por vincular; sin cobros ni entrantes explicados",
  cabD.includes("<b>1</b> venta por vincular") && !cabD.includes("por decidir") && !cabD.includes("cobros") &&
  !cabD.includes("entrantes ya explicados"), cabD.slice(0, 260));
assert("cabecera: lenguaje llano (sin «cola»)", !/\bcola\b/i.test(cabD));
const badge = ccHtmlTarjeta(COBRO, { candidatura: ccCandidatura(COBRO, ctx) });
// «SIN contraparte explicada» se dice en llano («sin explicación»).
assert("4.4b (T70): un cobro ya no lleva marca «por vincular» en su card", !badge.includes("cc-cand"));

// =========================================================================
console.log("== 3. T2/4.8 · formulario mínimo: copy llano y tarjeta-par ==");
// =========================================================================
const precarga = ccPrecargaFormulario(COBRO, [], CACHE);
const form = ccHtmlFormEstructura(SALIDA, COBRO, precarga, 0, 300, null, null);
// «Para esta venta (USDC)» y la ⓘ corta.
assert("«Para esta venta (USDC)» y sin «Cantidad a asignar»",
  form.includes("Para esta venta (USDC)") && !form.includes("Cantidad a asignar"));
// La ⓘ dice solo el dato.
assert("lo precargado (todo lo libre del cobro) vive en la burbuja ⓘ",
  form.includes("Todo lo libre de este cobro.") &&
  form.includes('class="cc-info" tabindex="0"'));
assert("4.8/T19: fuera pregunta de liquidación, importe pactado, moneda y plegable técnico",
  !form.includes("¿Está cobrada del todo esta venta?") && !form.includes("Importe pactado") &&
  !form.includes('name="moneda"') && !form.includes("estado_tecnico") &&
  !form.includes("Avanzado: estado técnico"));
assert("4.8/T19: tarjeta-par VENTA ↔ COBRO con cantidades, propiedad/activo, fecha y hash",
  form.includes(">VENTA<") && form.includes('cc-par-label">COBRO') &&
  form.includes("250 RALC1") && form.includes("300 USDC") &&
  form.includes("Prueba Alcazaba 1") && form.includes("20/05/2026") &&
  form.includes("https://polygonscan.com/tx/" + COBRO.hash));
assert("4.8/T19: sin etiquetas «Hoy: …» de categoría en las tarjetas del par",
  !form.includes("Hoy:"));
assert("sin asignaciones previas no se pinta ningún bloque «COBRO YA VINCULADO»",
  !form.includes("COBRO YA VINCULADO"));
const formConPrevio = ccHtmlFormEstructura(SALIDA, COBRO, precarga, [{ reg: COBRO, asignado: 100 }], null, null);
assert("4.10: los cobros ya vinculados de la venta se ven por separado y en lectura («COBRO YA VINCULADO · asignado 100»)",
  formConPrevio.includes("COBRO YA VINCULADO · asignado 100") &&
  formConPrevio.includes("300 USDC"));
assert("names de campos que leen 4.2/4.3 intactos (cantidad/nota) y los retirados ausentes",
  form.includes('name="cantidad"') && form.includes('name="nota"') &&
  !form.includes('name="estado"') && !form.includes('name="importe"'));
assert("precarga 4.8: solo cantidad (disponible) y nota",
  precarga.cantidadAsignada === 300 && precarga.nota === "" &&
  Object.keys(precarga).length === 2, precarga);
const formPrevio = ccHtmlFormEstructura(SALIDA, COBRO, precarga, [],
  "Esta salida ya tiene el vínculo pd_x con 1 asignación(es)…", "titulo x");
assert("nota previa (D4) y título personalizados siguen funcionando",
  formPrevio.includes("Esta salida ya tiene el vínculo pd_x") && formPrevio.includes("titulo x"));

// =========================================================================
console.log("== 4. T3/4.8 · buscador: rango de importe, sin casilla, botón «Vincular pago…» ==");
// =========================================================================
const dlg = ccHtmlDialogoEstructura(SALIDA);
const dlgVinc = ccHtmlDialogoEstructura(SALIDA, { ventaIds: ["pd_20260927_001"] });
assert("campos «Importe desde» / «Importe hasta» (importeMin/importeMax)",
  dlg.includes('name="importeMin"') && dlg.includes('name="importeMax"') &&
  dlg.includes("Importe desde") && dlg.includes("Importe hasta"));
assert("el importe único ± tolerancia DESAPARECE del diálogo",
  !dlg.includes('name="importe"') && !dlg.includes('name="tolerancia"') &&
  !dlg.includes("Tolerancia"));
assert("4.8: sin casilla «ver todos» en el diálogo (escape contextual en el vacío)",
  !dlg.includes('name="verTodos"') && !dlg.includes("ver todos los entrantes de stablecoin"));
assert("4.8/T17: botón primario «🔗 Vincular cobro…» (abre directo el formulario)",
  dlg.includes("🔗 Vincular cobro…") && !dlg.includes("Proponer emparejamiento"));
// Sin el aviso de «otro cobro»: repetiría el título.
assert("4.8/T11: desde salida vinculada el título es «➕ Añadir otro cobro», sin el aviso D4",
  dlgVinc.includes("➕ Añadir otro cobro") &&
  !dlgVinc.includes("Se añadirá como otro cobro"));
assert("rango inclusivo a 6 decimales: min=max=300 -> c1",
  ccCobrosCoincidentes(REGS, ctx, { importeMin: 300, importeMax: 300 }).map(r => r.clave).join(",") === "c1");
assert("rango 100-450 por defecto -> c1 (c3/c4 fuera por acotado)",
  ccCobrosCoincidentes(REGS, ctx, { importeMin: 100, importeMax: 450 }).map(r => r.clave).join(",") === "c1");
assert("mismo rango con verTodos -> c3 (400) y c1 (300), ordenados por fecha",
  ccCobrosCoincidentes(REGS, ctx, { importeMin: 100, importeMax: 450, verTodos: true })
    .map(r => r.clave).join(",") === "c3,c1");
assert("extremos vacíos/no numéricos = sin límite; min>max = ninguno (honesto)",
  ccCobrosCoincidentes(REGS, ctx, { importeMin: "abc" }).map(r => r.clave).join(",") === "c1" &&
  ccCobrosCoincidentes(REGS, ctx, { importeMin: 500, importeMax: 100 }).length === 0);

// =========================================================================
console.log("== 5. Flujos 4.2/4.3 INTACTOS con la semántica nueva ==");
// =========================================================================
const refS = ccReferenciaDeRegistro(SALIDA, CACHE);
const refC = ccReferenciaDeRegistro(COBRO, CACHE);
const firma = regs => JSON.stringify(regs.map(r =>
  [r.clave, r.categoria, r.subcategoria, r.importe_usdt, r.revisar, r.nota, r.pago_diferido || null]));
const base = REGS.map(r => Object.assign({}, r));
const firmaBase = firma(base);
const borrador = ccBorradorVenta({
  salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC,
  cantidadAsignada: ccDisponibleCobro(COBRO, [], CACHE),
  estadoLiquidacion: "COMPLETA", importeEsperado: null, monedaEsperada: "USD", nota: "cierre",
});
const resBloque = ccAplicarBorradorABloque([], { borrador, refSalida: refS, refCobro: refC });
assert("4.2: el bloque nuevo tiene 1 venta CONFIRMADA con ids pd_*/as_*",
  resBloque.ventas.length === 1 && /^pd_\d{8}_\d{3}$/.test(resBloque.ventas[0].id) &&
  resBloque.ventas[0].asignaciones[0].id === "as_001" && resBloque.ventas[0].estado === "CONFIRMADO");
assert("4.8: la venta guardada lleva liquidación COMPLETA e importe esperado null",
  resBloque.ventas[0].estado_liquidacion === "COMPLETA" &&
  resBloque.ventas[0].importe_esperado_usd === null);
const simConf = ccSimularBloque(base, CACHE, resBloque.ventas);
const dSalida = simConf.diff.find(d => d.clave === "s1");
const campo = (d, c) => (d.cambios.find(x => x.campo === c) || {});
assert("4.2: la simulación aplica VENTA/GPP_INMUEBLE con importe 300 y marcador",
  simConf.info.aplicados.length === 1 && dSalida &&
  campo(dSalida, "categoria").despues === "VENTA" &&
  campo(dSalida, "subcategoria").despues === "GPP_INMUEBLE" &&
  campo(dSalida, "importe_usdt").despues === 300 &&
  campo(dSalida, "pago_diferido").despues.rol === "salida");
const ventasAnul = ccAnularVenta(resBloque.ventas, resBloque.ventaId);
const regsAnul = base.map(r => Object.assign({}, r));
get("aplicarPagosDiferidos")(regsAnul, { pagos_diferidos: { version: 1, ventas: ventasAnul }, ajustes_usuario: {} });
assert("4.3: anular (D6) -> los registros vuelven EXACTOS a la clasificación original",
  firma(regsAnul) === firmaBase);
const ventasRest = ccRestaurarVenta(ventasAnul, resBloque.ventaId);
const regsRest = base.map(r => Object.assign({}, r));
get("aplicarPagosDiferidos")(regsRest, { pagos_diferidos: { version: 1, ventas: ventasRest }, ajustes_usuario: {} });
const regsConf = base.map(r => Object.assign({}, r));
get("aplicarPagosDiferidos")(regsConf, { pagos_diferidos: { version: 1, ventas: resBloque.ventas }, ajustes_usuario: {} });
assert("4.3: restaurar -> huella idéntica al confirmado (sin duplicar importes)",
  firma(regsRest) === firma(regsConf) &&
  regsRest.find(r => r.clave === "s1").importe_usdt === 300);
const ventasEdit = ccEditarVenta(resBloque.ventas, {
  ventaId: resBloque.ventaId, asignacionId: "as_001", cantidadAsignada: 100,
  importeEsperado: null, monedaEsperada: "USD", estadoLiquidacion: "COMPLETA", nota: "cierre",
});
const regsEdit = base.map(r => Object.assign({}, r));
get("aplicarPagosDiferidos")(regsEdit, { pagos_diferidos: { version: 1, ventas: ventasEdit }, ajustes_usuario: {} });
const sEdit = regsEdit.find(r => r.clave === "s1");
assert("4.3: editar a 100 -> importe 100, id de asignación conservado",
  ventasEdit[0].asignaciones[0].cantidad_asignada === 100 &&
  ventasEdit[0].asignaciones[0].id === "as_001" && sEdit.importe_usdt === 100, sEdit);
assert("4.1: la precarga del formulario sigue siendo el disponible del cobro",
  ccPrecargaFormulario(COBRO, resBloque.ventas, CACHE).cantidadAsignada === 0 &&
  ccPrecargaFormulario(COBRO, [], CACHE).cantidadAsignada === 300);

// =========================================================================
console.log("== 6. PUERTA: patrón js/13 y 4.8 sin propuestas ni casilla global ==");
// =========================================================================
/* js/15 escribe ajustes_usuario a propósito, pero solo en
   ccGuardarAjustesDecision (decisiones de la cola, con su guardado): las
   guardas de aquí miran el resto del módulo. */
const fuente = fs.readFileSync(path.join(BASE, "15-correcciones.js"), "utf8")
  .replace(/async function ccGuardarAjustesDecision[\s\S]*?\r?\n}\r?\n/, "");
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
assert("4.8/T17: sin propuestas de emparejamiento en memoria (ccPropuestas/ccAñadirPar fuera del código)",
  !/let ccPropuestas|ccPropuestas\s*=|ccPropuestas\./.test(fuente) &&
  !/function ccAñadirPar|function ccQuitarPar|function ccPodarPropuestas/.test(fuente));
assert("4.8/T18: sin casilla global «ver todos» (ccVerTodosCobros fuera)",
  !/ccVerTodosCobros/.test(fuente) && !/cc-ver-todos/.test(fuente));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
