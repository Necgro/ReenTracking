/* Test unitario del filtro «DeFi» de 📒 Transacciones
 * (Reental-SPA/js/18-transacciones.js).
 *
 * - txDatosDefi: las direcciones DeFi como las ve el motor y las
 *   transacciones que usan DeFi, también por un approve o por un
 *   intermediario; una cache rara o vacía no rompe.
 * - txEsDefi: recompensa DeFi, origen, destino o contrato DeFi, o el gas de
 *   una transacción que usa DeFi; lo demás no.
 * - txPasaFiltros / txFiltrar / txConteoCategorias: «Solo DeFi» se suma a
 *   los demás filtros y los recuentos del selector de categoría lo respetan.
 * - txDefiVigente: lo DeFi de la clasificación que se ve.
 *
 * DATOS 100% SINTÉTICOS. Ejecución: node tests/test_transacciones_paso_fase7.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {}, log: () => {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
const g = n => vm.runInContext(n, sandbox);

let ok = 0, mal = 0;
function assert(nombre, cond, detalle) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { mal++; console.log("  FALLO " + nombre + (detalle === undefined ? "" : " -> " + JSON.stringify(detalle))); }
}

const W = "0x" + "1".repeat(40), POOL = "0x" + "a".repeat(40), STAKE = "0x" + "b".repeat(40),
      OTRO = "0x" + "c".repeat(40), TOKEN = "0x" + "d".repeat(40), DOBLE = "0x" + "e".repeat(40),
      ROUTER = "0x" + "f".repeat(40);
const may = a => a.toUpperCase().replace("0X", "0x");
/* approve(spender, cantidad): selector + spender en 32 bytes + cantidad. */
const approve = spender => "0x095ea7b3" + "0".repeat(24) + spender.slice(2) + "f".repeat(64);
const cache = {
  contratos_aprendidos: {
    DEFI_POOL: { [may(POOL)]: "Pool", [DOBLE]: "Pool" }, DEFI_STAKING: { [STAKE]: "Staking" },
    DISTRIBUIDOR: { [OTRO]: "Reental" }, DEFI_FARMING: null, INFRAESTRUCTURA: { [DOBLE]: "Otra cosa" },
  },
  transacciones: { wallet_normales: [
    { hash: "0xAP1", from: W, to: TOKEN, input: approve(may(STAKE)) },          // approve al staking
    { hash: "0xap2", from: W, to: TOKEN, input: approve(OTRO) },                // approve a otro: no
    { hash: "0xap3", from: W, to: TOKEN, input: "0x095ea7b3" + "0".repeat(10) }, // input corto: no
    { hash: "0xap4", from: W, to: TOKEN, input: null },
  ] },
};
const reg = (clave, categoria, o) => Object.assign({ clave, hash: clave, categoria, subcategoria: "NEUTRO",
  fecha: "2026-03-01 10:00:00", fuente: "ONCHAIN", origen: W, destino: OTRO, contrato: TOKEN }, o || {});
const regs = [
  reg("r1", "REWARD", { subcategoria: "RCM_REWARD" }),
  reg("r2", "MOVIMIENTO", { destino: POOL }),
  reg("r3", "COMISION", { destino: may(STAKE) }),
  reg("r4", "COMPRA", { contrato: POOL, subcategoria: "COSTE_BASE", fecha: "2025-03-01 10:00:00" }),
  reg("r5", "RENDIMIENTO", { subcategoria: "RCM_REINVERTIDO" }),
  reg("r6", "COMISION", { destino: "" }),
  reg("r7", "SPAM", { origen: POOL }),
  reg("g1", "COMISION", { hash: "0xap1", destino: TOKEN }),  // gas del approve al staking
  reg("g2", "COMISION", { hash: "0xap2", destino: TOKEN }),  // gas del approve a otro
  reg("s1", "VENTA", { hash: "0xsw", destino: POOL, subcategoria: "GPP_SWAP" }),
  reg("g3", "COMISION", { hash: "0xSW", destino: ROUTER }),  // gas del swap por un router
  reg("d1", "MOVIMIENTO", { destino: DOBLE }),               // para el motor, infraestructura
];

