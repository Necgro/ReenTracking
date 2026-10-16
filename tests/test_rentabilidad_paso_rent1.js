/* RENT-1: 📊 «Rentabilidad media» en la franja de métricas: lo repartido
 * (íntegro) más lo ganado en las ventas (USD, FIFO de 📊), sobre el dinero
 * invertido medio, desde la primera compra y anualizada.
 *
 * Bajo prueba (js/16): gananciaVentas de dashDineroInvertido,
 * dashRentabilidadMedia y dashTituloRentabilidad.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_rentabilidad_paso_rent1.js
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
                 "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const cerca = (a, b) => Math.abs(a - b) < 1e-6;
const A = "0x" + "a1".repeat(20);
let n = 0;
const reg = (fecha, categoria, campos) => Object.assign({ clave: "k" + (++n), fecha: fecha + " 10:00:00", categoria,
  subcategoria: categoria === "VENTA" ? "GPP_INMUEBLE" : "COSTE_BASE", hash: "0x" + String(n).padStart(64, "0"),
  inmueble: "Prueba Alcazaba 1", contrato: A }, campos);
const compra = (fecha, cantidad, usd) => reg(fecha, "COMPRA", { via_compra: "ONCHAIN", cantidad, importe_usdt: usd });

console.log("== 1. Lo ganado en las ventas ==");
{
  const inv = S.dashDineroInvertido([compra("2024-01-10", 10, 1000), reg("2024-06-10", "VENTA", { cantidad: 4, importe_usdt: 460 })], {});
  assert("vender 4 tokens de 100 $ por 460 $: +60 $", cerca(inv.gananciaVentas, 60), inv.gananciaVentas);
  const sinCobro = S.dashDineroInvertido([compra("2024-01-10", 10, 1000), reg("2024-06-10", "VENTA", { cantidad: 4 })], {});
  assert("venta sin lo cobrado: no suma (no se sabe)", sinCobro.gananciaVentas === 0);
  const deMas = S.dashDineroInvertido([compra("2024-01-10", 2, 200), reg("2024-06-10", "VENTA", { cantidad: 4, importe_usdt: 440 })], {});
  assert("vender 4 con compra contada de 2: solo cuenta lo cobrado por esos 2 (220 − 200 = 20)", cerca(deMas.gananciaVentas, 20), deMas.gananciaVentas);
  const perdida = S.dashDineroInvertido([compra("2024-01-10", 10, 1000), reg("2024-06-10", "VENTA", { cantidad: 10, importe_usdt: 950 })], {});
  assert("con pérdida: −50 $", cerca(perdida.gananciaVentas, -50));
}

console.log("== 2. La rentabilidad media ==");
{
  // 1.000 $ todo el tiempo, del 01/01/2024 al 01/01/2026 (2 años), 160 $ repartidos y 0 de ventas → 8 % anual.
  const inv = S.dashDineroInvertido([compra("2024-01-01", 10, 1000)], {});
  const serie = S.dashSerieMensual(inv.movimientos);
  const r = S.dashRentabilidadMedia(inv, serie, { total: 160 }, "2026-01-01");
  assert("1.000 $ durante 2 años y 160 $ repartidos: ≈ 8 % anual", Math.abs(r.pct - 8) < 0.01 && cerca(r.medio, 1000), r);
  // Se invierte la mitad del tiempo: la media baja a la mitad y la rentabilidad sube.
  const tarde = S.dashDineroInvertido([compra("2024-01-01", 5, 500), compra("2025-01-01", 5, 500)], {});
  const rt = S.dashRentabilidadMedia(tarde, S.dashSerieMensual(tarde.movimientos), { total: 120 }, "2026-01-01");
  assert("500 $ un año y 1.000 $ otro: invertido medio ≈ 760 (25 meses)", Math.abs(rt.medio - (12 * 500 + 13 * 1000) / 25) < 1e-6, rt);
  const conVenta = S.dashDineroInvertido([compra("2024-01-01", 10, 1000), reg("2025-01-01", "VENTA", { cantidad: 5, importe_usdt: 560 })], {});
  const rv = S.dashRentabilidadMedia(conVenta, S.dashSerieMensual(conVenta.movimientos), { total: 100 }, "2026-01-01");
  assert("las ventas suman: 100 repartido + 60 ganado", cerca(rv.ventas, 60) && cerca(rv.rend + rv.ventas, 160), rv);
  assert("burbuja: «Rendimientos 100,00 USD y ganancia de ventas 60,00 USD (en USD; 🧾 Fiscal va en €), sobre … desde 01/01/2024 (2,0 años)»",
    /^Rendimientos 100,00 USD y ganancia de ventas 60,00 USD \(en USD; 🧾 Fiscal va en €\), sobre [\d.,]+ USD invertidos de media, desde 01\/01\/2024 \(2,0 años\)$/.test(S.dashTituloRentabilidad(rv)),
    S.dashTituloRentabilidad(rv));
  assert("con pérdida: «pérdida de ventas 50,00 USD»", S.dashTituloRentabilidad(Object.assign({}, rv, { ventas: -50 })).includes("USD y pérdida de ventas 50,00 USD"));
  assert("auditoría F4: «hoy» por defecto, el día en España",
    cerca(S.dashRentabilidadMedia(conVenta, S.dashSerieMensual(conVenta.movimientos), { total: 100 }).anios, S.ccDiasEntreFechas(vm.runInContext("hoyEspana()", S), "2024-01-01") / 365.25));
}

console.log("== 3. FIFO de verdad (auditoría T) ==");
{
  const dos = S.dashDineroInvertido([compra("2024-01-01", 5, 500), compra("2024-02-01", 5, 600), reg("2024-06-01", "VENTA", { cantidad: 7, importe_usdt: 900 })], {});
  assert("dos compras (100 y 120 $/token), venta de 7 por 900: 900 − (500 + 240) = +160", cerca(dos.gananciaVentas, 160), dos.gananciaVentas);
  const H = "0x" + "c".repeat(64), B = "0x" + "b2".repeat(20);
  const canje = S.dashDineroInvertido([compra("2024-01-01", 10, 1000),
    reg("2024-03-01", "VENTA", { cantidad: 10, hash: H }),
    reg("2024-03-01", "COMPRA", { via_compra: "CANJE", cantidad: 10, hash: H, contrato: B }),
    reg("2024-06-01", "VENTA", { cantidad: 10, importe_usdt: 1200, contrato: B })], {});
  assert("canje y venta del token nuevo: el coste viejo pasa, +200; el canje no es venta sin cobro", cerca(canje.gananciaVentas, 200) && canje.ventasSinCobro === 0, canje);
  const banco = S.dashDineroInvertido([reg("2024-03-01", "COMPRA", { via_compra: "BANCARIA", cantidad: 10, coste_eur: 1000 }),
    reg("2024-06-01", "VENTA", { cantidad: 10, importe_usdt: 1200 })], { "2024-03-01": 1.1 });
  assert("compra por transferencia (1.000 € a 1,1) vendida por 1.200 $: +100 $", cerca(banco.gananciaVentas, 100), banco.gananciaVentas);
}

console.log("== 4. «No disponible», con su motivo ==");
{
  const motivo = (inv, rend, hoy) => (S.dashRentabilidadMedia(inv, S.dashSerieMensual(inv.movimientos), rend, hoy) || {}).motivo;
  const inv = S.dashDineroInvertido([compra("2026-01-01", 10, 1000)], {});
  assert("auditoría F9: 3 meses de calendario (el 31/03 no; el 01/04 sí)",
    motivo(inv, { total: 10 }, "2026-03-31") === "Menos de 3 meses desde la primera compra." && motivo(inv, { total: 10 }, "2026-04-01") === undefined);
  assert("sin archivo de rendimientos", motivo(inv, null, "2026-12-01") === "Sin archivo de rendimientos.");
  assert("sin compras", S.dashRentabilidadMedia(S.dashDineroInvertido([], {}), [], { total: 10 }, "2026-12-01").motivo === "Sin compras de inmuebles con importe.");
  const todo = S.dashDineroInvertido([compra("2024-01-01", 10, 1000), reg("2024-01-20", "VENTA", { cantidad: 10, importe_usdt: 1000 })], {});
  assert("todo vendido el primer mes", motivo(todo, { total: 10 }, "2026-01-01") === "Sin dinero invertido de media.");
  const sinTipo = S.dashDineroInvertido([reg("2022-05-02", "COMPRA", { via_compra: "BANCARIA", cantidad: 100, coste_eur: 10000 }), compra("2026-01-05", 1, 100)], {});
  assert("auditoría F1: una compra fuera (sin tipo del BCE) → no se enseña un % disparado",
    motivo(sinTipo, { total: 3000 }, "2026-10-01") === "1 compra o venta fuera del dinero invertido (ver 💼).", motivo(sinTipo, { total: 3000 }, "2026-10-01"));
  const fechaRara = S.dashDineroInvertido([compra("2024-01-01", 10, 1000), reg("1970-01-01", "VENTA", { cantidad: 10, importe_usdt: 2000 })], {});
  assert("auditoría F7: una venta con fecha imposible, igual", /^1 compra o venta fuera/.test(motivo(fechaRara, { total: 10 }, "2026-01-01")));
  const sinCobro = S.dashDineroInvertido([compra("2024-01-01", 10, 1000), reg("2025-01-01", "VENTA", { cantidad: 5 })], {});
  assert("auditoría F2: venta sin lo cobrado", motivo(sinCobro, { total: 160 }, "2026-01-01") === "1 venta sin cobrar del todo (ver 🔍 Revisión).");
  const parcial = S.dashDineroInvertido([compra("2024-01-01", 10, 1000), reg("2025-01-01", "VENTA", { cantidad: 10, importe_usdt: 300, revisar: true })], {});
  assert("auditoría F10: pago diferido cobrado a medias (a revisar): ni pérdida falsa ni %",
    parcial.gananciaVentas === 0 && motivo(parcial, { total: 160 }, "2026-01-01") === "1 venta sin cobrar del todo (ver 🔍 Revisión).", parcial);
  const futura = S.dashDineroInvertido([compra("2024-01-01", 10, 1000), compra("2026-06-01", 10, 1000)], {});
  assert("auditoría F3: una compra después de hoy", motivo(futura, { total: 160 }, "2026-01-01") === "Un movimiento con fecha después de hoy.");
}

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
