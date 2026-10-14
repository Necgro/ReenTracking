/* Test unitario de 📒 Transacciones: nombres, spam, vínculos y hashes.
 *
 * Funciones bajo prueba (Reental-SPA/js/18-transacciones.js):
 * - txOperacion / txAyudaOperacion: los nombres de las operaciones, por
 *   categoría y subcategoría; el pago de una venta vinculada,
 *   «Cobro de una venta»; «tiene ganancia o pérdida patrimonial» y el código
 *   técnico, en la ayuda.
 * - txPasaFiltros con ocultarSpam: el spam fuera salvo que se pida
 *   (chip o grupo de spam, o una búsqueda); su chip sigue contando.
 * - txRelacionesVinculos + búsqueda: buscar el inmueble (o el id del
 *   vínculo) encuentra también los pagos de sus ventas.
 * - txHtmlFila: debajo del hash, «↳ 0x… ↗» con el de la otra
 *   transacción (la ayuda dice si es el cobro o la venta).
 * - El distintivo de la tabla explica la venta sin el id pd_….
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_tx1c.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js", "21-fiscal.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
const USDC = vm.runInContext("USDC", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "11".repeat(20), T = "0x" + "77".repeat(20), P1 = "0x" + "a1".repeat(20);
const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
function reg(clave, categoria, subcategoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-05-12 09:45:46", hash: H(clave.length), contrato: P1, token: null, simbolo: null,
    cantidad: 1, categoria, subcategoria, inmueble: null, importe_usdt: null, coste_eur: null,
    origen: W, destino: T, fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}

// =========================================================================
console.log("== 1. T72/T76 · nombres de la operación ==");
// =========================================================================
const casos = [
  [reg("a", "COMPRA", "COSTE_BASE"), "Compra de tokens"],
  [reg("b", "DEPOSITO", "COSTE_BASE"), "Ingreso de dinero"],
  [reg("c", "COMISION", "NEUTRO"), "Comisión de red (gas)"],
  [reg("d", "MOVIMIENTO", "NEUTRO"), "Movimiento neutro"],
  [reg("e", "SPAM", "NEUTRO"), "Spam (no cuenta)"],
  [reg("f", "VENTA", "GPP_INMUEBLE"), "Venta de tokens"],
  [reg("g", "VENTA", "GPP_SWAP"), "Permuta (cambio por otro token)"],
  [reg("h", "RETIRADA", "GPP_RETIRADA"), "Salida de dinero"],
  [reg("i", "REWARD", "GPP_REGALO"), "Regalo recibido"],
  [reg("j", "REWARD", "RCM_REWARD"), "Recompensa DeFi"],
  [reg("k", "RENDIMIENTO", "RCM_REINVERTIDO"), "Rendimiento reinvertido"],
];
for (const [r, esperado] of casos) {
  assert(r.categoria + "/" + r.subcategoria + " -> «" + esperado + "»", S.txOperacion(r) === esperado, S.txOperacion(r));
}
const pagoV = reg("pv", "DEPOSITO", "COSTE_BASE", { pago_diferido: { rol: "pago", venta_id: "pd_1" } });
assert("el pago de una venta vinculada: «Cobro de una venta» (y sigue siendo Depósito)",
  S.txOperacion(pagoV) === "Cobro de una venta" && pagoV.categoria === "DEPOSITO");
/* La ayuda solo dice lo que no se ve en la celda: ni el código ni la parte fiscal. */
assert("ayuda: sin código técnico ni «ganancia o pérdida»; solo la nota del motor o el motivo del spam",
  S.txAyudaOperacion(casos[5][0]) === "" && S.txAyudaOperacion(reg("n", "VENTA", "GPP_INMUEBLE", { nota: "x" })) === "Nota del motor: x" &&
  S.txAyudaOperacion(reg("s", "SPAM", "NEUTRO", { nota: "x" }), "Web en el nombre") === "Web en el nombre");
assert("ya no queda «Alta con coste de compra (abre lote)» ni «(ganancia/pérdida)» en ningún nombre",
  casos.every(([r]) => !/abre lote|ganancia\/pérdida/.test(S.txOperacion(r))));
/* P2: el movimiento neutro dice qué supone al pasar el ratón (el mismo texto que 🔍), con su nota detrás. */
const AY_NEUTRO = vm.runInContext("CC_AYUDA_NEUTRO", S);
assert("neutro: su ayuda es la de 🔍, y la nota del motor va detrás",
  S.txAyudaOperacion(casos[3][0]) === AY_NEUTRO &&
  S.txAyudaOperacion(reg("dn", "MOVIMIENTO", "NEUTRO", { nota: "x" })) === AY_NEUTRO + " Nota del motor: x");
assert("A7: el neutro que te llega, con el texto de 🔍 para lo que llega («Ya era tuyo…»)",
  S.txAyudaOperacion(casos[3][0], null, "entrada") === vm.runInContext("CC_AYUDA_NEUTRO_ENTRADA", S) &&
  S.txAyudaOperacion(casos[3][0], null, "salida") === AY_NEUTRO);
