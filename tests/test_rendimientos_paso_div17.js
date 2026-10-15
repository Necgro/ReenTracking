/* Test: la app saca los rendimientos del CSV de Reental con o sin vault.
 *
 * Bajo prueba (Reental-SPA/js/10-csv-descubrimiento.js y js/14-clasificador.js):
 * - cargarCsvRendimientos: `hashes` = los de `reinvests` más los de `claims`.
 * - regla2Rendimientos / emitirRendimientoCsv: cada RENDIMIENTO guarda integro_usdt,
 *   retencion_usdt y fecha_cobro; la retención se lee del CSV, nunca se
 *   calcula; una fila da un solo registro aunque traiga varios hashes.
 * - rendimientosSinTransferencia: fila con hash y sin transferencia descargada
 *   → sale del CSV; con vault, a revisar; sin vault, solo la nota.
 * - rendimientosSinHash: reparto pendiente (RCM_PENDIENTE, clave csv::…, hash
 *   vacío); fila sin hash con importe, a revisar; sin nada repartido, nada.
 * - Sin cambios: importe no localizado, rendimiento huérfano, reparto mixto.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_rendimientos_paso_div17.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
function nuevoSandbox() {
  const sb = { console };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js",
                   "10-csv-descubrimiento.js", "14-clasificador.js"]) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  }
  vm.runInContext("log = function () {}; toast = function () {};", sb);
  return sb;
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const WALLET = "0x" + "e1".repeat(20), VAULT = "0x" + "e2".repeat(20);
const DISTRIBUIDOR = "0x" + "d7".repeat(20);
const PROP_ES = "0x" + "c1".repeat(20), PROP_US = "0x" + "c2".repeat(20);
const USDT = vm.runInContext("USDT", nuevoSandbox());
const CABECERA = "id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date";
const h = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
const ts = (a, m, d) => String(Math.floor(Date.UTC(a, m - 1, d, 12) / 1000));
const tx = (hash, origen, destino, unidades, marca) => ({
  hash, contractAddress: USDT, from: origen, to: destino,
  value: String(Math.round(unidades * 1e6)), tokenDecimal: "6",
  tokenName: "USDT0", tokenSymbol: "USDT0", timeStamp: marca,
});
const coma = x => String(x).replace(".", ",");
const lista = hs => "[" + hs.map(x => '""' + x + '""').join(",") + "]";
function filaCsv(n, dividend, distributed, retained, reinvested, claimed, o = {}) {
  return `"${n}","${dividend}","id${n}","${WALLET}","${coma(distributed)}",` +
    `"${coma(retained)}","${coma(reinvested)}","${coma(claimed)}",` +
    `"${lista(o.claims || [])}","${lista(o.reinvests || [])}",` +
    `"${o.fecha || "2026-08-31T11:00:00.000Z"}"`;
}

/* CSV sintético → cargarCsvRendimientos → clasificación. conVault = false:
   config sin vault y sin sus series (un inversor que nunca lo puso). */
function ejecutar(filas, transfers, conVault = true) {
  const sb = nuevoSandbox();
  const cache = sb.cacheVacia();
  for (const [addr, nombre] of [[PROP_ES, "Prueba ES"], [PROP_US, "Prueba US"]]) {
    cache.catalogo_propiedades[addr] = { nombre_reental: nombre,
      nombre_etherscan: nombre.toUpperCase(), simbolo: "P", estado: "CONFIRMADA" };
  }
  cache.contratos_aprendidos.DISTRIBUIDOR[DISTRIBUIDOR] = "Distribuidor";
  cache.transacciones.wallet_tokens = transfers.filter(t => [t.from, t.to].includes(WALLET));
  cache.transacciones.vault_tokens = conVault
    ? transfers.filter(t => [t.from, t.to].includes(VAULT)) : [];
  sb.__cache = cache;
  sb.__config = { wallet: WALLET, vault: conVault ? VAULT : "",
                  compra_bancaria_coste_eur_por_token: 100.0 };
  sb.__csv = [CABECERA, ...filas].join("\n") + "\n";
  vm.runInContext(`
    state.config = __config;
    __r = cargarCsvRendimientos(__csv);
    __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});
  `, sb);
  return { filas: sb.__r.filas, indice: sb.__r.indicePorHash, regs: sb.__regs };
}
const rendimientos = regs => regs.filter(r => r.categoria === "RENDIMIENTO");

