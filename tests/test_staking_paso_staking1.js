/* Staking: se avisa, no se declara. Si de un staking o un
 * farming ha vuelto en total más de lo que se mandó en total (das 100 RNT,
 * vuelven 106), el movimiento con el que se pasa sale a revisar con una
 * nota; no se declara nada solo. Cada sobrante se avisa una vez, y no si el
 * usuario ya lo decidió en 🔍 Revisión. Lo que vuelve igual o menos, lo que
 * vuelve sin haber mandado nada y lo de un pool (su resultado se calcula al
 * retirar) no avisan.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_staking_paso_staking1.js
 */
"use strict";
const vm = require("vm");
const { sandbox, HORA_APP, MODULOS_MOTOR } = require("./paridad_motor_fiscal_paso_51f.js");

let fallos = 0, oks = 0;
function assert(nombre, cond, extra) {
  if (cond) { oks++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const WALLET = "0x" + "1".repeat(40), STAKING = "0x" + "5".repeat(40), FARMING = "0x" + "6".repeat(40), POOL = "0x" + "7".repeat(40);
const RNT = "0x" + "a".repeat(40);
const AVISO = /que pueden ser el premio; la app no lo declara/;

/* Los registros del motor tras los movimientos `movs`: [+n] manda n al
   programa, [-n] vuelven n; `hash` agrupa varios en la misma transacción;
   `ajustes`, los de cache.ajustes_usuario. */
function correr(programa, movs, ajustes = {}) {
  const sb = sandbox(MODULOS_MOTOR, HORA_APP);
  sb.__regs = movs.map((m, i) => {
    const [n, hash] = Array.isArray(m) ? m : [m, "0xh" + i];
    const fecha = "2025-03-" + String(10 + i).padStart(2, "0") + " 10:00:00";
    return { clave: hash + "::" + i, hash, fecha, categoria: "MOVIMIENTO", subcategoria: "NEUTRO", contrato: RNT,
      cantidad: Math.abs(n), origen: n > 0 ? WALLET : programa, destino: n > 0 ? programa : WALLET };
  });
  sb.__cache = { tipos_bce: {}, precios_rnt: {}, ajustes_usuario: ajustes,
    contratos_aprendidos: { DEFI_STAKING: { [STAKING]: "Staking" }, DEFI_FARMING: { [FARMING]: "Farming" }, DEFI_POOL: { [POOL]: "Pool" } } };
  vm.runInContext(`state.config = { wallet: "${WALLET}", vault: "" };
    motorFiscal(__regs, __cache, state.config, { cierres: {}, cierres_usd: {}, cierres_pools: {}, apartado: {}, cierres_otras: {} });`, sb);
  return sb.__regs;
}
const avisados = regs => regs.map((r, i) => (r.revisar && AVISO.test(r.nota || "") ? i : null)).filter(i => i !== null);

console.log("== Vuelve más de lo que se mandó: a revisar, con su nota ==");
{
  const r = correr(STAKING, [100, -106])[1];
  assert("staking: 100 y vuelven 106 -> a revisar", r.revisar === true, r);
  assert("con la nota de lo que sobra", /^han vuelto 106 y se mandaron 100: 6 de más, que pueden ser el premio; la app no lo declara$/.test(r.nota || ""), r.nota);
  assert("sin declarar nada", r.categoria === "MOVIMIENTO" && r.codigo_concepto == null && r.base_imponible_eur == null, r);
  const f = correr(FARMING, [0.5, -0.500002])[1];
  assert("farming, 0,000002 de más: avisa, con sus decimales", f.revisar === true && /han vuelto 0,500002 y se mandaron 0,5: 0,000002 de más/.test(f.nota || ""), f.nota);
}
console.log("== Se cuenta todo lo mandado y todo lo vuelto (auditoría A2-A4) ==");
{
  const regs = correr(STAKING, [100, -60, -50]);
  assert("vuelven 60 y luego 50: avisa la segunda, con lo mandado de verdad",
    JSON.stringify(avisados(regs)) === "[2]" && /han vuelto 110 y se mandaron 100: 10 de más/.test(regs[2].nota), regs.map(r => r.nota));
  const premios = correr(STAKING, [100, -20, -20, -20, -20, -20, -20, -100]);
  assert("premios del propio staking y luego lo tuyo: avisa al pasarse y otra vez con la vuelta",
    JSON.stringify(avisados(premios)) === "[6,7]" && /han vuelto 220 y se mandaron 100: 120 de más/.test(premios[7].nota), premios.map(r => r.nota));
  const a = correr(STAKING, [100, [-100, "0xmismo"], [-6, "0xmismo"]]);
  const b = correr(STAKING, [100, [-6, "0xmismo"], [-100, "0xmismo"]]);
  assert("100 y 6 en la misma transacción, en los dos órdenes: avisa igual",
    avisados(a).length === 1 && avisados(b).length === 1 &&
    /han vuelto 106 y se mandaron 100: 6 de más/.test(a[avisados(a)[0]].nota) && a[avisados(a)[0]].nota === b[avisados(b)[0]].nota,
    [a.map(r => r.nota), b.map(r => r.nota)]);
  const otraVez = correr(STAKING, [100, -106, 50, -50]);
  assert("un sobrante se avisa una vez: delegar 50 más y recuperarlos no avisa", JSON.stringify(avisados(otraVez)) === "[1]", otraVez.map(r => r.nota));
}
console.log("== Decidido en 🔍 Revisión: no vuelve a avisar (auditoría A1) ==");
{
  const ajustes = { "0xh1::1": { revisar: false, nota: "Decidido por ti en Revisión (08/10/2026): se deja como movimiento neutro" } };
  const regs = correr(STAKING, [100, -106], ajustes);
  assert("con «dejar como movimiento» ya no sale a revisar", !regs[1].revisar && !AVISO.test(regs[1].nota || ""), regs[1]);
  const despues = correr(STAKING, [100, -106, -10], ajustes);
  assert("y un sobrante nuevo después sí avisa, solo con lo nuevo",
    JSON.stringify(avisados(despues)) === "[2]" && /han vuelto 116 y se mandaron 100: 16 de más/.test(despues[2].nota), despues.map(r => r.nota));
}
console.log("== El aviso llega al informe del año (y de ahí a 🧾, PDF y Excel) ==");
{
  const { MODULOS_INFORME } = require("./paridad_informe_renta_paso_52f.js");
  const sb = sandbox(MODULOS_INFORME, HORA_APP);
  sb.__regs = correr(STAKING, [100, -106]).map(r => Object.assign({}, r, { revisar: false, nota: "" }));
  sb.__cache = { tipos_bce: {}, precios_rnt: {}, contratos_aprendidos: { DEFI_STAKING: { [STAKING]: "Staking" } } };
  vm.runInContext(`state.config = { wallet: "${WALLET}", vault: "" };
    const op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {} };
    motorFiscal(__regs, __cache, state.config, op);
    __inf = informesRentaAnuales(__regs, resumenFiscalAnual(__regs), state.config,
      Object.assign({}, op, { cache: __cache, hoy: "2025-12-01", descarga_incompleta: false }));`, sb);
  const avisos = (sb.__inf["2025"] || { avisos: [] }).avisos.filter(a => AVISO.test(a.detalle || ""));
  assert("2025: un aviso «a revisar» con su fecha y la nota",
    avisos.length === 1 && avisos[0].tipo === "revisar" && avisos[0].fecha === "2025-03-11", avisos);
}
console.log("== No avisan ==");
for (const [nombre, programa, movs] of [
  ["vuelve lo mismo", STAKING, [100, -100]],
  ["vuelve menos", STAKING, [100, -90]],
  ["un resto de redondeo (menos de 0,000001)", STAKING, [100, -100.0000005]],
  ["vuelve sin haber mandado nada (no se sabe cuánto era)", STAKING, [-106]],
  ["un pool (su resultado va aparte)", POOL, [100, -106]],
]) {
  const regs = correr(programa, movs);
  assert(nombre, avisados(regs).length === 0 && !regs.some(r => AVISO.test(r.nota || "")), regs.map(r => r.nota));
}

console.log("\n" + oks + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
