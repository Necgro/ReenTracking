/* P17: 📊 «💼 Dinero invertido» con lo comprado en cada moneda debajo de
 * la cifra, como lo pone Reental: «€ 2.450,80 / $ 1.012,25» (€ lo de
 * transferencia; $ lo pagado en USDT o USDC, también desde el vault).
 *
 * Bajo prueba (js/16): dashDineroInvertido (eurBanco, usdStable) y
 * dashDesgloseInvertido / dashTarjetaInvertido.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_dashboard_paso_p17.js
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
const TOKEN = "0x" + "ab".repeat(20);
let n = 0;
const reg = (fecha, categoria, subcategoria, campos) => Object.assign({ clave: "k" + (++n), fecha, categoria, subcategoria,
  hash: "0x" + String(n).padStart(64, "0"), inmueble: "Prueba Alcazaba 1", contrato: TOKEN }, campos);
const tipos = { "2024-03-01": 1.1, "2024-04-01": 1.08 };
const SEP = '<span class="dash-desglose-sep">/</span>';

const banco1 = reg("2024-03-01 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 2000 });
const banco2 = reg("2024-04-01 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 450.8 });
const usdt = reg("2024-03-05 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "ONCHAIN", importe_usdt: 1000 });
const vault = reg("2024-03-06 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "VAULT", importe_usdt: 12.25 });

console.log("== 1. Lo comprado en cada moneda ==");
const inv = S.dashDineroInvertido([banco1, banco2, usdt, vault], tipos);
assert("transferencia en € (2.000 + 450,80); USDT y vault en $ (1.012,25)",
  Math.abs(inv.eurBanco - 2450.8) < 1e-9 && Math.abs(inv.usdStable - 1012.25) < 1e-9, inv);
assert("la cifra grande sigue siendo todo en USD (2.000×1,1 + 450,80×1,08 + 1.012,25)",
  Math.abs(inv.movimientos[inv.movimientos.length - 1].invertido - (2200 + 486.864 + 1012.25)) < 1e-6, inv.movimientos);
assert("el texto, como Reental: «€ 2.450,80 / $ 1.012,25»",
  S.dashDesgloseInvertido(inv) === '<div class="dash-desglose">€ 2.450,80' + SEP + "$ 1.012,25</div>", S.dashDesgloseInvertido(inv));
const tarjeta = S.dashTarjetaInvertido(inv, S.dashSerieMensual(inv.movimientos));
assert("en la tarjeta, justo debajo de la cifra", /dash-value-lg">[^<]*&nbsp;USD<\/div><div class="dash-desglose">/.test(tarjeta), tarjeta.slice(0, 300));

console.log("== 2. Una sola moneda, ventas y casos raros ==");
assert("solo USDT: «$ 1.000,00», sin €", S.dashDesgloseInvertido(S.dashDineroInvertido([usdt], tipos)) === '<div class="dash-desglose">$ 1.000,00</div>');
assert("solo transferencia: «€ 2.000,00», sin $", S.dashDesgloseInvertido(S.dashDineroInvertido([banco1], tipos)) === '<div class="dash-desglose">€ 2.000,00</div>');
const venta = reg("2024-05-01 10:00:00", "VENTA", "GPP_INMUEBLE", { importe_usdt: 650, cantidad: 5 });
const conVenta = S.dashDineroInvertido([Object.assign({}, usdt, { cantidad: 10 }), venta], tipos);
assert("vender 5 de 10 tokens resta lo que costaron (500), no lo cobrado (650), en la cifra y en el desglose",
  conVenta.usdStable === 500 && conVenta.movimientos[conVenta.movimientos.length - 1].invertido === 500, conVenta);
const sinTipo = reg("2023-01-01 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 999 });
const fuera = S.dashDineroInvertido([sinTipo, usdt], tipos);
assert("una compra en € sin tipo del BCE queda fuera también aquí (como en la cifra)", fuera.eurBanco === 0 && fuera.sinCambio === 1, fuera);
assert("auditoría F6: lo que redondea a 0,00 no sale («$ 500,00», sin «€ 0,00»)",
  S.dashDesgloseInvertido({ eurBanco: 0.004, usdStable: 500 }) === '<div class="dash-desglose">$ 500,00</div>',
  S.dashDesgloseInvertido({ eurBanco: 0.004, usdStable: 500 }));
assert("sin nada: sin desglose", S.dashDesgloseInvertido(S.dashDineroInvertido([], tipos)) === "");

console.log("== 2. Auditoría S4: con la cache, como 💶 ==");
{
  // Pascua: el último tipo es del jueves 17/04/2025 y lo descargado llega al lunes 21; el pago es del martes 22.
  const pascua = reg("2025-04-25 10:00:00", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 909.09 });
  const aj = { [pascua.clave]: { coste_eur: 909.09, nota: "Coste puesto por ti (2025-04-25)", pagado_usd: 1000, fecha_pago_usd: "2025-04-22" } };
  const t = { "2025-04-17": 1.1, "2025-04-25": 1.13 };
  const cache = { tipos_bce: t, bce_cobertura: { inicio: "2025-01-01", fin: "2025-04-21" } };
  const conCache = S.dashDineroInvertido([pascua], t, aj, cache);
  assert("pagada en USD el día de después de la Pascua: el Dashboard la pone en $ (como 💶)",
    Math.abs(conCache.usdStable - 1000) < 1e-9 && conCache.eurBanco === 0, conCache);
}

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
