/* Hora española: las fechas de
 * la blockchain y del archivo de Reental (instantes en UTC) van en hora
 * peninsular española. Lo de las 00:00-01:00 del 1 de enero (02:00 en
 * verano) cuenta en el año nuevo. La clave de un reparto sigue en UTC (la
 * llevan tus ajustes). Al pasar el ratón, las dos horas. Con ZONA_FECHAS =
 * "UTC" (las paridades con las cifras de referencia), todo en UTC.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_hora_paso_hora1.js
 */
"use strict";
const vm = require("vm");
const { sandbox, HORA_APP, MODULOS_MOTOR } = require("./paridad_motor_fiscal_paso_51f.js");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const S = sandbox(MODULOS_MOTOR, HORA_APP);
// Las const de la app (fmtFechaHora, hoyEspana) no cuelgan del global: se sacan aquí.
const F = vm.runInContext("({ fmtFechaHora, enHoraEspanola, aUtcNaive, fechaDeTx, hoyEspana, fechaHoraDeTx, " +
  "fechaHoraRegistro, claveRendimientoCsv, fechaDosHoras, motorFiscal, resumenFiscalAnual, anotarInstantes, ordenarPorFecha })", S);
const enEspana = iso => F.fmtFechaHora(F.enHoraEspanola(F.aUtcNaive(iso)));
const ts = iso => String(Date.parse(iso) / 1000);

console.log("== La hora de España, en invierno y en verano ==");
assert("31/12 23:30 UTC = 01/01 00:30", enEspana("2025-12-31T23:30:00Z") === "2026-01-01 00:30:00", enEspana("2025-12-31T23:30:00Z"));
assert("verano: 01/07 22:15:05 UTC = 02/07 00:15:05", enEspana("2025-07-01T22:15:05Z") === "2025-07-02 00:15:05");
assert("cambio de marzo: 30/03 00:59 UTC = 01:59 y 01:00 UTC = 03:00",
  enEspana("2025-03-30T00:59:00Z") === "2025-03-30 01:59:00" && enEspana("2025-03-30T01:00:00Z") === "2025-03-30 03:00:00");
assert("el día de una transacción de la blockchain", F.fechaDeTx({ timeStamp: ts("2025-12-31T23:30:00Z") }) === "2026-01-01");
assert("hoy en España (00:30 del 29/03 en UTC ya es 29/03)", F.hoyEspana(new Date("2026-03-28T23:30:00Z")) === "2026-03-29");
assert("sin fecha, nada", F.enHoraEspanola(null) === null && F.fechaDeTx({ timeStamp: "" }) === null);

console.log("== Un movimiento del 31/12 por la noche cuenta en el año nuevo ==");
{
  const W = "0x" + "1".repeat(40), T = "0x" + "2".repeat(40), USDT = vm.runInContext("USDT", S);
  const tx = { blockNumber: "1", timeStamp: ts("2025-12-31T23:30:00Z"), hash: "0x" + "a".repeat(64), from: T, to: W,
    contractAddress: USDT, value: "5000000", tokenName: "Tether USD", tokenSymbol: "USDT", tokenDecimal: "6" };
  assert("la fecha del registro, en hora de España", F.fechaHoraDeTx(tx) === "2026-01-01 00:30:00", F.fechaHoraDeTx(tx));
  const regs = [{ clave: "r", hash: tx.hash, fecha: F.fechaHoraDeTx(tx), categoria: "RENDIMIENTO", subcategoria: "RCM_RECLAMADO",
    contrato: USDT, cantidad: 5, importe_usdt: 5, origen: T, destino: W, nota: "", revisar: false }];
  F.motorFiscal(regs, { tipos_bce: { "2025-12-31": 1 }, ajustes_usuario: {}, contratos_aprendidos: {} }, {},
    { cierres: {}, cierres_usd: {}, cierres_pools: {}, apartado: {}, cierres_otras: {} });
  const resumen = F.resumenFiscalAnual(regs);
  const anios = resumen instanceof Map || (resumen && typeof resumen.keys === "function" && !Array.isArray(resumen))
    ? [...resumen.keys()] : Object.keys(resumen);
  assert("y va a la Renta de 2026", anios.map(String).includes("2026") && !anios.map(String).includes("2025"), anios);
}

