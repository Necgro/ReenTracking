/* Test unitario de las validaciones del formulario de vínculo, el guardado
 * en cache.pagos_diferidos y la reclasificación.
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - ccGenerarIdVenta / ccGenerarIdAsignacion: ids del modelo sin colisiones.
 * - ccVentaExistenteParaSalida: agrupación por venta (una venta, varios
 *   cobros); ANULADO no cuenta.
 * - ccCobroYaAsignado: duplicado venta+pago.
 * - ccValidacionBorrador: validaciones de UI (par presente, cantidad > 0, sin
 *   duplicado, problemas del motor, y que el motor vaya a aplicar el vínculo).
 * - ccAplicarBorradorABloque: escritura PURA del bloque nuevo (venta nueva o
 *   asignación añadida a la existente con campos editables actualizados);
 *   nunca muta el bloque recibido.
 * - Simulación encadenada: con una venta confirmada en el bloque, el siguiente
 *   borrador sobre la misma salida acumula Σasignado (importe de la venta).
 * - PUERTA: el módulo escribe pagos_diferidos SOLO vía el patrón de js/13
 *   (marcarCacheDirty + autoGuardarCache); sin localStorage/descargas directas
 *   ni escrituras en ajustes_usuario o el state global.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_42.js
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
const { ccReferenciaDeRegistro, ccGenerarIdVenta, ccGenerarIdAsignacion,
        ccVentaExistenteParaSalida, ccCobroYaAsignado, ccValidacionBorrador,
        ccAplicarBorradorABloque, ccBorradorVenta, ccSimularVinculo,
        ccDisponibleCobro } = sandbox;
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
      { hash: H(3), contractAddress: USDC, from: T, to: W, value: "179432100", tokenDecimal: "6", timeStamp: "1778656805" },
    ],
    vault_tokens: [], wallet_normales: [], wallet_internas: [], vault_normales: [],
  },
  pagos_diferidos: { version: 1, ventas: [] },
  ajustes_usuario: {},
};
const SALIDA = reg(H(1), P1, W, T, 250, "REVISAR", { simbolo: "RALC1", revisar: true, inmueble: "Prueba Alcazaba 1", nota: "envio de tokens de un inmueble sin contraprestacion en el hash", clave: "s1" });
const COBRO = reg(H(2), USDC, T, W, 300, "DEPOSITO", { simbolo: "USDC", fecha: "2026-05-20 18:00:00", nota: "verificar origen (venta P2P, bridge o exchange)", clave: "c1" });
const COBRO2 = reg(H(3), USDC, T, W, 179.4321, "DEPOSITO", { simbolo: "USDC", fecha: "2026-05-20 18:00:05", clave: "c2" });
const REGS = [SALIDA, COBRO, COBRO2];
const refS = ccReferenciaDeRegistro(SALIDA, CACHE);
const refC = ccReferenciaDeRegistro(COBRO, CACHE);
const refC2 = ccReferenciaDeRegistro(COBRO2, CACHE);
const borradorDe = (cobroRef, cantidad, extra = {}) => ccBorradorVenta(Object.assign({
  salida: SALIDA, cobro: COBRO, refSalida: refS, refCobro: cobroRef,
  cantidadAsignada: cantidad, estadoLiquidacion: "COMPLETA",
  importeEsperado: null, monedaEsperada: "USD", nota: "cierre documentado",
}, extra));

console.log("== 1. Ids del modelo §3 ==");
const id1 = ccGenerarIdVenta([]);
assert("id de venta pd_AAAAMMDD_001", /^pd_\d{8}_001$/.test(id1), id1);
assert("id sin colisiones con los existentes",
  ccGenerarIdVenta([{ id: id1 }]) !== id1 && /^pd_\d{8}_002$/.test(ccGenerarIdVenta([{ id: id1 }])),
  ccGenerarIdVenta([{ id: id1 }]));
assert("ids de asignación as_NNN sin colisiones",
  /^as_001$/.test(ccGenerarIdAsignacion([])) &&
  ccGenerarIdAsignacion([{ asignaciones: [{ id: "as_001" }] }]) === "as_002");

console.log("== 2. Agrupación por venta (D4) y duplicados ==");
const res1 = ccAplicarBorradorABloque([], { borrador: borradorDe(refC, 300), refSalida: refS, refCobro: refC });
const venta1 = res1.ventas[0];
assert("venta nueva CONFIRMADA con id, creado ISO sin Z y anulado null",
  res1.editada === false && venta1.estado === "CONFIRMADO" && /^pd_\d{8}_001$/.test(venta1.id) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(venta1.creado) && venta1.anulado === null, venta1);
assert("venta con referencia exacta de salida y 1 asignación con raw exacto del cobro",
  venta1.salida.valor_raw === "250000000000000000000" &&
  venta1.asignaciones.length === 1 && venta1.asignaciones[0].pago.valor_raw === "300000000" &&
  venta1.asignaciones[0].activo === "USDC" && venta1.asignaciones[0].cantidad_asignada === 300);
assert("ccVentaExistenteParaSalida la encuentra por identidad",
  ccVentaExistenteParaSalida(res1.ventas, refS) === venta1);
const anulada = Object.assign({}, venta1, { id: "pd_20260101_009", estado: "ANULADO" });
assert("ANULADA no cuenta como existente (D6)", ccVentaExistenteParaSalida([anulada], refS) === null);
assert("otra salida -> null", ccVentaExistenteParaSalida(res1.ventas, refC) === null);
assert("duplicado venta+pago detectado", ccCobroYaAsignado(venta1, refC) === true &&
  ccCobroYaAsignado(venta1, refC2) === false);

console.log("== 3. Segundo cobro a la misma venta (pago fraccionado / N cobros) ==");
const bloqueAntes = JSON.stringify(res1.ventas);
const res2 = ccAplicarBorradorABloque(res1.ventas, { borrador: borradorDe(refC2, 179.4321), refSalida: refS, refCobro: refC2 });
const venta2 = res2.ventas[0];
assert("no crea venta nueva: añade asignación a la existente (D4)",
  res2.editada === true && res2.ventas.length === 1 && venta2.id === venta1.id && venta2.asignaciones.length === 2,
  res2.ventas.length);
assert("campos editables actualizados y modificado relleno",
  venta2.nota === "cierre documentado" && /^\d{4}-\d{2}-\d{2}T/.test(venta2.modificado));
assert("PUREZA: el bloque recibido no se muta", JSON.stringify(res1.ventas) === bloqueAntes &&
  res1.ventas[0].asignaciones.length === 1);
assert("disponible del 2º cobro intacto hasta guardar (0 asignado)",
  ccDisponibleCobro(COBRO2, res1.ventas, CACHE) === 179.4321);

console.log("== 4. Validaciones de UI ==");
const simOk = ccSimularVinculo(REGS, CACHE, borradorDe(refC, 300));
const vOk = ccValidacionBorrador({ regSalida: SALIDA, regCobro: COBRO, cantidadOk: true, dupCobro: false, sim: simOk });
assert("borrador válido -> ok sin motivos", vOk.ok === true && vOk.motivos.length === 0, vOk);
const vCant = ccValidacionBorrador({ regSalida: SALIDA, regCobro: COBRO, cantidadOk: false, dupCobro: false, sim: simOk });
assert("cantidad no válida -> motivo", !vCant.ok && vCant.motivos[0].includes("mayor que 0"), vCant.motivos);
const vDup = ccValidacionBorrador({ regSalida: SALIDA, regCobro: COBRO, cantidadOk: true, dupCobro: true, sim: simOk });
assert("duplicado venta+pago -> motivo", !vDup.ok && vDup.motivos.some(m => m.includes("ya está en esta venta")), vDup.motivos);
const vPar = ccValidacionBorrador({ regSalida: null, regCobro: COBRO, cantidadOk: true, dupCobro: false, sim: simOk });
assert("par fuera de la sesión -> motivo", !vPar.ok && vPar.motivos[0].includes("ya no están"), vPar.motivos);
const simExceso = ccSimularVinculo(REGS, CACHE, borradorDe(refC, 99999));
const vExceso = ccValidacionBorrador({ regSalida: SALIDA, regCobro: COBRO, cantidadOk: true, dupCobro: false, sim: simExceso });
assert("sobreasignación: problemas del motor bloquean", !vExceso.ok && vExceso.motivos.some(m => /más de lo que llegó/.test(m)), vExceso.motivos);
const simVacio = ccSimularVinculo(REGS, CACHE, borradorDe(refC2, 1));
const vSin = ccValidacionBorrador({ regSalida: SALIDA, regCobro: COBRO2, cantidadOk: true, dupCobro: false, sim: { info: { aplicados: [], problemas: [], conflictos: [] }, diff: [] } });
assert("motor no aplicaría -> motivo aunque no haya problemas", !vSin.ok && vSin.motivos.some(m => m.includes("no se puede aplicar")), vSin.motivos);
assert("(sanidad) simulación mínima sí aplicaría", simVacio.info.aplicados.length === 1);

console.log("== 5. Simulación encadenada (Σasignado por venta) ==");
const simBloque = ccSimularVinculo(REGS, CACHE, Object.assign({}, venta2, {}));
assert("con la venta guardada, el motor aplica Σasignado (479,4321) a la salida",
  simBloque.info.aplicados.length === 1 && Math.abs(simBloque.info.aplicados[0].importe_usd - 479.4321) < 1e-9,
  simBloque.info.aplicados);
assert("y los DOS cobros quedan marcados como pago",
  simBloque.diff.filter(d => d.clave === "c1" || d.clave === "c2")
    .every(d => d.cambios.some(c => c.campo === "pago_diferido" && c.despues.rol === "pago")));
const cacheConVenta = Object.assign({}, CACHE, { pagos_diferidos: { version: 1, ventas: res2.ventas } });
const simConBloque = ccSimularVinculo(REGS, cacheConVenta, borradorDe(refC, 0));
assert("con el bloque ya guardado, un borrador inválido sobre la misma salida no impide que la venta confirmada siga aplicando",
  simConBloque.info.aplicados.length === 1 &&
  simConBloque.info.problemas.some(p => p.includes("salida duplicada")) &&
  simConBloque.info.problemas.some(p => p.includes("cantidad_asignada")),
  { aplicados: simConBloque.info.aplicados.length, problemas: simConBloque.info.problemas });

console.log("== 6. PUERTA 4.2: guardado solo vía patrón js/13 ==");
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
];
for (const [re, nombre] of prohibidos) assert("fuente sin " + nombre, !re.test(fuente));
assert("fuente CON marcarCacheDirty( y autoGuardarCache( (patrón js/13)",
  /marcarCacheDirty\s*\(/.test(fuente) && /autoGuardarCache\s*\(/.test(fuente));
assert("fuente escribe pagos_diferidos solo reemplazando el bloque (Object.assign)",
  /state\.cache\.pagos_diferidos\s*=\s*Object\.assign/.test(fuente) &&
  !/pagos_diferidos\.ventas\.push\s*\(/.test(fuente));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
