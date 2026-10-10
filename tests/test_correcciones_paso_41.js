/* Test unitario del formulario de vínculo precargado con efectos previstos
 * (sin guardar).
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - ccReferenciaDeRegistro: 5-tupla del modelo de pagos_diferidos con
 *   valor_raw EXACTO del transfer de la cache (y fallback reconstruido sin cache).
 * - ccAsignadoACobro / ccDisponibleCobro: Σ confirmada por identidad y
 *   disponible = cantidad − Σ (ANULADO ignorado).
 * - ccBorradorVenta: borrador del modelo (importe esperado solo si > 0).
 * - ccSimularVinculo: efectos previstos con el PROPIO motor espejo de js/14
 *   sobre COPIAS (los originales no se tocan): salida → VENTA/GPP_INMUEBLE
 *   con importe y marcador; cobro total → nota de asignado; parcial →
 *   mantiene categoría con resto pendiente; inválido → sin efectos +
 *   problemas.
 * - ccAvisosBorrador: avisos CORTOS de una línea (cruce de ejercicio, resto
 *   parcial, conflictos); sin liquidación derivada del importe esperado ni
 *   aviso «seguirá en REVISAR» (la liquidación se guarda siempre COMPLETA).
 * - ccPrecargaFormulario: cantidad = disponible y nota vacía (sin
 *   liquidación ni importe pactado en la UI).
 * - PUERTA: persistencia solo vía patrón de js/13 (marcarCacheDirty +
 *   autoGuardarCache); sin localStorage ni descargas directas.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_41.js
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
const { ccReferenciaDeRegistro, ccAsignadoACobro, ccDisponibleCobro, ccBorradorVenta,
        ccSimularVinculo, ccAvisosBorrador, ccPrecargaFormulario,
        resolverReferenciaMovimiento } = sandbox;
const USDT = get("USDT"), USDC = get("USDC");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "11".repeat(20);
const V = "0x" + "22".repeat(20);
const T = "0x" + "77".repeat(20);
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

/* Cache sintética con el transfer original (valor_raw exacto) */
const CACHE = {
  catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1" } },
  contratos_aprendidos: {},
  transacciones: {
    wallet_tokens: [
      { hash: H(1), contractAddress: P1, from: W, to: T, value: "250000000000000000000", tokenDecimal: "18", timeStamp: "1778556800" },
      { hash: H(2), contractAddress: USDC, from: T, to: W, value: "300000000", tokenDecimal: "6", timeStamp: "1778656800" },
    ],
    vault_tokens: [], wallet_normales: [], wallet_internas: [], vault_normales: [],
  },
  pagos_diferidos: { version: 1, ventas: [] },
  ajustes_usuario: {},
};

const SALIDA = reg(H(1), P1, W, T, 250, "REVISAR", {
  simbolo: "RALC1", revisar: true, inmueble: "Prueba Alcazaba 1",
  nota: "envio de tokens de un inmueble sin contraprestacion en el hash", clave: "s1" });
const COBRO = reg(H(2), USDC, T, W, 300, "DEPOSITO", {
  simbolo: "USDC", fecha: "2026-05-20 18:00:00",
  nota: "verificar origen (venta P2P, bridge o exchange)", clave: "c1" });
const REGS = [SALIDA, COBRO];

console.log("== 1. Referencia de movimiento (5-tupla §3) ==");
const refS = ccReferenciaDeRegistro(SALIDA, CACHE);
const refC = ccReferenciaDeRegistro(COBRO, CACHE);
assert("raw EXACTO del transfer de la cache (18 dec)", refS.valor_raw === "250000000000000000000" && refS.decimales === 18, refS);
assert("raw EXACTO del cobro (6 dec)", refC.valor_raw === "300000000" && refC.decimales === 6, refC);
assert("cadena 137 y direcciones normalizadas", refC.cadena === 137 && refC.origen === T && refC.destino === W);
const refSinCache = ccReferenciaDeRegistro(COBRO, null);
assert("sin cache: raw reconstruido a 6 decimales", refSinCache.valor_raw === "300000000", refSinCache);
assert("round-trip: resolverReferenciaMovimiento devuelve el registro",
  resolverReferenciaMovimiento(refC, REGS) === COBRO && resolverReferenciaMovimiento(refS, REGS) === SALIDA);
assert("sin cantidad o sin hash -> null",
  ccReferenciaDeRegistro(reg(H(3), USDC, T, W, null, "REVISAR"), CACHE) === null &&
  ccReferenciaDeRegistro(reg("", USDC, T, W, 5, "REVISAR"), CACHE) === null);