console.log("== El archivo de Reental: la fecha en España, la clave en UTC ==");
{
  const fila = { periodo_fiscal: "Casa #12/2025", fecha_reparto: F.aUtcNaive("2025-12-31T23:30:00Z") };  // un Date de la app (como lo da js/10)
  assert("la fecha del reparto, 01/01/2026 00:30", F.fechaHoraRegistro(fila.fecha_reparto) === "2026-01-01 00:30:00");
  assert("la clave sigue con el 31/12 (tus ajustes no se pierden)", F.claveRendimientoCsv(fila) === "csv::casa #12/2025::2025-12-31", F.claveRendimientoCsv(fila));
}

console.log("== Al pasar el ratón: las dos horas ==");
assert("invierno", F.fechaDosHoras("2026-01-01 00:30:00") === "01/01/2026 00:30, hora española · 31/12/2025 23:30 UTC", F.fechaDosHoras("2026-01-01 00:30:00"));
assert("verano", F.fechaDosHoras("2025-07-02 00:15:05") === "02/07/2025 00:15, hora española · 01/07/2025 22:15 UTC");
assert("sin hora, solo la fecha", F.fechaDosHoras("2025-03-10") === "10/03/2025" && F.fechaDosHoras("") === "");

console.log("== Auditoría A1: la hora repetida de octubre no desordena ==");
{
  // 26/10/2025: de 02:00 a 03:00 pasa dos veces. Compra a las 00:45 UTC
  // (02:45, horario de verano) y venta a las 01:15 UTC (02:15, de invierno).
  const W = "0x" + "1".repeat(40), TOK = "0x" + "a".repeat(40), OTRO = "0x" + "c".repeat(40);
  const compraTx = { hash: "0x" + "b".repeat(64), timeStamp: ts("2025-10-26T00:45:00Z") };
  const ventaTx = { hash: "0x" + "d".repeat(64), timeStamp: ts("2025-10-26T01:15:00Z") };
  const regs = [
    { clave: "c", hash: compraTx.hash, fecha: F.fechaHoraDeTx(compraTx), categoria: "COMPRA", subcategoria: "COSTE_BASE",
      contrato: TOK, cantidad: 2, via_compra: "BANCARIA", coste_eur: 200, inmueble: "Casa", origen: OTRO, destino: W, nota: "", revisar: false },
    { clave: "v", hash: ventaTx.hash, fecha: F.fechaHoraDeTx(ventaTx), categoria: "VENTA", subcategoria: "GPP_INMUEBLE",
      contrato: TOK, cantidad: 2, importe_usdt: 300, inmueble: "Casa", origen: W, destino: OTRO, nota: "", revisar: false }];
  assert("las dos en la hora repetida: la compra «02:45» y la venta «02:15»",
    regs[0].fecha === "2025-10-26 02:45:00" && regs[1].fecha === "2025-10-26 02:15:00", regs.map(r => r.fecha));
  F.anotarInstantes({ transacciones: { wallet_tokens: [compraTx, ventaTx] } }, regs);
  assert("cada una lleva su instante en UTC", regs[0].instante === "2025-10-26 00:45:00" && regs[1].instante === "2025-10-26 01:15:00", regs);
  assert("y se ordenan por él: la compra primero", F.ordenarPorFecha([...regs].reverse())[0].clave === "c");
  F.motorFiscal(regs, { tipos_bce: { "2025-10-24": 1 }, ajustes_usuario: {}, contratos_aprendidos: {} }, {},
    { cierres: {}, cierres_usd: {}, cierres_pools: {}, apartado: {}, cierres_otras: {} });
  assert("la venta tiene el coste de la compra (200 €) y no queda a revisar", regs[1].coste_fifo_eur === 200 && !regs[1].revisar, regs[1]);
  assert("al pasar el ratón, la UTC de verdad (00:45, no 01:45)",
    F.fechaDosHoras(regs[0].fecha, regs[0].instante) === "26/10/2025 02:45, hora española · 26/10/2025 00:45 UTC");
  const cambiada = { clave: "x", hash: compraTx.hash, fecha: "2025-11-03 10:00:00" };
  F.anotarInstantes({ transacciones: { wallet_tokens: [compraTx] } }, [cambiada]);
  assert("con la fecha cambiada por un ajuste, no se pone un instante que no es el suyo", cambiada.instante === undefined, cambiada);
}

