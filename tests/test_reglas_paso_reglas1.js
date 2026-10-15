/* Test de reglas de clasificación (las notas de los pagos diferidos, en
 * test_pagos_diferidos_paso_23.js).
 *
 * Bajo prueba (js/14):
 * - correlacionarCambioStable: USDC -> USDT en el mismo hash = permuta
 *   (VENTA GPP_SWAP + COMPRA), valoradas por el mayor de los dos importes.
 * - correlacionarCompras: el resto que devuelve quien cobró la compra
 *   rebaja su coste y no es un depósito.
 * - imitaDireccionPropia / clasificarIndividual: lo que llega de una
 *   dirección que imita la wallet (3 y 3) es spam.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_reglas_paso_reglas1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
function nuevoSandbox(archivos) {
  const sb = { console, state: {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext("log = function () {}; toast = function () {};", sb);
  return sb;
}
const MOTOR = ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"];

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const WALLET = "0x" + "e1".repeat(20), VAULT = "0x" + "e2".repeat(20);
const DESCONOCIDO = "0x" + "e9".repeat(20), PROP_ES = "0x" + "c1".repeat(20);
const CAMBIO = "0x" + "a5".repeat(20), OTRO = "0x" + "a6".repeat(20), VENDEDOR = "0x" + "a7".repeat(20);
const IMITA = "0x" + "e1e" + "0".repeat(34) + "1e1";     // 3 y 3 iguales que WALLET
const NO_IMITA = "0x" + "e10" + "0".repeat(34) + "1e1";  // solo 2 al principio
const sb0 = nuevoSandbox(MOTOR);
const USDT = vm.runInContext("USDT", sb0), USDC = vm.runInContext("USDC", sb0);
const h = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
const ts = (a, m, d) => String(Math.floor(Date.UTC(a, m - 1, d, 12) / 1000));
const tx = (hash, origen, destino, unidades, marca, contrato = USDT, simbolo = "USDT0", dec = 6) => ({
  hash, contractAddress: contrato, from: origen, to: destino,
  value: (BigInt(Math.round(unidades * 1e6)) * 10n ** BigInt(dec - 6)).toString(),
  tokenDecimal: String(dec), tokenName: simbolo, tokenSymbol: simbolo, timeStamp: marca,
});
const usdc = (hash, o, d, u, m) => tx(hash, o, d, u, m, USDC, "USDC");
const CABECERA = "id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date";

function clasificar(transfers, rol) {
  const sb = nuevoSandbox(MOTOR);
  const cache = sb.cacheVacia();
  if (rol) (cache.contratos_aprendidos[rol] = cache.contratos_aprendidos[rol] || {})[CAMBIO] = "Contrato DeFi";
  cache.catalogo_propiedades[PROP_ES] = { nombre_reental: "Prueba ES", nombre_etherscan: "PRUEBA ES",
    simbolo: "P", estado: "CONFIRMADA" };
  cache.transacciones.wallet_tokens = transfers.filter(t => [t.from, t.to].includes(WALLET));
  cache.transacciones.vault_tokens = transfers.filter(t => [t.from, t.to].includes(VAULT));
  Object.assign(sb, { __cache: cache, __csv: CABECERA + "\n",
    __config: { wallet: WALLET, vault: VAULT, compra_bancaria_coste_eur_por_token: 100.0 } });
  vm.runInContext(`state.config = __config; __r = cargarCsvRendimientos(__csv);
    __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});`, sb);
  return sb.__regs;
}
const delHash = (regs, x) => regs.filter(r => r.hash === x);
const cats = regs => regs.map(r => r.categoria).sort().join();

console.log("== D22. Cambio de una stablecoin por otra ==");
let regs = delHash(clasificar([
  usdc(h(1), DESCONOCIDO, WALLET, 100, ts(2026, 5, 1)),
  usdc(h(2), WALLET, CAMBIO, 100, ts(2026, 5, 20)),
  tx(h(2), CAMBIO, WALLET, 100.5, ts(2026, 5, 20))]), h(2));
const venta = regs.find(r => r.categoria === "VENTA"), compra = regs.find(r => r.categoria === "COMPRA");
assert("USDC entregado: VENTA GPP_SWAP por el mayor (100,5)",
  venta && venta.subcategoria === "GPP_SWAP" && venta.simbolo === "USDC" && venta.importe_usdt === 100.5, regs);
assert("USDT recibido: COMPRA por el mismo valor",
  compra && compra.simbolo === "USDT0" && compra.importe_usdt === 100.5, regs);
assert("nota de permuta, sin «verificar»",
  venta.nota.includes("cambio de moneda (permuta)") && !(venta.nota + compra.nota).includes("verificar"), regs);
regs = delHash(clasificar([usdc(h(3), WALLET, CAMBIO, 50, ts(2026, 5, 20)), tx(h(3), OTRO, WALLET, 50, ts(2026, 5, 20))]), h(3));
assert("si vuelve de otra dirección, no es cambio", cats(regs) === "DEPOSITO,RETIRADA", regs);
regs = delHash(clasificar([tx(h(4), WALLET, CAMBIO, 50, ts(2026, 5, 20)), tx(h(4), CAMBIO, WALLET, 49, ts(2026, 5, 20))]), h(4));
assert("la misma stablecoin, no es cambio", cats(regs) === "DEPOSITO,RETIRADA", regs);

console.log("== D23. Resto devuelto en una compra ==");
const compraCon = de => delHash(clasificar([
  tx(h(6), VENDEDOR, WALLET, 2, ts(2025, 4, 28), PROP_ES, "P", 18),
  tx(h(6), WALLET, VENDEDOR, 214.1, ts(2025, 4, 28)),
  tx(h(6), de, WALLET, 0.12, ts(2025, 4, 28))]), h(6));
regs = compraCon(VENDEDOR);
let c = regs.find(r => r.categoria === "COMPRA"), resto = regs.find(r => r.categoria !== "COMPRA");
assert("la compra cuesta 213,98 (descontado el resto)",
  c.importe_usdt === 213.98 && c.nota.includes("descontado el resto devuelto"), c);
assert("el resto es un movimiento neutro, no un depósito",
  resto.categoria === "MOVIMIENTO" && resto.subcategoria === "NEUTRO" && resto.nota.includes("resto devuelto de la compra"), resto);
regs = compraCon(OTRO);
c = regs.find(r => r.categoria === "COMPRA");
assert("si lo devuelve otro, la compra no cambia y es un depósito",
  c.importe_usdt === 214.1 && regs.some(r => r.categoria === "DEPOSITO"), regs);

console.log("== D24. Envenenamiento de direcciones ==");
const sb = nuevoSandbox(MOTOR);
sb.__config = { wallet: WALLET, vault: VAULT };
vm.runInContext("state.config = __config;", sb);
assert("imita: 3 y 3 sí; 2 y 3, la propia o vacía, no",
  sb.imitaDireccionPropia(IMITA) && !sb.imitaDireccionPropia(NO_IMITA) &&
  !sb.imitaDireccionPropia(WALLET) && !sb.imitaDireccionPropia(""));
{
  const vaultParecido = "0x" + "e1e" + "5".repeat(34) + "1e1"; // 3 y 3 como la wallet
  sb.__config = { wallet: WALLET, vault: vaultParecido };
  vm.runInContext("state.config = __config;", sb);
  assert("una dirección propia nunca es imitación (un vault parecido a la wallet)",
    !sb.imitaDireccionPropia(vaultParecido) && !sb.imitaDireccionPropia(WALLET));
}
regs = clasificar([tx(h(7), IMITA, WALLET, 0.0001, ts(2026, 6, 19)), tx(h(8), NO_IMITA, WALLET, 0.0001, ts(2026, 6, 19))]);
const [spam] = delHash(regs, h(7)), [dep] = delHash(regs, h(8));
assert("de la imitación: SPAM con su nota", spam.categoria === "SPAM" && spam.nota.includes("dirección que imita la tuya"), spam);
assert("de una que no imita: depósito", dep.categoria === "DEPOSITO", dep);

console.log("== Tras la revisión: casos límite ==");
regs = delHash(clasificar([usdc(h(9), WALLET, CAMBIO, 50, ts(2026, 5, 20)), tx(h(9), CAMBIO, WALLET, 2, ts(2026, 5, 20))], "DEFI_FARM"), h(9));
assert("contra un contrato DeFi no es permuta", !regs.some(r => r.categoria === "VENTA"), regs);
regs = delHash(clasificar([usdc(h(10), WALLET, CAMBIO, 50, ts(2026, 5, 20)), tx(h(10), CAMBIO, WALLET, 50.5, ts(2026, 5, 20))], "DEFI_POOL"), h(10));
const vPool = regs.find(r => r.categoria === "VENTA");
assert("swap USDC contra el pool: lo valora la pata entregada (50)",
  vPool && vPool.nota.includes("contra el pool") && vPool.importe_usdt === 50, regs);
regs = delHash(clasificar([usdc(h(11), WALLET, CAMBIO, 30, ts(2026, 5, 20)), tx(h(11), CAMBIO, VAULT, 30.1, ts(2026, 5, 20))]), h(11));
assert("lo recibido en el vault también es cambio", cats(regs) === "COMPRA,VENTA", regs);
{
  const r = { nota: "", revisar: false };
  sb.pdEfectoSalida(r, "pd_1", 0, new Map(), "PARCIAL", null, []);
  const sinCobros = r.nota;
  sb.pdEfectoSalida(r, "pd_1", 0, new Map(), "PARCIAL", 1000, []);
  assert("venta sin cobros: «Sin cobrar todavía» (y lo que falta)",
    sinCobros === "Sin cobrar todavía" && r.nota === "Sin cobrar todavía, faltan 1.000,00 USD por cobrar", [sinCobros, r.nota]);
  sb.pdEfectoSalida(r, "pd_1", 999.996, new Map([["USDC", 999.996]]), "PARCIAL", 0.004, ["20/05/2026"]);
  assert("lo que falta por debajo de un céntimo no sale como 0,00",
    r.nota === "Cobrada aparte el 20/05/2026: 1.000,00 USDC, faltan 0,004 USD por cobrar", r.nota);
}
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"]);
  const nota = vm.runInContext("NOTA_RESTO_DEVUELTO", S);
  assert("📒 Transacciones llama al resto devuelto «Resto devuelto de una compra»",
    S.txOperacion({ categoria: "MOVIMIENTO", subcategoria: "NEUTRO", nota }) === "Resto devuelto de una compra" &&
    S.txOperacion({ categoria: "MOVIMIENTO", subcategoria: "NEUTRO", nota: "traspaso interno" }) === "Movimiento neutro");
}

console.log(`\n${ok}/${ok + fallos} comprobaciones OK -> ${fallos ? fallos + " FALLOS" : "TODO VERDE"}`);
process.exit(fallos ? 1 : 0);