assert("filtro «Neutros»: lo neutro no va a la Renta; del gas no lo dice (cuenta en el coste de su compra o venta)",
  vm.runInContext("TX_GRUPOS", S).find(g => g.id === "neutro").ayuda ===
  "Movimientos neutros (siguen siendo tuyos; no van a la Renta) y comisiones de red (gas).");
assert("subcategoría desconocida: tal cual (no se inventa)", S.txOperacion(reg("z", "X", "OTRA_COSA")) === "OTRA_COSA");

/* P9: las dos filas de un canje de contrato (quema del viejo + llegada del nuevo, mismo hash). */
const BURN = vm.runInContext("BURN", S);
const llegada = reg("cj1", "COMPRA", "COSTE_BASE", { via_compra: "CANJE" });
const quema = reg("cj2", "VENTA", "GPP_INMUEBLE", { destino: BURN, hash: llegada.hash });
const quemaSola = reg("cj3x", "VENTA", "GPP_INMUEBLE", { destino: BURN });
const quemaCobrada = reg("cj4", "VENTA", "GPP_INMUEBLE", { destino: BURN, hash: llegada.hash, importe_usdt: 10 });
vm.runInContext("state.registros = " + JSON.stringify([llegada, quema, quemaSola, quemaCobrada]), S);
assert("canje: la llegada y la quema de su hash dicen «Canje de contrato»",
  S.txOperacion(llegada) === "Canje de contrato" && S.txOperacion(quema) === "Canje de contrato",
  [S.txOperacion(llegada), S.txOperacion(quema)]);
assert("canje: sin llegada en el hash, o con importe, sigue siendo «Venta de tokens»",
  S.txOperacion(quemaSola) === "Venta de tokens" && S.txOperacion(quemaCobrada) === "Venta de tokens");
assert("canje: la categoría no cambia (COMPRA / VENTA)", llegada.categoria === "COMPRA" && quema.categoria === "VENTA");
vm.runInContext("state.registros = " + JSON.stringify([quema]), S);
assert("canje: otra clasificación sin la llegada -> «Venta de tokens»", S.txOperacion(quema) === "Venta de tokens");
/* Auditoría de la tanda P (A2, A3): lo mismo que empareja el motor (emparejarCanjes, js/21). */
const quemaDeMas = reg("cj5", "VENTA", "GPP_INMUEBLE", { destino: BURN, hash: llegada.hash, cantidad: 3 });
const quemaPdVacio = reg("cj6x", "VENTA", "GPP_INMUEBLE", { destino: BURN, pago_diferido: {} });
const llegada2 = reg("cj7xx", "COMPRA", "COSTE_BASE", { via_compra: "CANJE", hash: quemaPdVacio.hash });
const todos = [llegada, quema, quemaDeMas, quemaPdVacio, llegada2];
vm.runInContext("state.registros = " + JSON.stringify(todos), S);
const delMotor = new Set([...S.emparejarCanjes(JSON.parse(JSON.stringify(todos))).values()].map(b => b.clave));
assert("A2: dos quemas y una llegada: solo la que empareja el motor es canje; la otra, «Venta de tokens»",
  S.txOperacion(quema) === "Canje de contrato" && S.txOperacion(quemaDeMas) === "Venta de tokens" &&
  delMotor.has("cj2") && !delMotor.has("cj5"), [S.txOperacion(quema), S.txOperacion(quemaDeMas), [...delMotor]]);
assert("A3: con pago_diferido vacío, como el motor: canje", S.txOperacion(quemaPdVacio) === "Canje de contrato" && delMotor.has("cj6x"));
assert("el motor no marca los registros de la pestaña (empareja copias)",
  vm.runInContext("state.registros.every(r => !r.canje && !r.revisar)", S));
vm.runInContext("state.registros = undefined", S);

// =========================================================================
console.log("== 2. T71 · spam oculto por defecto ==");
// =========================================================================
const R = [reg("s1", "SPAM", "NEUTRO", { simbolo: "BASURA" }), reg("s2", "SPAM", "NEUTRO"), casos[0][0], casos[2][0]];
const claves = l => l.map(r => r.clave).sort().join(",");
assert("sin ocultarSpam (tests y llamadas de antes): todo", S.txFiltrar(R, {}).length === 4);
assert("ocultarSpam: fuera el spam", claves(S.txFiltrar(R, { ocultarSpam: true })) === "a,c");
assert("ocultarSpam + chip SPAM: se ve el spam", claves(S.txFiltrar(R, { ocultarSpam: true, categoria: "SPAM" })) === "s1,s2");
/* El spam solo sale en su modo: ni el grupo ni una búsqueda lo sacan. */
assert("ocultarSpam + grupo spam: no sale (TX-1g)", claves(S.txFiltrar(R, { ocultarSpam: true, grupo: "spam" })) === "");
assert("ocultarSpam + búsqueda: tampoco (TX-1g)", claves(S.txFiltrar(R, { ocultarSpam: true, q: "basura" })) === "");
const conteo = S.txConteoCategorias(R, { ocultarSpam: true });
assert("el recuento del selector sigue contando el spam (para «Ver spam (n)»)",
  conteo.some(c => c.categoria === "SPAM" && c.n === 2), conteo);