console.log("== Auditoría A2, A3 y T2: cada sitio que pasa fechas a hora española ==");
{
  const S2 = sandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "08-coingecko.js", "09-sincronizacion.js",
    "10-csv-descubrimiento.js", "12-carga-archivos.js", "14-clasificador.js", "15-correcciones.js", "16-dashboard.js",
    "18-transacciones.js", "17-rendimientos.js"], HORA_APP);
  const G = vm.runInContext("({ aUtcNaive, dashRepartos, rdRepartos, rdHtmlFila, csvUltimaFecha, fechasUnicasTransacciones, " +
    "serieSaldoVault, diasDesdeFechaRnt, USDT })", S2);
  const noche = () => G.aUtcNaive("2025-12-31T23:30:00Z");   // un Date de la VM, como el de js/10
  const fila = { linea_csv: 2, periodo_fiscal: "Casa #12/2025", inmueble: "Casa", fecha_reparto: noche(), distributed: 5,
    reinvested: 5, claimed: 0, retained: 0, hashes: [] };
  const rep = G.dashRepartos([fila], []).repartos[0];
  assert("📊/💰: el reparto del 31/12 23:30 UTC es del 01/01, con su hora", rep.fecha === "2026-01-01" && rep.fechaHora === "2026-01-01 00:30:00", rep);
  const html = G.rdHtmlFila(G.rdRepartos([fila], []).filas[0], {});
  assert("💰: al pasar el ratón por el reparto, las dos horas (A2)",
    html.includes('title="01/01/2026 00:30, hora española · 31/12/2025 23:30 UTC">01/01/2026<'), html.slice(0, 200));
  assert("el último reparto del archivo (js/12)", G.csvUltimaFecha([fila]) === "2026-01-01");
  const tx = { hash: "0x" + "e".repeat(64), timeStamp: ts("2025-12-31T23:30:00Z"), contractAddress: G.USDT, from: "0x" + "2".repeat(40),
    to: "0x" + "3".repeat(40), value: "1000000", tokenDecimal: "6" };
  const cache = { transacciones: { vault_tokens: [tx] } };
  assert("las fechas que se piden al BCE (js/07)", JSON.stringify(G.fechasUnicasTransacciones(cache, [fila]).sort()) === '["2026-01-01"]',
    G.fechasUnicasTransacciones(cache, [fila]));
  const vault = G.serieSaldoVault(cache, "0x" + "3".repeat(40)).movimientos[0];
  assert("el saldo del vault, con la fecha española (js/09)", vault && vault.fecha === "2026-01-01 00:30:00", vault);
  assert("los días desde un precio de RNT cuentan desde hoy en España (A3)", G.diasDesdeFechaRnt("2026-01-01", Date.parse("2026-01-01T23:30:00Z")) === 1);
}

console.log("== Auditoría T2: el «hoy» de 🧾 y del BCE, con el reloj a las 00:30 del 02/01 en España ==");
{
  const S3 = sandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "09-sincronizacion.js",
    "10-csv-descubrimiento.js", "14-clasificador.js", "21-fiscal.js", "22-informe-renta.js", "23-fiscal-pestana.js"], HORA_APP);
  vm.runInContext("const __D = Date; Date = class extends __D { constructor(...a) { if (a.length) super(...a); " +
    "else super(__D.parse('2026-01-01T23:30:00Z')); } static now() { return __D.parse('2026-01-01T23:30:00Z'); } };", S3);
  const hasta = vm.runInContext("fiHastaCuando({ ultima_sincronizacion: { fecha: '2026-01-02', etherscan_fallo: false } })", S3);
  assert("🧾: hoy es el 02/01 (en UTC aún 01/01) y la sincronización de hoy cuenta", hasta.diaReal === "2026-01-02" && hasta.sincronizada === "2026-01-02", hasta);
  const bce = vm.runInContext("fechasBceNecesarias({ transacciones: {} }, [{ fecha_reparto: aUtcNaive('2025-06-01T10:00:00Z') }])", S3);
  assert("BCE: «ayer» es el 01/01", JSON.stringify([...bce].sort()) === '["2025-06-01","2025-12-31","2026-01-01"]', bce);
}

console.log("== En UTC (las paridades): como antes ==");
vm.runInContext('ZONA_FECHAS = "UTC";', S);
assert("el 31/12 23:30 sigue en 2025", F.fechaDeTx({ timeStamp: ts("2025-12-31T23:30:00Z") }) === "2025-12-31" &&
  enEspana("2025-12-31T23:30:00Z") === "2025-12-31 23:30:00");

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
