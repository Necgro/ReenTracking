/* Test unitario de la gestión de vínculos — lista, editar, anular,
 * restaurar, reclasificando tras cada cambio; «reprocesar no duplica
 * importes ni lotes».
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - ccAnularVenta / ccRestaurarVenta: estado ANULADO + fecha y vuelta a
 *   CONFIRMADO, sin mutar el bloque recibido.
 * - ccEditarVenta: cantidad de UNA asignación (id conservado) + campos
 *   editables de la venta + modificado.
 * - ccResumenVenta: resolución de referencias contra la clasificación
 *   (resolverReferenciaMovimiento de js/14), Σasignado, liquidación y aviso
 *   honesto si algún movimiento no está en la sesión.
 * - ccDisponibleCobroExcluyendo: cupo del cobro sin contar la propia
 *   asignación (edición).
 * - Con el motor espejo: anular -> los registros vuelven a su
 *   clasificación ORIGINAL; restaurar -> reaplica SIN duplicar
 *   (idempotencia); editar -> efectos coherentes con la nueva cantidad.
 * - PUERTA: persistencia solo vía patrón js/13.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_43.js
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
const { ccReferenciaDeRegistro, ccAnularVenta, ccRestaurarVenta, ccEditarVenta,
        ccResumenVenta, ccDisponibleCobroExcluyendo, aplicarPagosDiferidos } = sandbox;
const USDC = get("USDC");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "11".repeat(20);
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
const SALIDA = reg(H(1), P1, W, T, 250, "REVISAR", { simbolo: "RALC1", revisar: true, inmueble: "Prueba Alcazaba 1", nota: "envio de tokens de un inmueble sin contraprestacion en el hash", clave: "s1" });
const COBRO = reg(H(2), USDC, T, W, 300, "DEPOSITO", { simbolo: "USDC", fecha: "2026-05-20 18:00:00", nota: "verificar origen (venta P2P, bridge o exchange)", clave: "c1" });
const REGS = [SALIDA, COBRO];
const refS = ccReferenciaDeRegistro(SALIDA, CACHE);
const refC = ccReferenciaDeRegistro(COBRO, CACHE);

const VENTA = {
  id: "pd_20260926_001", salida: refS, cantidad_tokens: 250,
  propiedad: "Prueba Alcazaba 1", importe_esperado_usd: null,
  moneda_esperada: "USD", estado_liquidacion: "COMPLETA", estado: "CONFIRMADO",
  nota: "cierre documentado", creado: "2026-09-26T10:00:00", modificado: null, anulado: null,
  asignaciones: [{ id: "as_001", pago: refC, activo: "USDC", cantidad_asignada: 300,
                   nota: "", creado: "2026-09-26T10:00:00", modificado: null }],
};
const aplicar = (regs, ventas) => {
  const copia = regs.map(r => Object.assign({}, r));
  aplicarPagosDiferidos(copia, { pagos_diferidos: { version: 1, ventas }, ajustes_usuario: {} });
  return copia;
};
const firma = regs => JSON.stringify(regs.map(r =>
  [r.clave, r.categoria, r.subcategoria, r.importe_usdt, r.revisar, r.nota, r.pago_diferido || null]));

console.log("== 1. Anular (D6) y restaurar ==");
const bloque0 = [VENTA];
const anuladas = ccAnularVenta(bloque0, VENTA.id);
assert("anular: estado ANULADO + fecha de anulación + modificado",
  anuladas[0].estado === "ANULADO" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(anuladas[0].anulado) &&
  anuladas[0].modificado === anuladas[0].anulado, anuladas[0]);
assert("anular: PUREZA (el bloque original intacto) y resto de campos conservados",
  bloque0[0].estado === "CONFIRMADO" && bloque0[0].anulado === null &&
  anuladas[0].asignaciones[0].cantidad_asignada === 300 && anuladas[0].nota === "cierre documentado");
assert("anular id inexistente -> sin cambios", JSON.stringify(ccAnularVenta(bloque0, "pd_x")) === JSON.stringify(bloque0));
assert("anular una ya ANULADA -> sin cambios", JSON.stringify(ccAnularVenta(anuladas, VENTA.id)) === JSON.stringify(anuladas));
const restauradas = ccRestaurarVenta(anuladas, VENTA.id);
assert("restaurar: CONFIRMADO, anulado null, modificado relleno",
  restauradas[0].estado === "CONFIRMADO" && restauradas[0].anulado === null &&
  /^\d{4}-\d{2}-\d{2}T/.test(restauradas[0].modificado), restauradas[0]);
assert("restaurar una CONFIRMADA -> sin cambios", JSON.stringify(ccRestaurarVenta(bloque0, VENTA.id)) === JSON.stringify(bloque0));

console.log("== 2. Edición de venta/asignación ==");
const editadas = ccEditarVenta(bloque0, {
  ventaId: VENTA.id, asignacionId: "as_001", cantidadAsignada: 100,
  importeEsperado: 1000, monedaEsperada: "USD", estadoLiquidacion: "PARCIAL", nota: "nota nueva",
});
const e0 = editadas[0];
assert("editar: cantidad de ESA asignación (id conservado) y modificado",
  e0.asignaciones[0].id === "as_001" && e0.asignaciones[0].cantidad_asignada === 100 &&
  /^\d{4}-\d{2}-\d{2}T/.test(e0.asignaciones[0].modificado), e0.asignaciones[0]);
assert("editar: campos de la venta actualizados",
  e0.importe_esperado_usd === 1000 && e0.estado_liquidacion === "PARCIAL" && e0.nota === "nota nueva");
assert("editar: PUREZA (bloque original intacto)",
  bloque0[0].asignaciones[0].cantidad_asignada === 300 && bloque0[0].nota === "cierre documentado");
const sinAsig = ccEditarVenta(bloque0, { ventaId: VENTA.id, asignacionId: "as_999",
  cantidadAsignada: 5, importeEsperado: null, monedaEsperada: "USD", estadoLiquidacion: "DESCONOCIDA", nota: "" });
assert("editar asignación inexistente: solo campos de venta",
  sinAsig[0].asignaciones[0].cantidad_asignada === 300 && sinAsig[0].importe_esperado_usd === null);
assert("editar venta inexistente -> sin cambios", JSON.stringify(ccEditarVenta(bloque0, { ventaId: "pd_x" })) === JSON.stringify(bloque0));

console.log("== 3. Resumen de venta y disponible excluyendo ==");
const res1 = ccResumenVenta(VENTA, REGS);
assert("resumen: salida y cobro resueltos, Σ 300, liquidación COMPLETA",
  res1.salida === SALIDA && res1.pagos[0].reg === COBRO && res1.suma === 300 &&
  res1.liquidacion === "COMPLETA" && res1.faltaRegistro === false, res1);
const resVacio = ccResumenVenta(VENTA, []);
assert("resumen sin registros: faltaRegistro honesto (la cache conserva el vínculo)",
  resVacio.salida === null && resVacio.faltaRegistro === true && resVacio.suma === 300);
assert("disponible excluyendo la propia asignación = cantidad íntegra",
  ccDisponibleCobroExcluyendo(COBRO, bloque0, CACHE, { ventaId: VENTA.id, asignacionId: "as_001" }) === 300);
assert("disponible sin excluir = cantidad − asignado (0)",
  ccDisponibleCobroExcluyendo(COBRO, bloque0, CACHE, null) === 0);
const bloqueParcial = [ccEditarVenta(bloque0, { ventaId: VENTA.id, asignacionId: "as_001",
  cantidadAsignada: 100, importeEsperado: null, monedaEsperada: "USD",
  estadoLiquidacion: "PARCIAL", nota: "" })[0]];
assert("disponible con asignación de 100 = 200 (y 300 excluyéndola)",
  ccDisponibleCobroExcluyendo(COBRO, bloqueParcial, CACHE, null) === 200 &&
  ccDisponibleCobroExcluyendo(COBRO, bloqueParcial, CACHE, { ventaId: VENTA.id, asignacionId: "as_001" }) === 300);

console.log("== 4. Comprobación del plan con el motor espejo ==");
const baseFirma = firma(aplicar(REGS, []));
const confFirma = firma(aplicar(REGS, bloque0));
const anulFirma = firma(aplicar(REGS, anuladas));
const restFirma = firma(aplicar(REGS, restauradas));
assert("confirmado: efectos de la sección 4 (distintos de la clasificación original)",
  confFirma !== baseFirma);
assert("ANULAR -> los registros vuelven a su clasificación ORIGINAL", anulFirma === baseFirma);
assert("RESTAURAR -> reaplica idéntico al confirmado (reprocesar no duplica)",
  restFirma === confFirma);
const conf = aplicar(REGS, bloque0)[0];
const rest = aplicar(REGS, restauradas)[0];
assert("sin duplicar importes: importe 300 exacto tras restaurar",
  conf.importe_usdt === 300 && rest.importe_usdt === 300, { conf: conf.importe_usdt, rest: rest.importe_usdt });
const edit = aplicar(REGS, bloqueParcial)[0];
const editCobro = aplicar(REGS, bloqueParcial)[1];
assert("editar a 100 PARCIAL: salida importe 100 y revisar=true (D5)",
  edit.importe_usdt === 100 && edit.revisar === true && edit.categoria === "VENTA", edit);
assert("editar a 100: cobro con resto pendiente sin neutralizar",
  editCobro.revisar === true && editCobro.categoria === "DEPOSITO" &&
  editCobro.nota.includes("el resto (200,00 USDC), verificar origen"), editCobro.nota);

console.log("== 5. PUERTA 4.2/4.3: persistencia solo vía patrón js/13 ==");
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
  [/pagos_diferidos\.ventas\.(push|pop|shift|unshift|splice)\s*\(/, "pagos_diferidos.ventas.push/..."],
];
for (const [re, nombre] of prohibidos) assert("fuente sin " + nombre, !re.test(fuente));
assert("fuente CON marcarCacheDirty( y autoGuardarCache( (patrón js/13)",
  /marcarCacheDirty\s*\(/.test(fuente) && /autoGuardarCache\s*\(/.test(fuente));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