// =========================================================================
console.log("== 3. T74 · la búsqueda de un inmueble encuentra los pagos de sus ventas ==");
// =========================================================================
const CACHE = { catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1" } },
  contratos_aprendidos: {}, transacciones: { wallet_tokens: [], vault_tokens: [], wallet_normales: [], vault_normales: [] } };
const SAL = reg("sal", "VENTA", "GPP_INMUEBLE", { inmueble: "Prueba Alcazaba 1", simbolo: "Reental-ALC-1", hash: H(20),
  pago_diferido: { rol: "salida", venta_id: "pd_9" } });
const PAGO = reg("pago", "DEPOSITO", "COSTE_BASE", { contrato: USDC, simbolo: "USDC", origen: T, destino: W, hash: H(21),
  cantidad: 120, pago_diferido: { rol: "pago", venta_id: "pd_9" } });
const OTRO = reg("otro", "DEPOSITO", "COSTE_BASE", { contrato: USDC, simbolo: "USDC", origen: T, destino: W, hash: H(22) });
const REGS = [SAL, PAGO, OTRO];
const VENTAS = [{ id: "pd_9", estado: "CONFIRMADO", salida: S.ccReferenciaDeRegistro(SAL, CACHE),
  asignaciones: [{ id: "as_001", pago: S.ccReferenciaDeRegistro(PAGO, CACHE), cantidad_asignada: 120 }] },
  { id: "pd_8", estado: "ANULADO", salida: S.ccReferenciaDeRegistro(SAL, CACHE),
    asignaciones: [{ id: "as_002", pago: S.ccReferenciaDeRegistro(OTRO, CACHE), cantidad_asignada: 1 }] }];
const rel = S.txRelacionesVinculos(REGS, VENTAS);
assert("relaciones: la venta lleva su cobro y el cobro su venta; los anulados no cuentan",
  rel.get("sal").otros.map(o => o.rol + ":" + o.reg.clave).join() === "cobro:pago" &&
  rel.get("pago").otros.map(o => o.rol + ":" + o.reg.clave).join() === "venta:sal" && !rel.has("otro"));
assert("buscar «Alcazaba» encuentra la venta Y su pago (no el otro depósito)",
  claves(S.txFiltrar(REGS, { q: "alcazaba" }, rel)) === "pago,sal", claves(S.txFiltrar(REGS, { q: "alcazaba" }, rel)));
assert("sin las relaciones, como antes: solo la venta", claves(S.txFiltrar(REGS, { q: "alcazaba" })) === "sal");
assert("buscar el id del vínculo encuentra los dos", claves(S.txFiltrar(REGS, { q: "pd_9" }, rel)) === "pago,sal");
assert("buscar el hash del pago no arrastra la venta (sigue saliendo una fila)",
  claves(S.txFiltrar(REGS, { q: PAGO.hash }, rel)) === "pago");

// =========================================================================
console.log("== 4. T78/T75 · los dos hashes y el distintivo ==");
// =========================================================================
const ctx = S.ccContextoCandidatos(Object.assign({}, CACHE, { pagos_diferidos: { version: 1, ventas: VENTAS } }), { wallet: W }, REGS);
const vSal = S.ccVinculoDeRegistro(SAL, ctx); vSal.detalle = S.ccDetalleVinculo(vSal, VENTAS, REGS);
const vPago = S.ccVinculoDeRegistro(PAGO, ctx); vPago.detalle = S.ccDetalleVinculo(vPago, VENTAS, REGS);
const fSal = S.txHtmlFila(SAL, { estadoRevisar: "libre", vinculo: vSal, relacionados: rel.get("sal").otros });
const fPago = S.txHtmlFila(PAGO, { estadoRevisar: "libre", vinculo: vPago, relacionados: rel.get("pago").otros });
const corto = h => h.slice(0, 6) + "…" + h.slice(-4);
assert("fila de la venta: su hash y, debajo, «↳ 0x… ↗» enlazado al pago (la ayuda dice que es el cobro)",
  fSal.includes(">" + corto(SAL.hash) + " ↗</a>") &&
  fSal.includes('class="mono tx-hash-rel" href="https://polygonscan.com/tx/' + PAGO.hash + '"') &&
  fSal.includes(">↳ " + corto(PAGO.hash) + " ↗</a>") && fSal.includes("Transacción del cobro de esta venta"));
assert("fila del pago: su hash y, debajo, «↳ 0x… ↗» enlazado a la venta",
  fPago.includes(">↳ " + corto(SAL.hash) + " ↗</a>") && fPago.includes("Transacción de la venta que cobra este pago") && fPago.includes("Cobro de una venta"));
assert("fila sin vínculo: un solo hash", (S.txHtmlFila(OTRO, { estadoRevisar: "libre" }).match(/<a class="mono/g) || []).length === 1);
assert("distintivo de la tabla: dice la venta (inmueble y fecha) y no el id",
  fPago.includes("<b>Cobro de una venta</b> Prueba Alcazaba 1, 12/05/2026") &&
  fSal.includes("cobrada el 12/05/2026") && !/title="[^"]*pd_9/.test(fPago));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
