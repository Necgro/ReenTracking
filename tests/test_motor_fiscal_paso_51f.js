/* Test unitario del motor fiscal de la app (js/21): casos que solo tocan
 * a la app, cada uno con el suyo. Las cifras las comprueba la paridad
 * (tests/paridad_motor_fiscal_paso_51f.js, con las cifras de referencia).
 *
 * - Una fecha 31/12/9999 (escrita en un ajuste) no cuelga la app:
 *   reindexarForwardFill (js/07) acaba.
 * - Un contrato «__proto__» (escrito en un ajuste) no desaparece de la
 *   cartera a 31/12 ni de lo apartado.
 * - La nota «cantidad no valida (…)» escribe la cantidad según su origen:
 *   de la blockchain un decimal («0.0»), de un ajuste un entero («0»).
 * - Como debe llamarse (una copia nueva cada vez): dos pasadas sobre
 *   copias nuevas dan lo mismo y la cache no cambia.
 * - Con la cache que ya movio la app (moverAjustes), el ajuste se lee en
 *   su movimiento; uno sin su movimiento no se lee en el que ocupa su clave.
 * - Una fecha imposible en los tipos del BCE no para el motor de la app.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/test_motor_fiscal_paso_51f.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, log: () => {}, toast: () => {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js",
  "10-csv-descubrimiento.js", "14-clasificador.js", "21-fiscal.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
const WALLET = "0x" + "a".repeat(40), VAULT = "0x" + "b".repeat(40), OTRO = "0x" + "c".repeat(40);
vm.runInContext("state.config = { wallet: '" + WALLET + "', vault: '" + VAULT + "' };", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
function reg(clave, fecha, categoria, subcategoria, contrato, cantidad, campos = {}) {
  return Object.assign({ clave, fecha, hash: "0x" + Buffer.from(clave).toString("hex"), contrato,
    token: null, simbolo: null, cantidad, categoria, subcategoria, inmueble: null,
    periodo_fiscal: null, importe_usdt: null, coste_eur: null, via_compra: null,
    origen: "", destino: "", fuente: "PRUEBA", nota: "", revisar: false }, campos);
}
const cache = (tipos, ajustes = {}) => ({ tipos_bce: tipos, ajustes_usuario: ajustes, contratos_aprendidos: {} });

console.log("== A1. Una fecha 31/12/9999 no cuelga la app ==");
const dias = S.reindexarForwardFill({ "9999-12-28": 1.1 }, "9999-12-28", "9999-12-31");
assert("el relleno acaba en el 31/12/9999", JSON.stringify(Object.keys(dias)) ===
  JSON.stringify(["9999-12-28", "9999-12-29", "9999-12-30", "9999-12-31"]), Object.keys(dias));
const fin = [reg("c", "9999-12-31 10:00:00", "COMPRA", "COSTE_BASE", USDT_(), 10, { importe_usdt: 10 })];
const t0 = Date.now();
S.motorFiscal(fin, cache({ "9999-12-28": 1.1 }), {});
assert("el motor termina con una compra del 31/12/9999", Date.now() - t0 < 2000);
assert("y la valora con el tipo del 28/12", Math.abs(fin[0].importe_eur - 10 / 1.1) < 1e-9, fin[0].importe_eur);
function USDT_() { return vm.runInContext("USDT", S); }
// Con tipos de verdad (2024-2026) el relleno no debe recorrer
// hasta el 9999 (5 s en cada calculo).
const lejos = [reg("d", "9999-12-31 10:00:00", "DEPOSITO", "COSTE_BASE", USDT_(), 10, { importe_usdt: 10 })];
const t1 = Date.now();
S.motorFiscal(lejos, cache({ "2024-01-02": 1.1, "2026-06-01": 1.2 }), {});
assert("con tipos de 2024 a 2026, una fecha del 9999 tarda poco (A19)", Date.now() - t1 < 500, Date.now() - t1);
assert("y queda sin tipo, a revisar", lejos[0].tipo_bce === null && lejos[0].revisar, lejos[0].nota);
const pascua = S.reindexarForwardFill({ "2024-03-28": 1.1 }, "2024-03-28", "2024-04-10");
assert("el hueco de 4 dias sigue igual", JSON.stringify(Object.keys(pascua)) ===
  JSON.stringify(["2024-03-28", "2024-03-29", "2024-03-30", "2024-03-31", "2024-04-01"]), Object.keys(pascua));

console.log("== A7. Un contrato «__proto__» sigue en la cartera ==");
const proto = [reg("p", "2024-03-01 10:00:00", "COMPRA", "COSTE_BASE", "__proto__", 2,
  { via_compra: "BANCARIA", coste_eur: 200 })];
const cierres = {}, cierresUsd = {};
const colas = S.motorFiscal(proto, cache({ "2024-03-01": 1.1 }), {}, { cierres, cierres_usd: cierresUsd });
assert("cartera a 31/12: «__proto__» con 2 tokens y 200 €",
  JSON.stringify(cierres[2024]) === '{"__proto__":[2,200]}', cierres[2024]);
assert("coste en USD abierto: «__proto__» sin USD", Object.keys(cierresUsd[2024]).includes("__proto__"));
assert("posicionAbierta lo cuenta", Object.keys(S.posicionAbierta(colas)).length === 1);
const delegado = [reg("d", "2024-03-01 10:00:00", "MOVIMIENTO", "NEUTRO", "__proto__", 5,
  { origen: WALLET, destino: OTRO })];
const apartado = {};
S.motorFiscal(delegado, cache({ "2024-03-01": 1.1 }), {}, { apartado });
assert("lo mandado a otra cuenta tuya: «__proto__» en lo apartado",
  Object.prototype.hasOwnProperty.call(apartado, "__proto__") && apartado.__proto__.otras_cuentas === 5,
  Object.keys(apartado));

console.log("== Nota «cantidad no valida» ==");
const venta = c => [reg("v", "2024-03-01 10:00:00", "VENTA", "GPP_INMUEBLE", OTRO, c, { importe_usdt: 10 })];
const deBlockchain = venta(0);
S.motorFiscal(deBlockchain, cache({ "2024-03-01": 1.1 }), {});
assert("cantidad de la blockchain: «(0.0)»", deBlockchain[0].nota.includes("cantidad no válida (0.0)"), deBlockchain[0].nota);
const deAjuste = venta(0);
S.motorFiscal(deAjuste, cache({ "2024-03-01": 1.1 }, { v: { cantidad: 0 } }), {});
assert("cantidad de un ajuste: «(0)»", deAjuste[0].nota.includes("cantidad no válida (0)"), deAjuste[0].nota);
const vacia = venta(null);
S.motorFiscal(vacia, cache({ "2024-03-01": 1.1 }), {});
assert("sin cantidad: «(None)»", vacia[0].nota.includes("cantidad no válida (None)"), vacia[0].nota);

console.log("== A3. Con una copia nueva cada vez, dos pasadas dan lo mismo ==");
const clasificados = [
  reg("c", "2024-03-01 10:00:00", "DEPOSITO", "COSTE_BASE", USDT_(), 100, { importe_usdt: 100, origen: OTRO }),
  reg("v", "2024-03-02 10:00:00", "VENTA", "GPP_SWAP", USDT_(), 40, { importe_usdt: 40 }),
];
const cacheA3 = cache({ "2024-03-01": 1.1, "2024-03-02": 1.2 }, { v: { nota: "mia" } });
const cacheA3Antes = JSON.stringify(cacheA3);
const pasada = () => {
  const regs = structuredClone(clasificados);
  S.motorFiscal(regs, cacheA3, {});
  return JSON.stringify(regs);
};
assert("la segunda pasada es igual a la primera", pasada() === pasada());
assert("y los registros clasificados no cambian", clasificados.every(r => r.nota === "" && !("importe_eur" in r)));
assert("ni la cache (auditoria 2, T8)", JSON.stringify(cacheA3) === cacheA3Antes);

console.log("== A16 (auditoria 2). El ajuste se lee en su movimiento, tambien con la cache movida ==");
const RNT = vm.runInContext("RNT", S), H = "0x" + "aa".repeat(32), K = H + "::" + RNT;
const X = "0x" + "c1".repeat(20), Y = "0x" + "c2".repeat(20);
const reward = (clave, cantidad, origen) => reg(clave, "2025-02-10 10:00:00", "REWARD", "RCM_REWARD", RNT,
  cantidad, { hash: H, origen, destino: WALLET });
const cacheRewards = () => ({ tipos_bce: { "2025-02-10": 1.04 }, precios_rnt: { "2025-02-10": 0.1 },
  contratos_aprendidos: {}, ajustes_usuario: { [K]: { subcategoria: "RCM_REWARD", gp_eur: 3 } },
  ajustes_movimiento: { [K]: { origen: Y, destino: WALLET, cantidad: 7 } } });
// Como ejecutarClasificacion: aplica los ajustes, mueve la cache y despues
// el motor sobre una copia nueva.
function clasificarYMotor(registros, cacheR) {
  const movidos = [];
  S.aplicarAjustesUsuario(registros, cacheR, true, movidos);
  const movida = S.moverAjustes(cacheR, movidos);
  const regs = structuredClone(registros);
  S.motorFiscal(regs, cacheR, {});
  return { movida, regs: Object.fromEntries(regs.map(r => [r.clave, r])) };
}
const siguio = clasificarYMotor([reward(K, 5, X), reward(K + "::2", 7, Y)], cacheRewards());
assert("la cache se movio a K::2", siguio.movida);
assert("el reward decidido (7 RNT) es rendimiento de staking", siguio.regs[K + "::2"].codigo_concepto === "RCM_STAKING",
  siguio.regs[K + "::2"].codigo_concepto);
assert("el otro (5 RNT) es un regalo", siguio.regs[K].subcategoria === "GPP_REGALO" &&
  siguio.regs[K].codigo_concepto === "GP_BASE_GRAL", siguio.regs[K].codigo_concepto);
const huerfano = clasificarYMotor([reward(K, 5, X)], cacheRewards());
assert("sin su movimiento, el ajuste no se mueve", !huerfano.movida);
assert("y no se lee en el reward que ocupa su clave", huerfano.regs[K].subcategoria === "GPP_REGALO" &&
  !huerfano.regs[K].nota.includes("gp_eur puesto a mano") && !huerfano.regs[K].revisar, huerfano.regs[K].nota);

console.log("== A22 (auditoria 2). Una fecha imposible en los tipos del BCE no para el motor ==");
for (const mala of ["2025-02-00", "2025-13-01", "2025-02-30"]) {
  const regs = [reg("d", "2025-02-04 10:00:00", "DEPOSITO", "COSTE_BASE", USDT_(), 12, { importe_usdt: 12 })];
  let error = null;
  try { S.motorFiscal(regs, cache({ [mala]: 9.9, "2025-02-03": 1.1, "2025-02-04": 1.2 }), {}); }
  catch (e) { error = e.message; }
  assert(mala + ": valora con el tipo del dia", error === null && Math.abs(regs[0].importe_eur - 10) < 1e-9,
    error || regs[0].importe_eur);
}

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
