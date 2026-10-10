/* Test unitario de «➕ Añadir otro cobro» dentro del flujo de vincular (una
 * venta puede cobrarse en varias transferencias).
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - ccHtmlFormEstructura: pie con TRES botones —Cancelar, «➕ Añadir otro
 *   cobro» (guarda y reabre el buscador con la misma salida) y
 *   «✅ Confirmar vínculo»—; el secundario comparte la validación del
 *   primario en runtime (arnés).
 * - ccHtmlDialogoEstructura: cuando la salida ya tiene vínculos CONFIRMADOS,
 *   el título es «➕ Añadir otro cobro», sin aviso que lo repita.
 * - Encadenado a nivel puro: dos borradores sobre la misma salida →
 *   UNA venta con DOS asignaciones (ids as_001/as_002) y Σ de importes.
 * - PUERTA: persistencia solo vía patrón js/13; el encadenado no añade APIs
 *   de guardado nuevas.
 *
 * El comportamiento runtime (reabrir el buscador tras «➕ Añadir otro
 * cobro», toast recordatorio, edición sin encadenar) se comprueba en los
 * arneses headless tests/navegador/verify49*.js.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_49.js
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
const { ccContextoCandidatos, ccHtmlFormEstructura, ccHtmlDialogoEstructura,
        ccPrecargaFormulario, ccReferenciaDeRegistro, ccBorradorVenta,
        ccAplicarBorradorABloque, ccSimularBloque } = sandbox;
const USDC = vm.runInContext("USDC", sandbox);

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
      { hash: H(3), contractAddress: USDC, from: T, to: W, value: "179432100", tokenDecimal: "6", timeStamp: "1778656800" },
    ],
    vault_tokens: [], wallet_normales: [], wallet_internas: [], vault_normales: [],
  },
  pagos_diferidos: { version: 1, ventas: [] },
  ajustes_usuario: {},
};
const SALIDA = reg(H(1), P1, W, T, 250, "REVISAR", { simbolo: "RALC1", revisar: true, inmueble: "Prueba Alcazaba 1", clave: "s1" });
const C1 = reg(H(2), USDC, T, W, 300, "DEPOSITO", { simbolo: "USDC", fecha: "2026-05-20 18:00:00", clave: "c1" });
const C2 = reg(H(3), USDC, T, W, 179.4321, "DEPOSITO", { simbolo: "USDC", fecha: "2026-05-20 18:00:00", clave: "c2" });
const REGS = [SALIDA, C1, C2];
/* js/15 escribe ajustes_usuario a propósito, pero solo en
   ccGuardarAjustesDecision (decisiones de la cola, con su guardado): las
   guardas de aquí miran el resto del módulo. */
const fuente = fs.readFileSync(path.join(BASE, "15-correcciones.js"), "utf8")
  .replace(/async function ccGuardarAjustesDecision[\s\S]*?\r?\n}\r?\n/, "");

// =========================================================================
console.log("== 1. T22 · pie del formulario con el botón de encadenar ==");
// =========================================================================
const form = ccHtmlFormEstructura(SALIDA, C1,
  { [C1.clave]: ccPrecargaFormulario(C1, [], CACHE).cantidadAsignada, nota: "" }, [], null, null);
assert("pie con tres botones: Cancelar, «➕ Añadir otro cobro» (4.10) y «✅ Confirmar vínculo»",
  form.includes('class="cc-dlg-cancelar">Cancelar</button>') &&
  form.includes('class="cc-form-confirmar-otro"') && form.includes("➕ Añadir otro cobro</button>") &&
  form.includes('class="primary cc-form-confirmar">✅ Confirmar vínculo</button>'));