// =========================================================================
console.log("== 1. El CSV: claims junto a reinvests ==");
// =========================================================================
{
  const { filas, indice } = ejecutar([
    filaCsv(1, "Prueba ES #8/2026", 10, 1.9, 0, 8.1, { claims: [h(1)] }),
    filaCsv(2, "Prueba US #8/2026", 5, 0, 5, 0, { reinvests: [h(2)] }),
    filaCsv(3, "Prueba US #7/2026", 6, 0, 3, 3, { reinvests: [h(3)], claims: [h(3), h(4)] }),
  ], []);
  assert("el hash del reclamo está en hashes", JSON.stringify(filas[0].hashes) === JSON.stringify([h(1)]), filas[0].hashes);
  assert("el de la reinversión, también", JSON.stringify(filas[1].hashes) === JSON.stringify([h(2)]));
  assert("reinvests primero, claims después y sin repetir", JSON.stringify(filas[2].hashes) === JSON.stringify([h(3), h(4)]), filas[2].hashes);
  assert("el índice por hash incluye los reclamos", !!indice[h(1)] && !!indice[h(4)]);
  assert("importe = reinvertido + reclamado (el neto)", filas[0].importe === 8.1);
}

// =========================================================================
console.log("== 2. Reinvertido y reclamado con su transferencia ==");
// =========================================================================
{
  const { regs } = ejecutar([
    filaCsv(1, "Prueba US #8/2026", 5, 0, 5, 0, { reinvests: [h(1)] }),
    filaCsv(2, "Prueba ES #8/2026", 10, 1.9, 0, 8.1, { claims: [h(2)] }),
    filaCsv(3, "Prueba US #7/2026", 4, 0, 0, 4, { claims: [h(3)], fecha: "2026-07-31T11:00:00.000Z" }),
  ], [tx(h(1), DISTRIBUIDOR, VAULT, 5, ts(2026, 9, 1)),
      tx(h(2), DISTRIBUIDOR, WALLET, 8.1, ts(2026, 9, 29)),
      tx(h(3), DISTRIBUIDOR, WALLET, 4, ts(2026, 9, 29))]);
  const d = rendimientos(regs);
  const reinv = d.find(r => r.hash === h(1)), recl = d.find(r => r.hash === h(2)), sinRet = d.find(r => r.hash === h(3));
  assert("tres rendimientos y ningún otro registro", d.length === 3 && regs.length === 3, regs.map(r => r.categoria));
  assert("reinvertido: RCM_REINVERTIDO, bruto = distributed, retención 0",
    reinv.subcategoria === "RCM_REINVERTIDO" && reinv.integro_usdt === 5 && reinv.retencion_usdt === 0 && !reinv.revisar);
  assert("reclamado: RCM_RECLAMADO con el contrato del inmueble", recl.subcategoria === "RCM_RECLAMADO" && recl.contrato === PROP_ES, recl);
  assert("reclamado: importe = el neto que llega; bruto y retención del CSV",
    recl.importe_usdt === 8.1 && recl.integro_usdt === 10 && recl.retencion_usdt === 1.9, recl);
  assert("reclamado: sin 19 % supuesto (retención 0 si el CSV dice 0)",
    sinRet.subcategoria === "RCM_RECLAMADO" && sinRet.retencion_usdt === 0 && sinRet.integro_usdt === 4);
  assert("fecha = la del reparto; fecha_cobro = la de la transferencia (en hora española, HORA-1)",
    recl.fecha === "2026-08-31 13:00:00" && recl.fecha_cobro === "2026-09-29 14:00:00", [recl.fecha, recl.fecha_cobro]);
  assert("origen y destino, los de la transferencia", recl.origen === DISTRIBUIDOR && recl.destino === WALLET);
  assert("casan: ninguno a revisar y sin nota", d.every(r => !r.revisar && r.nota === ""));
}

// =========================================================================
console.log("== 3. Sin vault: los rendimientos salen del CSV ==");
// =========================================================================
{
  const filas = [
    filaCsv(1, "Prueba US #8/2026", 5, 0, 5, 0, { reinvests: [h(1)] }),
    filaCsv(2, "Prueba US #7/2026", 6, 0, 6, 0, { reinvests: [h(1)], fecha: "2026-07-31T11:00:00.000Z" }),
    filaCsv(3, "Prueba ES #8/2026", 10, 1.9, 0, 8.1, { claims: [h(2)] }),
  ];
  const transfers = [tx(h(1), DISTRIBUIDOR, VAULT, 5, ts(2026, 9, 1)),
                     tx(h(1), DISTRIBUIDOR, VAULT, 6, ts(2026, 9, 1)),
                     tx(h(2), DISTRIBUIDOR, WALLET, 8.1, ts(2026, 9, 29))];
  const con = rendimientos(ejecutar(filas, transfers, true).regs);
  const sin = rendimientos(ejecutar(filas, transfers, false).regs);
  assert("sin vault salen los 3 rendimientos", sin.length === 3, sin.length);
  const clave = r => [r.clave, r.fecha, r.subcategoria, r.importe_usdt, r.integro_usdt, r.retencion_usdt].join("|");
  assert("los mismos que con vault (clave, fecha, tipo, importes)",
    JSON.stringify(con.map(clave).sort()) === JSON.stringify(sin.map(clave).sort()));
  const reinv = sin.filter(r => r.hash === h(1));
  assert("varias filas con un solo hash: un registro por fila", reinv.length === 2 && reinv[0].clave !== reinv[1].clave);
  assert("sin vault: sin revisar y con la nota de que no hay contraste",
    reinv.every(r => !r.revisar && r.nota ===
      "sin transferencia descargada para este hash: importe tomado del archivo de Reental (sin vault no hay con qué contrastarlo)"),
    reinv.map(r => r.nota));
  assert("sin transferencia: sin origen, destino ni fecha_cobro",
    reinv.every(r => r.origen === "" && r.destino === "" && r.fecha_cobro === null));
  assert("el reclamo, con su transferencia a la wallet, casa igual sin vault",
    sin.find(r => r.hash === h(2)).nota === "" && sin.find(r => r.hash === h(2)).fecha_cobro !== null);
}

