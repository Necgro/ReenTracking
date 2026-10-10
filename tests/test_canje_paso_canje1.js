/* Canje de contrato: el token recibido hereda el coste de CADA compra
 * de la que viene (FIFO real), no la media de todas. Ejemplo:
 * 3 tokens a 100 € y 2 a 130 €, canjeados; vender 4 cuesta 430 € (con la
 * media serían 448 €). El total de toda la vida no cambia. Con una sola
 * compra, nada cambia.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_canje_paso_canje1.js
 */
"use strict";
const vm = require("vm");
const { sandbox, HORA_APP, MODULOS_MOTOR } = require("./paridad_motor_fiscal_paso_51f.js");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const WALLET = "0x" + "1".repeat(40), VIEJO = "0x" + "a".repeat(40), NUEVO = "0x" + "b".repeat(40), COMPRADOR = "0x" + "c".repeat(40);
const BURN = "0x" + "0".repeat(40);
const cerca = (a, b) => Math.abs(a - b) < 1e-9;

function reg(clave, fecha, categoria, subcategoria, contrato, cantidad, campos = {}) {
  return Object.assign({ clave, fecha, hash: "0x" + clave, contrato, token: null, simbolo: null, cantidad,
    categoria, subcategoria, inmueble: "Casa", periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen: "", destino: WALLET, fuente: "PRUEBA", nota: "", revisar: false }, campos);
}
/* compras: [[cantidad, coste EUR]] por banco, o [[cantidad, null, USD]]
   pagadas en USDT (tipo 1); luego el canje de todo (con 'gas' POL de gas, a
   1 € el POL) y, si se pide, una venta de 'vender' tokens nuevos por
   'precio' USD. */
function correr(compras, vender, precio, { gas = 0 } = {}) {
  const regs = compras.map(([n, eur, usd], i) => reg("c" + i, "2025-01-1" + i + " 10:00:00", "COMPRA", "COSTE_BASE", VIEJO, n,
    usd ? { importe_usdt: usd } : { via_compra: "BANCARIA", coste_eur: eur }));
  const total = compras.reduce((s, [n]) => s + n, 0);
  if (gas) regs.unshift(reg("pol", "2025-01-05 10:00:00", "DEPOSITO", "COSTE_BASE", "pol", 10, { coste_eur: 10 }));
  regs.push(reg("canje", "2025-02-01 10:00:00", "VENTA", "GPP_INMUEBLE", VIEJO, total, { origen: WALLET, destino: BURN }));
  regs.push(Object.assign(reg("canje", "2025-02-01 10:00:00", "COMPRA", "COSTE_BASE", NUEVO, total, { via_compra: "CANJE" }), { clave: "canje::1" }));
  if (gas) regs.push(Object.assign(reg("canje", "2025-02-01 10:00:00", "COMISION", "GAS", "pol", gas, { origen: WALLET, destino: "" }), { clave: "canje::gas" }));
  if (vender) regs.push(reg("v", "2025-03-01 10:00:00", "VENTA", "GPP_INMUEBLE", NUEVO, vender,
    { importe_usdt: precio, origen: WALLET, destino: COMPRADOR }));
  const sb = sandbox(MODULOS_MOTOR, HORA_APP);
  sb.__regs = regs;
  const tipos = {};
  for (const r of regs) tipos[r.fecha.slice(0, 10)] = 1;
  sb.__cache = { tipos_bce: tipos, precios_rnt: {}, ajustes_usuario: {}, contratos_aprendidos: {} };
  const colas = vm.runInContext(`state.config = { wallet: "${WALLET}", vault: "" };
    motorFiscal(__regs, __cache, state.config, { cierres: {}, cierres_usd: {}, cierres_pools: {}, apartado: {}, cierres_otras: {} });`, sb);
  return { regs, lotes: colas.get(NUEVO) || [] };
}

console.log("== Varias compras: cada token hereda el coste de la suya ==");
{
  const { regs, lotes } = correr([[3, 300], [2, 260]], 4, 600);
  const venta = regs[regs.length - 1];
  assert("vender 4 cuesta 430 € (3 × 100 + 1 × 130), no 448", cerca(venta.coste_fifo_eur, 430), venta.coste_fifo_eur);
  assert("y la venta no queda a revisar", !venta.revisar, venta.nota);
  assert("sus trozos dicen de qué compra viene cada uno (10/01 y 11/01)",
    JSON.stringify(venta.lotes_consumidos.map(t => t.procedencia.map(p => p.fecha.slice(0, 10)))) === '[["2025-01-10"],["2025-01-11"]]',
    venta.lotes_consumidos);
  assert("queda 1 token, a 130 €", lotes.length === 1 && cerca(lotes[0].cantidad, 1) && cerca(lotes[0].coste_unitario_eur, 130), lotes);
  const canje = regs.find(r => r.clave === "canje::1");
  assert("el canje sigue costando 560 € en total", cerca(canje.importe_eur, 560) && !canje.revisar, canje);
}
console.log("== Con gas y pagadas en USDT: el gas se reparte por cantidad (auditoría T1) ==");
{
  const { regs, lotes } = correr([[3, null, 300], [2, null, 260]], 4, 600, { gas: 1 });
  const venta = regs[regs.length - 1];
  assert("1 € de gas: 0,60 a la compra de 3 y 0,40 a la de 2; vender 4 cuesta 300,60 + 130,20",
    cerca(venta.coste_fifo_eur, 430.8), venta.coste_fifo_eur);
  assert("queda 1 token a 130,20 €, y en USD a 130,20 (tipo 1)",
    lotes.length === 1 && cerca(lotes[0].coste_unitario_eur, 130.2) && cerca(lotes[0].coste_unitario_usd, 130.2), lotes);
  const trozos = venta.lotes_consumidos;
  assert("cada trozo con su coste en USD (300,60 y 130,20)", trozos.length === 2 &&
    cerca(trozos[0].coste_usd, 300.6) && cerca(trozos[1].coste_usd, 130.2), trozos);
}
console.log("== Una sola compra (como tus datos): como antes, un lote ==");
{
  const { lotes } = correr([[3.5, 350]]);
  assert("un lote de 3,5 a 100 €", lotes.length === 1 && lotes[0].cantidad === 3.5 && cerca(lotes[0].coste_unitario_eur, 100), lotes);
  assert("con su compra de procedencia", lotes[0].procedencia.length === 1 && lotes[0].procedencia[0].fecha.startsWith("2025-01-10"), lotes[0]);
}
console.log("== Venderlo todo: el total no cambia ==");
{
  const { regs, lotes } = correr([[3, 300], [2, 260]], 5, 700);
  assert("vender los 5 cuesta 560 €", cerca(regs[regs.length - 1].coste_fifo_eur, 560), regs[regs.length - 1].coste_fifo_eur);
  assert("y no queda nada", lotes.length === 0, lotes);
}

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