const defi = g("txDatosDefi")(cache, regs);
assert("direcciones: las del motor (A2: la que también es infraestructura, no)",
  defi.dirs.size === 2 && defi.dirs.has(POOL) && defi.dirs.has(STAKE) && !defi.dirs.has(DOBLE), [...defi.dirs]);
assert("sin cache o con formas raras: vacío y sin romper",
  [null, undefined, {}, { contratos_aprendidos: {}, transacciones: 5 }, { transacciones: { wallet_normales: [null] } }]
    .every(c => { try { const d = g("txDatosDefi")(c, [null]); return d.dirs.size === 0 && d.hashes.size === 0; } catch (e) { return false; } }));
assert("transacciones que usan DeFi: el approve al staking y las de un registro DeFi (no las de solo gas)",
  defi.hashes.has("0xap1") && defi.hashes.has("0xsw") && defi.hashes.has("r2") &&
  !defi.hashes.has("0xap2") && !defi.hashes.has("0xap3") && !defi.hashes.has("r6"), [...defi.hashes]);

const esDefi = k => g("txEsDefi")(regs.find(r => r.clave === k), defi);
assert("recompensa, pool, staking (mayúsculas) y contrato DeFi son DeFi", ["r1", "r2", "r3", "r4"].every(esDefi));
assert("rendimiento, comisión sin destino e infraestructura no lo son", !esDefi("r5") && !esDefi("r6") && !esDefi("d1"));
assert("A1: el gas del approve a un contrato DeFi es DeFi; el de otro approve, no", esDefi("g1") && !esDefi("g2"));
assert("A3: el gas de un swap por un intermediario desconocido es DeFi", esDefi("s1") && esDefi("g3"));

const filtrar = f => g("txFiltrar")(regs, Object.assign({ ocultarSpam: true }, f)).map(r => r.clave).sort();
const sinNada = { dirs: new Set(), hashes: new Set() };
assert("«Solo DeFi»: las DeFi, sin el spam", JSON.stringify(filtrar({ defi })) === '["g1","g3","r1","r2","r3","r4","s1"]',
  filtrar({ defi }));
assert("sin el filtro: todo menos el spam", filtrar({}).length === regs.length - 1);
assert("con otro filtro (ejercicio 2025): solo r4", JSON.stringify(filtrar({ defi, ejercicio: "2025" })) === '["r4"]');
assert("«Solo DeFi» sin nada DeFi: solo las recompensas", JSON.stringify(filtrar({ defi: sinNada })) === '["r1"]');
assert("en el modo spam, el spam DeFi sale con el filtro", JSON.stringify(filtrar({ defi, categoria: "SPAM" })) === '["r7"]');

const conteo = g("txConteoCategorias")(regs, { defi, ocultarSpam: true });
const n = c => (conteo.find(x => x.categoria === c) || {}).n || 0;
assert("recuentos de categoría con «Solo DeFi»", n("COMISION") === 3 && n("RENDIMIENTO") === 0 && n("REWARD") === 1, conteo);

/* Lo DeFi es el de la clasificación que se ve, no el de la cache de ahora. */
const st = g("state"); // el `state` de js/01 (const: no es sandbox.state)
st.cache = JSON.parse(JSON.stringify(cache));
st.registros = regs;
const foto1 = g("txDefiVigente")();
st.cache.contratos_aprendidos.DEFI_POOL[ROUTER] = "Nuevo"; // se añade un contrato DeFi sin reclasificar
const foto2 = g("txDefiVigente")();
assert("A4: sin reclasificar, «Solo DeFi» sigue con lo DeFi de la clasificación", foto1 === foto2 && !foto2.dirs.has(ROUTER));
st.registros = regs.slice(); // se reclasifica
assert("A4: tras reclasificar, con la cache nueva", g("txDefiVigente")().dirs.has(ROUTER));

console.log("\nRESULTADO: " + ok + "/" + (ok + mal) + (mal ? " — HAY FALLOS" : " — todo en verde"));
process.exit(mal ? 1 : 0);