// =========================================================================
console.log("== 4. Con vault, el vault es el contraste ==");
// =========================================================================
{
  const { regs } = ejecutar([
    filaCsv(1, "Prueba US #8/2026", 5, 0, 5, 0, { reinvests: [h(1)] }),
    filaCsv(2, "Prueba ES #8/2026", 10, 1.9, 0, 8.1, { claims: [h(2)] }),
  ], [], true);
  const d = rendimientos(regs);
  assert("falta la transferencia con vault: sale igual, a revisar", d.length === 2 && d.every(r => r.revisar));
  assert("con la nota que dice qué comprobar", d.every(r => r.nota ===
    "sin transferencia descargada para este hash: importe tomado del archivo de Reental; con el vault configurado la transferencia debería estar descargada: comprobar el hash en Polygonscan o volver a descargar (puede que el archivo de Reental sea más nuevo que la cache)"));
  const recl = d.find(r => r.hash === h(2));
  assert("y con su bruto y su retención", recl.integro_usdt === 10 && recl.retencion_usdt === 1.9);
}
{
  // Hash con una transferencia de otro importe: a revisar
  // (también sin vault) y la transferencia sigue su camino.
  for (const conVault of [true, false]) {
    const { regs } = ejecutar(
      [filaCsv(1, "Prueba ES #8/2026", 10, 1.9, 0, 8.1, { claims: [h(1)] })],
      [tx(h(1), DISTRIBUIDOR, WALLET, 7, ts(2026, 9, 29))], conVault);
    const d = rendimientos(regs);
    assert("importe no localizado, " + (conVault ? "con" : "sin") + " vault: a revisar con la nota de siempre",
      d.length === 1 && d[0].revisar && d[0].nota === "importe del archivo de Reental no localizado en los transfers del hash" && regs.length === 2,
      regs.map(r => [r.categoria, r.nota]));
  }
}
{
  // Rendimiento huérfano (transferencia del distribuidor al vault sin fila).
  const { regs } = ejecutar(
    [filaCsv(1, "Prueba US #8/2026", 5, 0, 5, 0, { reinvests: [h(1)] })],
    [tx(h(1), DISTRIBUIDOR, VAULT, 5, ts(2026, 9, 1)), tx(h(9), DISTRIBUIDOR, VAULT, 3, ts(2026, 9, 2))]);
  const huerfano = regs.find(r => r.hash === h(9));
  assert("rendimiento huérfano: como antes (RCM_REINVERTIDO, a revisar, sin bruto del CSV)",
    huerfano.categoria === "RENDIMIENTO" && huerfano.revisar && huerfano.fuente === "ONCHAIN" && !("integro_usdt" in huerfano), huerfano);
}

// =========================================================================
console.log("== 5. Una fila, un solo registro ==");
// =========================================================================
{
  const { regs } = ejecutar(
    [filaCsv(1, "Prueba ES #8/2026", 10, 1.9, 0, 8.1, { claims: [h(1), h(2)] })],
    [tx(h(1), DISTRIBUIDOR, WALLET, 4, ts(2026, 9, 28)), tx(h(2), DISTRIBUIDOR, WALLET, 4.1, ts(2026, 9, 29))]);
  const d = rendimientos(regs);
  assert("fila con dos hashes: un solo RENDIMIENTO, en el primero", d.length === 1 && d[0].hash === h(1), d.map(r => r.hash));
  assert("a revisar, con la nota de los varios hashes", d[0].revisar && d[0].nota ===
    "importe del archivo de Reental no localizado en los transfers del hash; la fila 2 del archivo de Reental trae 2 hashes (reinvertida o reclamada en varias veces): un solo registro, comprobar las transferencias de los demás hashes", d[0].nota);
}
{
  const { regs } = ejecutar(
    [filaCsv(1, "Prueba US #8/2026", 6, 0, 3, 3, { reinvests: [h(1)], claims: [h(2)] })], [], false);
  const d = rendimientos(regs);
  assert("reparto mixto: RCM_MIXTO, a revisar, un solo registro",
    d.length === 1 && d[0].subcategoria === "RCM_MIXTO" && d[0].revisar && d[0].nota.endsWith("rendimiento mixto reinvertido/reclamado"), d);
}