// Varias transferencias por venta, en llano y sin códigos.
// «➕ Añadir otro» sin burbuja.
assert("el botón de encadenar «➕ Añadir otro cobro», sin burbuja",
  /cc-form-confirmar-otro">➕ Añadir otro cobro</.test(form) && !/D4/.test(form));
assert("el orden del pie pone el encadenado junto al primario (flujo de trabajo)",
  form.indexOf("cc-form-confirmar-otro") < form.indexOf("cc-form-confirmar\""));

// =========================================================================
console.log("== 2. T22 · aviso «➕» del buscador cuando la salida ya tiene vínculos ==");
// =========================================================================
const dlgCon = ccHtmlDialogoEstructura(SALIDA, { ventaIds: ["pd_20260927_001"], nAsign: 2 });
const dlgSin = ccHtmlDialogoEstructura(SALIDA, {});
// Sin aviso de «otro cobro»: repetiría el título «➕ Añadir otro cobro».
assert("con vínculos: título «➕ Añadir otro cobro» y sin el aviso D4",
  dlgCon.includes("<h3>➕ Añadir otro cobro</h3>") && !dlgCon.includes("Se añadirá como otro cobro"),
  dlgCon.slice(0, 200));
assert("sin vínculos: sin aviso D4 y título «🔗 Vincular cobro»",
  !dlgSin.includes("Se añadirá como otro cobro") && dlgSin.includes("<h3>🔗 Vincular cobro</h3>"));
assert("sin el código D4 a la vista",
  !dlgCon.includes("D4")); // sin códigos

// =========================================================================
console.log("== 3. Encadenado puro (D4): dos borradores → una venta, dos asignaciones ==");
// =========================================================================
const refS = ccReferenciaDeRegistro(SALIDA, CACHE);
const refC1 = ccReferenciaDeRegistro(C1, CACHE);
const refC2 = ccReferenciaDeRegistro(C2, CACHE);
const b1 = ccBorradorVenta({ salida: SALIDA, cobro: C1, refSalida: refS, refCobro: refC1,
  cantidadAsignada: 300, estadoLiquidacion: "COMPLETA", importeEsperado: null, monedaEsperada: "USD", nota: "pago 1" });
const r1 = ccAplicarBorradorABloque([], { borrador: b1, refSalida: refS, refCobro: refC1 });
const b2 = ccBorradorVenta({ salida: SALIDA, cobro: C2, refSalida: refS, refCobro: refC2,
  cantidadAsignada: 100, estadoLiquidacion: "COMPLETA", importeEsperado: null, monedaEsperada: "USD", nota: "pago 2" });
const r2 = ccAplicarBorradorABloque(r1.ventas, { borrador: b2, refSalida: refS, refCobro: refC2 });
assert("encadenar: UNA venta con DOS asignaciones (as_001 + as_002), editada=true en la segunda",
  r2.ventas.length === 1 && r2.ventas[0].asignaciones.length === 2 &&
  r2.ventas[0].asignaciones.map(a => a.id).join(",") === "as_001,as_002" && r2.editada === true, r2.ventas[0].asignaciones.map(a => a.id));
const sim = ccSimularBloque(REGS, CACHE, r2.ventas);
const dS = sim.diff.find(d => d.clave === "s1");
const campo = (d, c) => (d.cambios.find(x => x.campo === c) || {});
assert("motor: la venta encadenada aplica Σ 400 a la salida (VENTA/GPP_INMUEBLE)",
  sim.info.aplicados.length === 1 && sim.info.aplicados[0].importe_usd === 400 &&
  campo(dS, "importe_usdt").despues === 400 && campo(dS, "categoria").despues === "VENTA",
  sim.info.aplicados);

// =========================================================================
console.log("== 3b. 4.10/T25 · multi-cobro en una pasada (puro) ==");
// =========================================================================
const form2 = ccHtmlFormEstructura(SALIDA, [C1, C2],
  { [C1.clave]: 300, [C2.clave]: 179.4321, nota: "" }, [], null, null);
assert("form multi: dos bloques COBRO, cada uno con su monto, fecha, hash y cantidad editable",
  (form2.match(/cc-par-label">COBRO[ <]/g) || []).length === 2 &&
  form2.includes('data-clave="c1"') && form2.includes('data-clave="c2"') &&
  form2.includes("300 USDC") && form2.includes("179,4321 USDC") &&
  (form2.match(/name="cantidad"/g) || []).length === 2);
const bMulti = ccBorradorVenta({ salida: SALIDA, refSalida: refS,
  cobros: [{ reg: C1, ref: refC1, cantidad: 300 }, { reg: C2, ref: refC2, cantidad: 100 }],
  estadoLiquidacion: "COMPLETA", importeEsperado: null, monedaEsperada: "USD", nota: "dos cobros" });
assert("borrador multi: 2 asignaciones con cantidades propias",
  bMulti.asignaciones.length === 2 && bMulti.asignaciones[0].cantidad_asignada === 300 &&
  bMulti.asignaciones[1].cantidad_asignada === 100 && bMulti.asignaciones[1].activo === "USDC");
const rMulti = ccAplicarBorradorABloque([], { borrador: bMulti, refSalida: refS, refCobro: refC1 });
assert("guardado multi: UNA venta CONFIRMADA con 2 asignaciones (ids as_001/as_002)",
  rMulti.ventas.length === 1 && rMulti.ventas[0].asignaciones.length === 2 &&
  rMulti.ventas[0].asignaciones.map(a => a.id).join(",") === "as_001,as_002");
const regsMulti = REGS.map(r => Object.assign({}, r));
vm.runInContext("aplicarPagosDiferidos", sandbox)(regsMulti, { pagos_diferidos: { version: 1, ventas: rMulti.ventas }, ajustes_usuario: {} });
assert("motor multi: salida VENTA con Σ 400 y ambos cobros marcados rol pago",
  regsMulti.find(r => r.clave === "s1").importe_usdt === 400 &&
  regsMulti.filter(r => r.pago_diferido && r.pago_diferido.rol === "pago").length === 2);

// =========================================================================
console.log("== 4. PUERTA: patrón js/13 y sin APIs nuevas de guardado ==");
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
];
for (const [re, nombre] of prohibidos) assert("fuente sin " + nombre, !re.test(fuente));
assert("el encadenado reutiliza el guardado existente (marcarCacheDirty + autoGuardarCache una sola vez por confirmación)",
  // Con un solo ayudante, ccGuardarYReclasificar.
  (fuente.match(/marcarCacheDirty\(\)/g) || []).length === 1 &&
  (fuente.match(/await autoGuardarCache\(\)/g) || []).length === 1 &&
  (fuente.match(/await ccGuardarYReclasificar\(\)/g) || []).length === 2);
assert("CSS del botón de encadenar solo con tokens (modo oscuro correcto)",
  fuente.split("\n").filter(l => l.includes(".cc-form-confirmar-otro") && l.includes("{"))
    .every(l => !/#[0-9a-fA-F]{3,8}\b/.test(l)));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
