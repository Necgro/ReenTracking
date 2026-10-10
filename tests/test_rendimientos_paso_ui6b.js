/* Test de 💰 Rendimientos y 📊 Dashboard: totales, «USD» y dinero invertido.
 *
 * Bajo prueba:
 * - js/17: la tarjeta del total, con las mismas cifras que la fila del
 *   total, en casillas iguales.
 * - index.html: «USD» en las cabeceras de los importes.
 * - js/16: el dinero invertido (compras de inmuebles, se paguen como
 *   se paguen, menos lo cobrado en las ventas; sin canjes ni swaps), por
 *   mes, con su tarjeta y su gráfico; la letra de los ejes, más pequeña.
 * - js/16: «USD» en los importes del Dashboard.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_rendimientos_paso_ui6b.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const S = { console, state: {}, log: () => {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js", "17-rendimientos.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), S, { filename: f });
}
vm.runInContext("log = function () {}; toast = function () {};", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const sinEtiquetas = h => h.replace(/<[^>]+>/g, "|").replace(/&nbsp;/g, " ").split("|").map(x => x.trim()).filter(Boolean);

console.log("== 1. W22: la tarjeta del total ==");
const sumas = { integro: 1234.5678, retencion: 0, reclamado: 8.1, reinvertido: 1200, pendiente: 26.4678 };
const tarjeta = S.rdHtmlTarjetaTotal(sumas);
const textos = sinEtiquetas(tarjeta);
assert("cinco cifras en el orden de la tabla, con «USD»",
  JSON.stringify(textos) === JSON.stringify(["Íntegro", "1.234,57 USD", "Retención", "0,00 USD", "Reclamado (neto)", "8,10 USD",
                                             "Reinvertido", "1.200,00 USD", "Pendiente", "26,47 USD"]), textos);
assert("las mismas cifras que la fila del total",
  JSON.stringify(sinEtiquetas(S.rdHtmlTotal(sumas)).slice(1).filter(x => x !== "–")) ===
  JSON.stringify(textos.filter(x => / USD$/.test(x) && x !== "0,00 USD").map(x => x.replace(" USD", ""))));
assert("casillas iguales: ninguna más grande (SUELTOS-1)", !tarjeta.includes("rd-tt-principal") &&
  (tarjeta.match(/class="rd-tt-dato"/g) || []).length === 5, tarjeta.slice(0, 160));
assert("la cifra exacta en la ayuda", /title="26,4678 USD"/.test(tarjeta));

console.log("== 2. W23 e index.html ==");
const html = fs.readFileSync(path.join(SPA, "index.html"), "utf8");
const cab = (html.match(/<table id="rdTabla"[\s\S]*?<\/thead>/) || [""])[0];
for (const n of ["Íntegro", "Retención", "Reinvertido", "Pendiente"]) {
  assert("cabecera «" + n + "» con USD", cab.includes(">" + n + '<span class="rd-sub">USD</span>'));
}
assert("cabecera «Reclamado» con USD (neto)", cab.includes('>Reclamado<span class="rd-sub">USD (neto)</span>'));
assert("la tarjeta va antes del pendiente de reclamar y de la tabla, escondida al empezar",
  /<div id="rdTarjetaTotal"[^>]*hidden><\/div>\s*<p id="rdPendiente"/.test(html) && html.indexOf("rdTarjetaTotal") < html.indexOf('id="rdTabla"'));

console.log("== 3. W24: dinero invertido (js/16) ==");
const H = n => "0x" + String(n).padStart(64, "0");
const TOKEN = "0x" + "ab".repeat(20), USDT = vm.runInContext("USDT", S);
const reg = (fecha, categoria, subcategoria, campos) =>
  Object.assign({ fecha, categoria, subcategoria, hash: H(fecha.replace(/\D/g, "")), inmueble: "Toledo 1", contrato: TOKEN }, campos);
const tipos = { "2024-02-13": 1.09, "2024-02-15": 1.08 };
assert("BCE del día o del anterior más cercano; ninguno antes, null",
  S.dashTipoBce(tipos, "2024-02-15") === 1.08 && S.dashTipoBce(tipos, "2024-02-14") === 1.09 &&
  S.dashTipoBce(tipos, "2024-02-19") === 1.08 && S.dashTipoBce(tipos, "2024-02-12") === null &&
  S.dashTipoBce({ "2024-03-01": "x", "2024-03-02": 0 }, "2024-03-05") === null && S.dashTipoBce(null, "2024-03-05") === null);
const canje = H(77);
const regs = [
  reg("2024-02-14 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 450, importe_usdt: null }),  // 450 € × 1,09
  reg("2024-02-16 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "ONCHAIN", importe_usdt: 96 }), 
  reg("2024-02-16 11:00:00", "VENTA", "GPP_INMUEBLE", { importe_usdt: 91 }), 
  reg("2024-04-09 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "VAULT", importe_usdt: 85 }),                     // con lo reinvertido
  Object.assign(reg("2024-06-01 10:00:00", "VENTA", "GPP_INMUEBLE", {}), { hash: canje }),                           // canje: fuera
  Object.assign(reg("2024-06-01 10:00:01", "COMPRA", "COSTE_BASE", { via_compra: "CANJE" }), { hash: canje }),
  reg("2024-06-03 10:00:00", "COMPRA", "COSTE_BASE", { importe_usdt: 50 }),                                           // RNT o un swap: fuera
  reg("2024-06-04 10:00:00", "VENTA", "GPP_SWAP", { importe_usdt: 50 }),
  reg("2024-06-05 10:00:00", "RENDIMIENTO", "RCM_REINVERTIDO", { importe_usdt: 3 }),                                // ya va en la compra desde el vault
  reg("2024-07-01 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "ONCHAIN", importe_usdt: null }),                // pago conjunto: sin importe
  reg("2024-07-02 10:00:00", "VENTA", "GPP_INMUEBLE", { importe_usdt: null }),                                      // burn sin contraprestación
  reg("2024-02-01 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 100 }),                   // sin BCE anterior
  reg("sin fecha", "COMPRA", "COSTE_BASE", { via_compra: "ONCHAIN", importe_usdt: 10 }),
  null,
];
const inv = S.dashDineroInvertido(regs.slice().reverse(), tipos);
assert("compras de inmuebles, se paguen como se paguen; ventas restan; en orden",
  JSON.stringify(inv.movimientos.map(m => [m.fecha.slice(0, 10), +m.delta.toFixed(2), m.invertido])) ===
  JSON.stringify([["2024-02-14", 490.5], ["2024-02-16", 96], ["2024-02-16", -91], ["2024-04-09", 85]].map(([f, d], i, a) =>
    [f, d, a.slice(0, i + 1).reduce((t, x) => t + x[1], 0)])), inv.movimientos);
assert("3 compras y 1 venta; fuera y contadas: 2 sin importe, 1 sin BCE, 1 sin fecha",
  inv.compras === 3 && inv.ventas === 1 && inv.sinImporte === 2 && inv.sinCambio === 1 && inv.sinFecha === 1, inv);
{
  const conVentaReal = regs.concat([Object.assign(reg("2024-06-01 10:00:02", "VENTA", "GPP_INMUEBLE", { importe_usdt: 20 }), { hash: canje })]);
  const r = S.dashDineroInvertido(conVentaReal, tipos);
  assert("en el hash de un canje, una venta con importe sí cuenta (solo sale la del canje, sin importe)",
    r.ventas === 2 && r.sinImporte === 2 && r.movimientos.some(m => m.delta === -20), r);
}
assert("sin registros: nada", S.dashDineroInvertido(null, tipos).movimientos.length === 0);
const mens = S.dashSerieMensual(inv.movimientos);
assert("a fin de mes, con los meses sin movimientos rellenos",
  JSON.stringify(mens) === JSON.stringify([{ etiqueta: "2024-02", valor: 495.5 }, { etiqueta: "2024-03", valor: 495.5 }, { etiqueta: "2024-04", valor: 580.5 }]), mens);
const tInv = S.dashTarjetaInvertido(inv, mens);
assert("tarjeta: «💼 Dinero invertido», lo de hoy, meses, compras y ventas",
  tInv.includes("<h3>💼 Dinero invertido</h3>") && tInv.includes('dash-value-lg">580,50&nbsp;USD') &&
  tInv.includes("A fin de mes · feb 2024 – abr 2024 · 3 compras y 1 venta"), tInv.slice(0, 400));
assert("tarjeta: lo que queda fuera, dicho",
  tInv.includes("⚠ 2 compras o ventas sin importe: fuera del gráfico.") && tInv.includes("⚠ 1 compra en € sin tipo del BCE: fuera del gráfico.") &&
  tInv.includes("⚠ 1 compra o venta sin fecha: fuera del gráfico."));
assert("sin clasificar: «No disponible» con enlace", /No disponible[\s\S]*Sin datos todavía[\s\S]*#inicio/.test(S.dashTarjetaInvertido(null, null)));
assert("sin compras: «No disponible»", S.dashTarjetaInvertido(S.dashDineroInvertido([], {}), []).includes("Sin compras de inmuebles con importe."));
const svg = S.dashSvgLinea(mens);
assert("eje con escalones redondos (0 … 600) y el bocadillo en USD (SUELTOS-1: ya no <title>)",
  />600<\/text>/.test(svg) && />0<\/text>/.test(svg) && S.dashHtmlBocadilloInvertido(mens[mens.length - 1]).includes("580,50 USD") &&
  !svg.includes("USDT"), svg.slice(0, 300));

console.log("== 3b. Arreglos de la auditoría (dinero invertido) ==");
assert("A6: un tipo del BCE de más de 4 días no vale",
  S.dashTipoBce(tipos, "2024-02-20") === null && S.dashTipoBce({ "2024-01-31": 1.08 }, "2024-09-15") === null);
{
  const r = S.dashDineroInvertido([reg("2024-09-15 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 10000 })], { "2024-01-31": 1.08 });
  assert("A6: una compra en € con el último tipo de hace meses queda fuera, contada", r.sinCambio === 1 && !r.movimientos.length, r);
}
{
  const r = S.dashDineroInvertido([
    reg("2024-05-01 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "VAULT", importe_usdt: 1000, inmueble: null, contrato: USDT }),
    reg("2024-05-02 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "VAULT", importe_usdt: 300, contrato: USDT }),
    reg("2024-05-03 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 1000 }),
  ], { "2024-05-03": 1.1 });
  assert("A2: un pago del vault sin token (en USDT, sin inmueble) no es una compra de un inmueble",
    r.compras === 1 && r.movimientos.length === 1 && Math.abs(r.movimientos[0].invertido - 1100) < 1e-9, r);
}
{
  const r = S.dashDineroInvertido([
    reg("2024-05-03 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 1000, importe_usdt: 5 }),
    reg("2024-05-04 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "ONCHAIN", coste_eur: 50, importe_usdt: null }),
  ], { "2024-05-03": 1.1 });
  assert("A7: por transferencia, su coste en €; las demás, su importe en USD (como el motor)",
    r.movimientos.length === 1 && Math.abs(r.movimientos[0].delta - 1100) < 1e-9 && r.sinImporte === 1, r);
}
{
  const h = H(88);
  const r = S.dashDineroInvertido([
    Object.assign(reg("2024-06-01 10:00:00", "VENTA", "GPP_INMUEBLE", {}), { hash: h }),
    Object.assign(reg("2024-06-01 10:00:01", "VENTA", "GPP_INMUEBLE", {}), { hash: h }),
    Object.assign(reg("2024-06-01 10:00:02", "COMPRA", "COSTE_BASE", { via_compra: "CANJE" }), { hash: h }),
  ], {});
  assert("A9: en el hash de un canje, solo sale su venta; la otra sin importe se cuenta", r.sinImporte === 1 && !r.movimientos.length, r);
}
{
  const r = S.dashDineroInvertido([
    reg("0001-01-01 00:00:00", "COMPRA", "COSTE_BASE", { via_compra: "ONCHAIN", importe_usdt: 10 }),
    reg("1970-01-01 00:00:00", "COMPRA", "COSTE_BASE", { via_compra: "ONCHAIN", importe_usdt: 10 }),
    reg("2024-05-01 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "ONCHAIN", importe_usdt: 10 }),
  ], {});
  assert("A12: una fecha imposible (año 0001, 1970) queda fuera, contada, y no alarga el gráfico",
    r.sinFecha === 2 && S.dashSerieMensual(r.movimientos).length === 1, r);
}
{
  const r = S.dashDineroInvertido([reg("2024-05-03 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 1000 })], {});
  const t = S.dashTarjetaInvertido(r, S.dashSerieMensual(r.movimientos));
  assert("A5: con todo fuera, la tarjeta dice por qué (no «sin compras»)",
    t.includes("Ninguna compra en el gráfico.") && t.includes("⚠ 1 compra en € sin tipo del BCE: fuera del gráfico.") &&
    !t.includes("Sin compras de inmuebles"), t);
}
{
  const s2 = [{ etiqueta: "2024-01", valor: 100 }, { etiqueta: "2024-02", valor: 100 }, { etiqueta: "2024-03", valor: -50 }];
  const ejes = (S.dashSvgLinea(s2).match(/text-anchor="end">([^<]*)</g) || []).map(x => x.replace(/.*>/, "").replace("<", ""));
  assert("A8: con negativos, el eje también en escalones redondos y con el 0",
    JSON.stringify(ejes) === JSON.stringify(["-50", "0", "50", "100", "150"]) || JSON.stringify(ejes) === JSON.stringify(["-50", "0", "50", "100"]), ejes);
  const e = S.dashEjeRedondoRango(-50, 100);
  assert("A8: el eje abarca de min a max", e.bot <= -50 && e.top >= 100 && e.bot % 50 === 0, e);
}
{
  const s3 = [{ etiqueta: "2024-01", valor: 900 }, { etiqueta: "2024-02", valor: 700 }];
  assert("la cifra grande es la del último mes, no la mayor",
    S.dashTarjetaInvertido({ compras: 1, ventas: 1, sinImporte: 0, sinCambio: 0, sinFecha: 0 }, s3).includes('dash-value-lg">700,00&nbsp;USD'));
}

console.log("== 4. «USD» en el Dashboard (D33) ==");
const d16 = fs.readFileSync(path.join(SPA, "js", "16-dashboard.js"), "utf8");
const visibles = (d16.match(/"[^"\n]*USDT[^"\n]*"/g) || []).filter(x => !/movimientos? USDT|USDT0|_usdt/.test(x));
assert("ningún importe del Dashboard dice «USDT», salvo el saldo del vault (A10: solo suma USDT)",
  JSON.stringify(visibles) === JSON.stringify(['" USDT"']) && /dashMetrica\("Saldo del vault"[^\n]*" USDT"/.test(d16), visibles);
assert("A13: una tilde suelta no es buscar nada", S.txHayBusqueda("´") === false && S.txHayBusqueda(" ¨ ") === false && S.txHayBusqueda("cáceres") === true);
assert("A14: la tarjeta del total no se lee en voz alta en cada repintado (ya lo hace el recuento)",
  !/id="rdTarjetaTotal"[^>]*aria-live/.test(html));
assert("la letra de los ejes, más pequeña (9,5)", d16.includes(".dash-ax{fill:var(--faint);font-size:9.5px"));

console.log("== 5. Una sola regla para cada reparto (dashRepartos, D35) ==");
{
  const fecha = s => new Date(s + "T00:00:00Z");
  const fila = (dividend, f, distributed, reinvested, claimed, retained, linea) => ({
    inmueble: S.extraerInmueble(dividend), periodo_fiscal: dividend, fecha_reparto: fecha(f),
    distributed, reinvested, claimed, retained, importe: reinvested + claimed, linea_csv: linea, hashes: [] });
  const filas = [fila("Cáceres 8 #1/2026", "2026-01-31", 10, 9.997, 0, 0, 2),      // resto 0,003: no es pendiente
                 fila("Fondo 1 #1/2026", "2026-01-31", 5, 5, 0, 0, 3),
                 fila("Fondo 1 #2/2026", "2026-02-28", 0, 0, 0, 0, 4)];          // todo a 0: no es un reparto
  const claves = S.clavesRendimientosCsv(filas);
  const registros = [{ clave: claves[3], categoria: "RENDIMIENTO", inmueble: "  ", fecha: "2026-01-31" }];
  const dash = S.dashRendimientosResumen(filas, registros);
  const rd = S.rdRepartos(filas, registros);
  const red6 = vm.runInContext("red6", S);
  const sumaRd = k => red6(rd.filas.reduce((t, f) => t + f[k], 0));
  assert("un resto de medio céntimo no es pendiente, tampoco en el Dashboard (antes 0,003)", dash.pendiente === 0 && sumaRd("pendiente") === 0, dash.pendiente);
  assert("un inmueble en blanco en tu ajuste no borra el del archivo, tampoco en el ranking del Dashboard",
    dash.porInmueble.map(e => e.periodo).sort().join() === "Cáceres 8,Fondo 1" && rd.filas.some(f => f.inmueble === "Fondo 1"),
    dash.porInmueble.map(e => e.periodo));
  assert("las mismas cifras en las dos pestañas",
    dash.total === sumaRd("integro") && dash.reinvested === sumaRd("reinvertido") && dash.retained === sumaRd("retencion") &&
    dash.filas === rd.filas.length && dash.sinContar === rd.sinContar, [dash, rd.filas.length]);
}

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