console.log("== 2. Asignado y disponible ==");
const ventaConf = id => ({
  id, estado: "CONFIRMADO", estado_liquidacion: "DESCONOCIDA",
  salida: refS, cantidad_tokens: 250, propiedad: "Prueba Alcazaba 1",
  importe_esperado_usd: null, moneda_esperada: "USD", nota: "",
  creado: null, modificado: null, anulado: null,
  asignaciones: [{ id: "as1", pago: refC, activo: "USDC", cantidad_asignada: 100, nota: "", creado: null, modificado: null }],
});
assert("sin vínculos: asignado 0 y disponible = cantidad",
  ccAsignadoACobro(refC, []) === 0 && ccDisponibleCobro(COBRO, [], CACHE) === 300);
assert("vínculo CONFIRMADO con 100: asignado 100, disponible 200",
  ccAsignadoACobro(refC, [ventaConf("v1")]) === 100 &&
  ccDisponibleCobro(COBRO, [ventaConf("v1")], CACHE) === 200);
const anulada = ventaConf("v2"); anulada.estado = "ANULADO";
assert("ANULADO ignorado (D6)", ccAsignadoACobro(refC, [anulada]) === 0);
assert("otro cobro: asignado 0", ccAsignadoACobro(refS, [ventaConf("v1")]) === 0);
assert("cobro sin cantidad: disponible null (nada inventado)",
  ccDisponibleCobro(reg(H(4), USDC, T, W, null, "REVISAR"), [], CACHE) === null);

console.log("== 3. Borrador del modelo §3 ==");
const b1 = ccBorradorVenta({ salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC,
  cantidadAsignada: 300, estadoLiquidacion: "COMPLETA", importeEsperado: "", monedaEsperada: "USD", nota: "cierre" });
assert("estructura: id provisional, estado CONFIRMADO (simulación), 1 asignación",
  b1.id === "BORRADOR_4_1" && b1.estado === "CONFIRMADO" && b1.asignaciones.length === 1 &&
  b1.asignaciones[0].cantidad_asignada === 300 && b1.asignaciones[0].activo === "USDC");
assert("importe esperado vacío o <= 0 -> null (no se inventa)",
  b1.importe_esperado_usd === null &&
  ccBorradorVenta({ salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC, cantidadAsignada: 1, importeEsperado: "0" }).importe_esperado_usd === null &&
  ccBorradorVenta({ salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC, cantidadAsignada: 1, importeEsperado: "1000" }).importe_esperado_usd === 1000);
assert("referencias y propiedad/cantidad de la salida",
  b1.salida === refS && b1.asignaciones[0].pago === refC &&
  b1.propiedad === "Prueba Alcazaba 1" && b1.cantidad_tokens === 250);

console.log("== 4. ccSimularVinculo: efectos previstos con el motor espejo ==");
const simC = ccSimularVinculo(REGS, CACHE, b1);
const dS = simC.diff.find(d => d.clave === "s1"), dC = simC.diff.find(d => d.clave === "c1");
const campo = (d, c) => (d.changes || d.cambios).find(x => x.campo === c);
assert("salida: REVISAR -> VENTA / GPP_INMUEBLE con importe 300 y marcador",
  campo(dS, "categoria").despues === "VENTA" && campo(dS, "subcategoria").despues === "GPP_INMUEBLE" &&
  campo(dS, "importe_usdt").despues === 300 && campo(dS, "pago_diferido").despues.rol === "salida", dS);
assert("salida COMPLETA sin otros motivos: revisar true -> false (D5)",
  campo(dS, "revisar").antes === true && campo(dS, "revisar").despues === false);
assert("cobro total: nota de asignado y marcador rol pago (categoría intacta)",
  campo(dC, "nota").despues === "Pago de la venta de Prueba Alcazaba 1 del 12/05/2026: 300,00 USDC" &&
  campo(dC, "pago_diferido").despues.rol === "pago" && !campo(dC, "categoria"), dC);
assert("informe del motor: 1 aplicado, liquidación COMPLETA",
  simC.info.aplicados.length === 1 && simC.info.aplicados[0].liquidacion === "COMPLETA" &&
  simC.info.aplicados[0].importe_usd === 300);
assert("PUREZA: los registros originales no se tocan",
  SALIDA.categoria === "REVISAR" && SALIDA.importe_usdt === null && COBRO.revisar === false &&
  !SALIDA.pago_diferido && !COBRO.pago_diferido);

const bParcial = ccBorradorVenta({ salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC,
  cantidadAsignada: 100, estadoLiquidacion: "PARCIAL", importeEsperado: null, nota: "" });