// =========================================================================
console.log("== 6. Filas sin hash (repartos pendientes) ==");
// =========================================================================
for (const conVault of [false, true]) {
  const { regs } = ejecutar([
    filaCsv(1, "Prueba ES #8/2026", 10, 0, 0, 0),
    filaCsv(2, "Prueba ES #8/2026", 10, 0, 0, 0),
    filaCsv(3, "Prueba US #8/2026 (1)", 4, 0, 0, 0, { fecha: "2026-09-05T11:00:00.000Z" }),
    filaCsv(4, "Otra Cosa #8/2026", 2, 0, 0, 0),
    filaCsv(5, "Prueba US #6/2026", 0, 0, 0, 0),
    filaCsv(6, "Prueba US #5/2026", 5, 0, 5, 0),
    filaCsv(7, "Prueba ES #5/2026", 10, 1.9, 0, 8.1),
  ], [], conVault);
  const d = rendimientos(regs);
  const et = conVault ? " (con vault)" : " (sin vault)";
  const p = d.find(r => r.clave === "csv::prueba es #8/2026::2026-08-31");
  assert("pendiente: RCM_PENDIENTE, clave csv::…, hash vacío, sin revisar" + et,
    !!p && p.subcategoria === "RCM_PENDIENTE" && p.hash === "" && !p.revisar &&
    p.nota === "rendimiento pendiente (ni reclamado ni reinvertido): sin hash, datos tomados del archivo de Reental", p);
  assert("bruto = distributed, retención 0, importe 0, en la fecha del reparto" + et,
    p.integro_usdt === 10 && p.retencion_usdt === 0 && p.importe_usdt === 0 && p.fecha === "2026-08-31 13:00:00" && p.fecha_cobro === null);
  assert("fila repetida: segunda clave con ::2" + et, d.some(r => r.clave === "csv::prueba es #8/2026::2026-08-31::2"));
  assert("la clave lleva el periodo entero y su fecha" + et, d.some(r => r.clave === "csv::prueba us #8/2026 (1)::2026-09-05"));
  assert("inmueble fuera del catálogo: contrato USDT" + et, d.find(r => r.inmueble === "Otra Cosa").contrato === USDT);
  assert("sin nada repartido: ningún registro" + et, !d.some(r => r.periodo_fiscal === "Prueba US #6/2026"));
  const movida = d.find(r => r.periodo_fiscal === "Prueba US #5/2026");
  const reclamo = d.find(r => r.periodo_fiscal === "Prueba ES #5/2026");
  assert("con importe y sin hash: sale igual, a revisar" + et,
    movida.subcategoria === "RCM_REINVERTIDO" && movida.revisar &&
    movida.nota === "fila del archivo de Reental con importe y sin ningún hash: comprobar en Reental donde fue ese dinero", movida);
  assert("reclamo sin hash: a revisar, con su retención" + et,
    reclamo.subcategoria === "RCM_RECLAMADO" && reclamo.revisar && reclamo.retencion_usdt === 1.9 && reclamo.integro_usdt === 10);
  assert("seis rendimientos en total" + et, d.length === 6, d.length);
}

// =========================================================================
console.log("== 7. Nunca dos registros por fila ==");
// =========================================================================
{
  const filas = [
    filaCsv(1, "Prueba US #8/2026", 5, 0, 5, 0, { reinvests: [h(1)] }),
    filaCsv(2, "Prueba ES #8/2026", 10, 1.9, 0, 8.1, { claims: [h(2), h(3)] }),
    filaCsv(3, "Prueba ES #7/2026", 10, 0, 0, 0),
  ];
  const transfers = [tx(h(1), DISTRIBUIDOR, VAULT, 5, ts(2026, 9, 1)),
                     tx(h(3), DISTRIBUIDOR, WALLET, 8.1, ts(2026, 9, 29))];
  for (const conVault of [true, false]) {
    const d = rendimientos(ejecutar(filas, transfers, conVault).regs);
    assert("tres filas, tres rendimientos " + (conVault ? "con" : "sin") + " vault", d.length === 3, d.map(r => r.clave));
  }
}

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
