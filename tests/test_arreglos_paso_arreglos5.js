/* Test de js/06-etherscan.js: si falla una serie y la otra del mismo
 * «último bloque» no, el bloque no puede avanzar con la que llegó (lo de la
 * que falló no se pediría nunca).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_arreglos_paso_arreglos5.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const WALLET = "0x" + "e1".repeat(20), VAULT = "0x" + "e2".repeat(20);

/* Etherscan inventado: {"direccion acción": [tx]}; las de `fallan` dan NOTOK. */
function sandbox(series, fallan = []) {
  const sb = { console, URLSearchParams };
  sb.fetch = async url => {
    const p = new URL(url).searchParams;
    const clave = p.get("address") + " " + p.get("action");
    let datos;
    if (fallan.includes(clave)) datos = { status: "0", message: "NOTOK", result: "Invalid API Key" };
    else {
      const txs = (series[clave] || []).filter(t => +t.blockNumber >= +p.get("startblock"));
      datos = txs.length ? { status: "1", message: "OK", result: txs }
        : { status: "0", message: "No transactions found", result: [] };
    }
    return { json: async () => datos };
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "06-etherscan.js"])
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext("log = function () {}; toast = function () {};", sb);
  return sb;
}
const tx = (bloque, h) => ({ blockNumber: String(bloque), hash: h });
function cacheVacia() {
  return { ultimo_bloque: { wallet: 0, vault: 0, wallet_internas: 0 },
    transacciones: { wallet_normales: [], wallet_tokens: [], wallet_internas: [], vault_normales: [], vault_tokens: [] } };
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

(async () => {
  console.log("== A1. Una descarga a medias no avanza el último bloque ==");
  const series = { [WALLET + " txlist"]: [tx(200, "0xn200"), tx(400, "0xn400")],
                   [WALLET + " tokentx"]: [tx(500, "0xt500")],
                   [VAULT + " tokentx"]: [tx(300, "0xv300")] };
  const cache = cacheVacia();
  cache.ultimo_bloque.wallet = 100;
  let S = sandbox(series, [WALLET + " txlist"]);
  let error = null;
  try { await S.actualizarTransacciones(cache, "k", WALLET, VAULT); } catch (e) { error = e.message; }
  assert("el paso sale con error y dice qué serie", /wallet_normales, wallet_tokens/.test(error || ""), error);
  assert("el bloque de la wallet no avanza", cache.ultimo_bloque.wallet === 100, cache.ultimo_bloque);
  assert("lo de la otra serie de la wallet no se guarda", cache.transacciones.wallet_tokens.length === 0);
  assert("las series del vault sí se guardan", cache.transacciones.vault_tokens.length === 1 && cache.ultimo_bloque.vault === 300);

  S = sandbox(series);
  const nuevas = await S.actualizarTransacciones(cache, "k", WALLET, VAULT);
  assert("la siguiente vez llega todo", nuevas.wallet_normales === 2 && nuevas.wallet_tokens === 1
    && cache.ultimo_bloque.wallet === 500, { nuevas, b: cache.ultimo_bloque });

  console.log("== Una página que falla descarta la serie; sin transacciones no es un fallo ==");
  S = sandbox({});
  const vacio = await S.actualizarTransacciones(cacheVacia(), "k", WALLET, VAULT);
  assert("sin transacciones: 0, sin error", vacio.wallet_normales === 0 && vacio.vault_tokens === 0, vacio);
  S = sandbox({}, [WALLET + " txlist"]);
  assert("descargarTransacciones da null si falla", (await S.descargarTransacciones(WALLET, "txlist", "k", 0)) === null);
  assert("etherscanGet da null si falla", (await S.etherscanGet({ address: WALLET, action: "txlist", startblock: 0 }, "k")) === null);

  console.log(`\n${ok} OK, ${fallos} fallos`);
  if (fallos) process.exit(1);
  console.log("RESULTADO: " + ok + "/" + ok + " — todo en verde");
})().catch(e => { console.error(e); process.exit(1); });