const simP = ccSimularVinculo(REGS, CACHE, bParcial);
const pS = simP.diff.find(d => d.clave === "s1"), pC = simP.diff.find(d => d.clave === "c1");
assert("parcial: salida importe 100, revisar sin cambio (ya true, D5) y nota con liquidación PARCIAL",
  campo(pS, "importe_usdt").despues === 100 && !campo(pS, "revisar") &&
  campo(pS, "nota").despues.includes("aún sin cobrar entera"), pS);
assert("parcial: cobro mantiene categoría y pasa a revisar con resto pendiente",
  !campo(pC, "categoria") && campo(pC, "revisar").despues === true &&
  campo(pC, "nota").despues.includes("el resto (200,00 USDC), verificar origen"), pC);

const bExceso = ccBorradorVenta({ salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC,
  cantidadAsignada: 99999, estadoLiquidacion: "COMPLETA", importeEsperado: null, nota: "" });
const simE = ccSimularVinculo(REGS, CACHE, bExceso);
assert("sobreasignación: problemas de validación y NINGÚN efecto aplicado",
  simE.info.problemas.length > 0 && simE.diff.length === 0 && simE.info.aplicados.length === 0,
  simE.info.problemas);

console.log("== 5. Avisos y advertencias honestas ==");
const avC = ccAvisosBorrador(SALIDA, COBRO, b1, 300, simC);
assert("sin cruce de ejercicio el mismo año: no avisa",
  !avC.avisos.some(a => a.includes("Cruce de ejercicio")), avC.avisos);
assert("COMPLETA sin importe esperado: sin aviso de REVISAR pendiente",
  !avC.avisos.some(a => a.includes("seguirá en REVISAR")), avC.avisos);
const avP = ccAvisosBorrador(SALIDA, COBRO, bParcial, 300, simP);
// «Quedan … sin asignar.»
assert("parcial (4.8): aviso CORTO de resto no asignado (200 USDC)",
  avP.avisos.length === 1 && avP.avisos[0] === "Quedan 200 USDC de este cobro sin asignar.", avP.avisos);
const SALIDA_X = Object.assign({}, SALIDA, { fecha: "2025-12-15 10:00:00" });
const COBRO_X = Object.assign({}, COBRO, { fecha: "2026-01-10 10:00:00" });
const avX = ccAvisosBorrador(SALIDA_X, COBRO_X, b1, 300, simC);
assert("cruce de ejercicio (D1): aviso con ambos años",
  avX.avisos.some(a => a === "Venta de 2025 y cobro de 2026."), avX.avisos);
const bDeriv = ccBorradorVenta({ salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: refC,
  cantidadAsignada: 300, estadoLiquidacion: "DESCONOCIDA", importeEsperado: "1000", nota: "" });
const avD = ccAvisosBorrador(SALIDA, COBRO, bDeriv, 300, ccSimularVinculo(REGS, CACHE, bDeriv));
assert("4.8: la liquidación derivada del importe esperado desaparece de los avisos (la UI ya no la usa)",
  !avD.avisos.some(a => a.includes("DERIVADA")) && avD.errores.length === 0, avD.avisos);
assert("errores = problemas de validación del motor",
  ccAvisosBorrador(SALIDA, COBRO, bExceso, 300, simE).errores.length === simE.info.problemas.length);

console.log("== 6. Precarga del formulario ==");
const pre = ccPrecargaFormulario(COBRO, [ventaConf("v1")], CACHE);
assert("cantidad precargada = disponible (200 con 100 confirmado)", pre.cantidadAsignada === 200, pre);
assert("4.8: precarga mínima = cantidad (disponible) y nota vacía (sin liquidación ni importe)",
  pre.nota === "" && !("estadoLiquidacion" in pre) && !("importeEsperado" in pre), pre);
assert("precarga sin vínculos = cantidad íntegra",
  ccPrecargaFormulario(COBRO, [], CACHE).cantidadAsignada === 300);

console.log("== 7. PUERTA: persistencia solo vía patrón de js/13 (4.2) ==");
/* js/15 escribe ajustes_usuario a propósito, pero solo en
   ccGuardarAjustesDecision (decisiones de la cola, con su guardado): las
   guardas de aquí miran el resto del módulo. */
const fuente = fs.readFileSync(path.join(BASE, "15-correcciones.js"), "utf8")
  .replace(/async function ccGuardarAjustesDecision[\s\S]*?\r?\n}\r?\n/, "");
/* Contrato estático: escribir en cache.pagos_diferidos y usar
   marcarCacheDirty/autoGuardarCache ES legítimo (es el guardado, con el
   patrón de los ajustes de js/13); que el formulario por sí solo no guarde
   se verifica en RUNTIME en el arnés. Está prohibida toda
   persistencia al margen de ese patrón y cualquier escritura en ajustes_usuario
   o en el state global. */
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

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
