/* P18: 🔍 Catálogo de inmuebles, interruptor «Ver todos». Apagado, solo los
 * inmuebles que tienes: se esconden los confirmados sin ningún token en tu
 * wallet ni en tu vault; nunca uno con dudas ni uno con saldo negativo.
 *
 * Bajo prueba: dashSaldosCatalogo (js/16, también la usa «Tu cartera») y
 * pnSinTokens / pnHtmlCatalogo (js/11).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_catalogo_paso_p18.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const S = { console, state: {}, log: () => {}, document: { getElementById: () => null } };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "10-csv-descubrimiento.js",
                 "11-panel.js", "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), T = "0x" + "77".repeat(20), OTRA = "0x" + "99".repeat(20);
const [TENGO, VENDIDO, VAULT, NEG, DUDA, NUNCA] = ["a1", "a2", "a3", "a4", "a5", "a6"].map(x => "0x" + x.repeat(20));
const tok = (n, contrato, de, a, q) => ({ blockNumber: String(n), timeStamp: String(1700000000 + n), hash: "0x" + String(n).padStart(64, "0"),
  from: de, to: a, contractAddress: contrato, value: (BigInt(Math.round(q * 1e6)) * 10n ** 12n).toString(), tokenName: "Reental X", tokenSymbol: "X", tokenDecimal: "18" });
const STATE = vm.runInContext("state", S);
STATE.config = { wallet: W, vault: V };
const cache = S.asegurarEstructuraCache(S.cacheVacia());
const conf = { estado: "CONFIRMADA", nombre_reental: "Prueba", simbolo: "RP" };
cache.catalogo_propiedades = { [TENGO]: conf, [VENDIDO]: conf, [VAULT]: conf, [NEG]: conf, [DUDA]: { estado: "CANDIDATA", simbolo: "RD" },
  [NUNCA]: conf };
cache.transacciones.wallet_tokens.push(
  tok(1, TENGO, T, W, 5),                          // lo tienes
  tok(2, VENDIDO, T, W, 3), tok(3, VENDIDO, W, OTRA, 3),   // vendido entero
  tok(4, VAULT, T, W, 2), tok(5, VAULT, W, V, 2),  // pasado a tu vault: sigue siendo tuyo
  tok(6, NEG, W, OTRA, 1),                         // sale sin haber entrado: falta historia
  tok(7, DUDA, T, W, 1), tok(8, DUDA, W, OTRA, 1)); // con dudas y a 0
STATE.cache = cache;

const red6 = vm.runInContext("red6", S);
console.log("== 1. Lo que tienes de cada uno ==");
const sc = S.dashSaldosCatalogo(cache), { saldos } = sc;
assert("saldos: 5, 0, 2 (en el vault), −1 y 0 (con dudas)", red6(saldos.get(TENGO)) === 5 && red6(saldos.get(VENDIDO)) === 0 &&
  red6(saldos.get(VAULT)) === 2 && red6(saldos.get(NEG)) === -1 && red6(saldos.get(DUDA)) === 0, [...saldos]);

console.log("== 2. Qué se esconde ==");
const filas = S.pnFilasVisibles(S.pnFilasCatalogo(cache));
const sin = filas.filter(f => S.pnSinTokens(f, sc)).map(f => f.addr);
assert("se esconden el vendido y el que nunca tuviste; no el del vault, ni el negativo, ni el con dudas",
  JSON.stringify(sin.sort()) === JSON.stringify([VENDIDO, NUNCA].sort()), sin);
const html = S.pnHtmlCatalogo(filas, new Set(sin));
assert("con «Ver todos», los sin tokens salen en gris (rv-sin-tokens)",
  (html.match(/class="rv-sin-tokens"/g) || []).length === 2 && html.includes('<tr data-addr="' + VENDIDO + '" class="rv-sin-tokens">'), html.slice(0, 200));
assert("«Tu cartera» del Dashboard dice lo mismo que antes (5 + 2 tokens, 1 negativo, 0 con dudas con tokens)",
  JSON.stringify(S.dashCarteraTokens(cache).items.map(i => i.n)) === "[5,2]" && S.dashCarteraTokens(cache).negativos === 1 &&
  S.dashCarteraTokens(cache).conDudas === 0, S.dashCarteraTokens(cache));

console.log("== 3. Auditoría ==");
{
  // F3: un movimiento que no se puede leer: en la duda, se ve.
  const c3 = S.asegurarEstructuraCache(S.cacheVacia());
  c3.catalogo_propiedades = { [VENDIDO]: conf };
  c3.transacciones.wallet_tokens.push(Object.assign(tok(9, VENDIDO, T, W, 1), { value: "abc" }));
  STATE.cache = c3;
  const s3 = S.dashSaldosCatalogo(c3);
  assert("F3: con un movimiento ilegible, no se esconde", s3.ilegibles.has(VENDIDO) &&
    !S.pnSinTokens({ addr: VENDIDO, estado: "CONFIRMADA" }, s3), [...s3.ilegibles]);
  STATE.cache = cache;
  // F2: el que acabas de confirmar se queda a la vista.
  vm.runInContext("pnConfirmadosAhora", S).add(NUNCA);
  assert("F2: recién confirmado, a la vista aunque no tengas tokens", !S.pnSinTokens({ addr: NUNCA, estado: "CONFIRMADA" }, sc));
  vm.runInContext("pnConfirmadosAhora", S).delete(NUNCA);
}

// P19: la columna «Token» del catálogo, sin el «Reental-» de delante.
{
  const fila = s => S.pnHtmlFilaCatalogo({ addr: TENGO, estado: "CONFIRMADA", entrada: { nombre_reental: "Málaga 8", simbolo: s } }, false);
  assert("P19: «Reental-MLG-8» → «MLG-8»", fila("Reental-MLG-8").includes("<td>MLG-8</td>"), fila("Reental-MLG-8").slice(0, 120));
  assert("P19: sin prefijo, igual", fila("FDR").includes("<td>FDR</td>"));
  assert("P19: el nombre no cambia", fila("Reental-MLG-8").includes("<td>Málaga 8</td>"));
}

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
