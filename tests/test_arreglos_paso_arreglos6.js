/* Tests de los arreglos de la zona «rendimientos» (archivo de Reental →
 * registros RENDIMIENTO).
 *
 * - Lectura del archivo: columnas que
 *   faltan, cabecera en mayúsculas o con BOM, separado por «;», no UTF-8,
 *   solo la cabecera, importes con punto de miles o con texto, listas de
 *   hashes mal escritas, fechas sin zona o que no existen, comillas en medio
 *   de un campo, filas vacías y valores vacíos de la blockchain.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz):
 *   TZ=Europe/Madrid node tests/test_arreglos_paso_arreglos6.js
 * (la zona horaria se fija aquí también, para que una fecha sin zona no
 * dependa del ordenador).
 */
"use strict";
process.env.TZ = "Europe/Madrid";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
function nuevoSandbox(extra = []) {
  const sb = { console };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js",
                   "10-csv-descubrimiento.js", "14-clasificador.js", ...extra]) {
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
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const WALLET = "0x" + "e1".repeat(20), VAULT = "0x" + "e2".repeat(20);
const DISTRIBUIDOR = "0x" + "d7".repeat(20);
const PROP_ES = "0x" + "c1".repeat(20), PROP_US = "0x" + "c2".repeat(20);
const SB = nuevoSandbox();
const USDT = vm.runInContext("USDT", SB);
const CABECERA = "id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date";
const h = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
const ts = (a, m, d) => String(Math.floor(Date.UTC(a, m - 1, d, 12) / 1000));
const tx = (hash, origen, destino, unidades, marca) => ({
  hash, contractAddress: USDT, from: origen, to: destino,
  value: String(Math.round(unidades * 1e6)), tokenDecimal: "6",
  tokenName: "USDT0", tokenSymbol: "USDT0", timeStamp: marca,
});
const coma = x => typeof x === "string" ? x : String(x).replace(".", ",");
const lista = hs => "[" + hs.map(x => '""' + x + '""').join(",") + "]";
function filaCsv(n, dividend, distributed, retained, reinvested, claimed, o = {}) {
  return `"${n}","${dividend}","id${n}","${o.wallet || WALLET}","${coma(distributed)}",` +
    `"${coma(retained)}","${coma(reinvested)}","${coma(claimed)}",` +
    `"${lista(o.claims || [])}","${lista(o.reinvests || [])}",` +
    `"${o.fecha !== undefined ? o.fecha : "2026-08-31T11:00:00.000Z"}"`;
}
const leer = (filas, cab = CABECERA) => SB.cargarCsvRendimientos([cab, ...filas].join("\n") + "\n");

function cacheSintetica(sb, transfers, conVault = true) {
  const cache = sb.cacheVacia();
  for (const [addr, nombre] of [[PROP_ES, "Prueba ES"], [PROP_US, "Prueba US"]]) {
    cache.catalogo_propiedades[addr] = { nombre_reental: nombre,
      nombre_etherscan: nombre.toUpperCase(), simbolo: "P", estado: "CONFIRMADA" };
  }
  cache.contratos_aprendidos.DISTRIBUIDOR[DISTRIBUIDOR] = "Distribuidor";
  cache.transacciones.wallet_tokens = transfers.filter(t => [t.from, t.to].includes(WALLET));
  cache.transacciones.vault_tokens = conVault ? transfers.filter(t => [t.from, t.to].includes(VAULT)) : [];
  return cache;
}
function clasificar(filas, transfers, conVault = true, cache = null) {
  const sb = nuevoSandbox();
  sb.__cache = cache || cacheSintetica(sb, transfers, conVault);
  sb.__config = { wallet: WALLET, vault: conVault ? VAULT : "", compra_bancaria_coste_eur_por_token: 100.0 };
  sb.__csv = [CABECERA, ...filas].join("\n") + "\n";
  vm.runInContext(`
    state.config = __config;
    __r = cargarCsvRendimientos(__csv);
    __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});
  `, sb);
  return sb.__regs;
}
const rendimientos = regs => regs.filter(r => r.categoria === "RENDIMIENTO");

// =========================================================================
console.log("== Lectura del archivo (A5, A9, A10, A11, A15, A16) ==");
// =========================================================================
{
  const cab = "﻿" + CABECERA.split(",").map(c => c.toUpperCase()).join(", ");
  const r = leer([filaCsv(1, "Prueba ES #8/2026", 10, 1.9, 0, 8.1, { claims: [h(1)] })], cab);
  assert("cabecera en mayúsculas, con espacios y BOM", !r.error && r.filas[0].periodo_fiscal === "Prueba ES #8/2026" &&
    r.filas[0].distributed === 10 && r.filas[0].retained === 1.9, r);

  const r2 = SB.cargarCsvRendimientos("﻿dividend,date,reinvested,claimed,distributed,retained,reinvests\n" +
    '"Prueba ES #8/2026","2026-08-31T11:00:00Z","0","0","5","0","[]"\n');
  assert("BOM con dividend de primera columna", r2.filas[0].inmueble === "Prueba ES", r2);

  for (const quitar of ["distributed", "retained", "reinvests", "date"]) {
    const c = CABECERA.split(",").map(x => x === quitar ? "otra" : x).join(",");
    const e = SB.cargarCsvRendimientos(c + "\n").error || "";
    assert("falta la columna " + quitar + " → error", e.includes(quitar), e);
  }
  const e = SB.cargarCsvRendimientos(CABECERA.replace(/,/g, ";") + "\n").error || "";
  assert("separado por «;» → error que lo dice", e.includes("separado por comas") && e.includes("distributed"), e);

  const r3 = SB.cargarCsvRendimientos("dividend,date,reinvested,claimed,distributed,retained,reinvests\n" +
    '"Prueba ES #8/2026","2026-08-31T11:00:00Z","5","0","5","0","[]"\n');
  assert("claims y wallet pueden faltar", !r3.error && r3.filas[0].wallet === "", r3);

  assert("vacío → error", (SB.cargarCsvRendimientos("").error || "").includes("vacío"));
  assert("no UTF-8 → error", (SB.cargarCsvRendimientos(CABECERA + '\n"1","M�laga #1/2026"\n').error || "").includes("UTF-8"));
  const r4 = SB.cargarCsvRendimientos(CABECERA + "\n");
  assert("solo la cabecera da 0 filas", !r4.error && r4.filas.length === 0, r4);
}
{
  const c = SB.comaADecimal;
  assert("importes buenos", c("1.234,56") === 1234.56 && c("9,5") === 9.5 && c("9") === 9 && c("1.8") === 1.8 && c("") === 0);
  const malos = ["10 USDT", "NaN", "inf", "1 000,5", "-3", "1.234.567", "abc"];
  assert("importes que no se entienden → null", malos.every(m => c(m) === null), malos.map(c));
  const e = leer([filaCsv(1, "Prueba ES #8/2026", "NaN", 0, 0, 0)]).error || "";
  assert("NaN en el archivo → error con fila y columna", e.includes("fila 2, distributed «NaN»"), e);
  assert("punto de miles con coma", leer([filaCsv(1, "Prueba ES #8/2026", "1.234,56", 0, 0, 0)]).filas[0].distributed === 1234.56);
}
{
  const p = SB.parsearReinvests;
  assert("lista con comillas dobles o simples", igual(p('["' + h(1) + '"]'), [h(1)]) && igual(p("['" + h(1) + "']"), [h(1)]));
  assert("hash suelto, sin comillas o sin 0x", igual(p(h(1)), [h(1)]) && igual(p("[" + h(1) + "]"), [h(1)]) &&
    igual(p('["' + h(1).slice(2) + '"]'), [h(1)]));
  assert("repetido una vez; mayúsculas", igual(p('["' + h(1) + '","' + h(1) + '"]'), [h(1)]) &&
    igual(p('["' + h(1).toUpperCase() + '", "' + h(2) + '"]'), [h(1), h(2)]));
  assert("vacía", igual(p("[]"), []) && igual(p(""), []));
  const malos = ['["abc"]', '["' + h(1).slice(0, -2) + '"]', '{"' + h(1) + '"}', '["' + h(1) + '"x'];
  assert("listas mal escritas → null", malos.every(m => p(m) === null), malos.map(p));
  const e = leer([filaCsv(1, "Prueba ES #8/2026", 5, 0, 5, 0).replace('"[]","2026', '"[""0x12""]","2026')]).error || "";
  assert("lista mal escrita en el archivo → error", e.includes("reinvests"), e);
}
{
  const fmt = vm.runInContext("fmtFechaHora", SB);
  const f = x => fmt(SB.aUtcNaive(x));
  assert("sin zona = UTC (también con el navegador en Madrid)", f("2026-01-01T00:30:00") === "2026-01-01 00:30:00" &&
    f("2026-01-01 00:30:00") === "2026-01-01 00:30:00", [f("2026-01-01T00:30:00"), f("2026-01-01 00:30:00")]);
  assert("con Z y con desfase", f("2026-01-01T00:30:00.000Z") === "2026-01-01 00:30:00" &&
    f("2026-01-01T00:30:00+01:00") === "2025-12-31 23:30:00");
  assert("solo el día y timestamp", f("2026-08-31") === "2026-08-31 00:00:00" && f(ts(2026, 8, 31)) === "2026-08-31 12:00:00");
  const malos = ["01/02/2026", "2026-02-30T10:00:00Z", "2026-01-01T24:00:00", "2026-W01-1", ts(2026, 8, 31) + "000"];
  assert("lo que no es una fecha → null", malos.every(m => SB.aUtcNaive(m) === null), malos.map(m => SB.aUtcNaive(m)));
  const e = leer([filaCsv(1, "Prueba ES #8/2026", 5, 0, 5, 0, { fecha: "31/08/2026" })]).error || "";
  assert("fecha que no se entiende → error con fila", e.includes("fila 2, date «31/08/2026»"), e);
  const [r] = rendimientos(clasificar([filaCsv(1, "Prueba ES #8/2026", 5, 0, 0, 0, { fecha: "" })], []));
  assert("fila sin fecha → a revisar", r.revisar && r.nota.includes("no trae la fecha del reparto"), r);
}
{
  const r = leer([",,,,,,,,,,", "", filaCsv(1, "Prueba ES #8/2026", 5, 0, 5, 0, { reinvests: [h(1), h(2)] })]);
  assert("filas vacías no cuentan en el nº de fila", r.filas.length === 1 && r.filas[0].linea_csv === 2, r.filas);
  const r2 = SB.cargarCsvRendimientos("dividend,date,reinvested,claimed,distributed,retained,reinvests\n" +
    'Madrid 10 #9/2025 "bis",2026-08-31T11:00:00Z,0,0,5,0,[]\n');
  assert("comilla en medio de un campo: se conserva", r2.filas[0].periodo_fiscal === 'Madrid 10 #9/2025 "bis"', r2.filas[0]);
  const u = SB.enteroAUnidades;
  assert("valor de la blockchain vacío o raro → null", ["", " ", "0x10", "1_000", "1.5"].every(v => u(v, 6) === null) &&
    u(" 1000000 ", 6) === 1);
}
{
  // Un archivo con solo la cabecera no sustituye al bueno.
  const sb = nuevoSandbox(["12-carga-archivos.js"]);
  const avisos = [];
  sb.toast = (m, t) => avisos.push([m, t]);
  sb.document = { getElementById: () => ({ innerHTML: "" }) };
  sb.actualizarChipEstado = () => {};
  sb.__bueno = [CABECERA, filaCsv(1, "Prueba ES #8/2026", 5, 0, 5, 0)].join("\n");
  sb.__vacio = CABECERA + "\n";
  vm.runInContext("__a = aplicarCsvTexto(__bueno, false); __b = aplicarCsvTexto(__vacio, false); __n = state.filasCsv.length;", sb);
  assert("solo la cabecera → error y se queda el anterior", sb.__a === true && sb.__b === false && sb.__n === 1 &&
    avisos[1][1] === "error" && avisos[1][0].includes("ningún reparto"), avisos);
}

// =========================================================================
console.log("== Claves estables (A2, A3, A4) ==");
// =========================================================================
{
  const C6 = "csv::prueba es #6/2026::2026-07-31", C7 = "csv::prueba es #7/2026::2026-08-31";
  const filas = (h6, h7) => [
    filaCsv(1, "Prueba ES #6/2026", 3, 0, h6 ? 3 : 0, 0, { reinvests: h6 ? [h6] : [], fecha: "2026-07-31T11:00:00.000Z" }),
    filaCsv(2, "Prueba ES #7/2026", 4, 0, h7 ? 4 : 0, 0, { reinvests: h7 ? [h7] : [] })];
  const conAjuste = (fs_, transfers, extra) => {
    const sb = nuevoSandbox();
    const cache = cacheSintetica(sb, transfers);
    if (extra) extra(cache);
    cache.ajustes_usuario = { [C7]: { categoria: "MOVIMIENTO", subcategoria: "NEUTRO" } };
    const regs = clasificar(fs_, transfers, true, cache);
    return Object.fromEntries(regs.filter(r => r.clave.startsWith("csv::")).map(r => [r.clave, r]));
  };
  const dos = [tx(h(1), DISTRIBUIDOR, VAULT, 3, ts(2026, 9, 1)), tx(h(1), DISTRIBUIDOR, VAULT, 4, ts(2026, 9, 1))];
  for (const [nombre, fs_] of [["en su orden", filas(h(1), h(1))], ["al revés", filas(h(1), h(1)).reverse()]]) {
    const r = conAjuste(fs_, dos);
    assert("filas " + nombre + ": el ajuste sigue en #7", r[C7].categoria === "MOVIMIENTO" &&
      r[C6].categoria === "RENDIMIENTO" && r[C6].hash === h(1), Object.keys(r));
  }
  const antes = conAjuste(filas(h(1), null), [dos[0]]), despues = conAjuste(filas(h(1), h(1)), dos);
  assert("pendiente que luego se reinvierte: la misma clave y el ajuste sigue",
    antes[C7].categoria === "MOVIMIENTO" && despues[C7].categoria === "MOVIMIENTO" &&
    antes[C7].hash === "" && despues[C7].hash === h(1));
  const r = conAjuste(filas(null, h(1)), [dos[1]], cache => {
    cache.catalogo_propiedades["0x" + "c3".repeat(20)] = { nombre_reental: "Prueba ES",
      nombre_etherscan: "PRUEBA ES 2", simbolo: "P", estado: "CONFIRMADA" };
  });
  assert("dos contratos con el mismo nombre: el ajuste sigue", r[C7].categoria === "MOVIMIENTO");
  const claves = rendimientos(clasificar([filaCsv(1, "Prueba ES #6/2026", 3, 0, 0, 0),
    filaCsv(2, "Prueba ES #6/2026", 3, 0, 0, 0)], [])).map(x => x.clave).sort();
  assert("filas repetidas: ::2 por el orden del archivo", igual(claves,
    ["csv::prueba es #6/2026::2026-08-31", "csv::prueba es #6/2026::2026-08-31::2"]), claves);
  const por = Object.fromEntries(rendimientos(clasificar([filaCsv(1, "Prueba ES #6/2026", 3, 0, 0, 0),
    filaCsv(2, "Prueba ES #6/2026", 3, 0, 3, 0, { reinvests: [h(1)] })],
    [tx(h(1), DISTRIBUIDOR, VAULT, 3, ts(2026, 9, 1))])).map(x => [x.clave, x]));
  assert("una con hash se emite antes, pero el ::2 sigue el orden del archivo",
    por["csv::prueba es #6/2026::2026-08-31"].subcategoria === "RCM_PENDIENTE" &&
    por["csv::prueba es #6/2026::2026-08-31::2"].hash === h(1), Object.keys(por));
}

// =========================================================================
console.log("== Pendiente ya cobrado (A1) ==");
// =========================================================================
{
  const NOTA = vm.runInContext("NOTA_PENDIENTE_COBRADO", SB);
  const regs = clasificar([filaCsv(1, "Prueba ES #8/2026", 10, 0, 0, 0)],
    [tx(h(1), DISTRIBUIDOR, VAULT, 10, ts(2026, 9, 5))]);
  const [p] = rendimientos(regs), c = regs.find(r => r.hash === h(1));
  assert("casa por importe: un solo rendimiento, el pendiente", rendimientos(regs).length === 1 &&
    p.subcategoria === "RCM_PENDIENTE" && p.nota.includes("ya cobrado el 2026-09-05"), p);
  assert("el cobro pasa a REVISAR con su nota", c.categoria === "REVISAR" && c.revisar && c.nota.includes(NOTA), c);
  const sb = nuevoSandbox(["19-arranque.js"]);
  const dc = sb.arrDescuadres(regs);
  assert("Puesta en marcha lo cuenta como «no está en el archivo»", dc.sinArchivo === 1 && dc.csvMasNuevo === 0, dc);

  const r2 = clasificar([filaCsv(1, "Prueba ES #8/2026", 10, 0, 0, 0)],
    [tx(h(1), DISTRIBUIDOR, WALLET, 8.1, ts(2026, 9, 5))]);
  const p2 = r2.find(r => r.subcategoria === "RCM_PENDIENTE"), hu = r2.find(r => r.hash === h(1));
  assert("no casa por importe: los dos a revisar", p2.revisar && hu.revisar &&
    p2.nota.includes("puede que ya este cobrado") && hu.nota.includes(NOTA), [p2.nota, hu.nota]);

  const r3 = clasificar([filaCsv(1, "Prueba ES #8/2026", 10, 0, 0, 0)],
    [tx(h(1), DISTRIBUIDOR, VAULT, 10, ts(2026, 8, 1))]);
  assert("un cobro anterior al reparto no se cruza", !r3.find(r => r.subcategoria === "RCM_PENDIENTE").revisar &&
    r3.find(r => r.hash === h(1)).categoria === "RENDIMIENTO");
}

// =========================================================================
console.log("== Orden con tildes (A18) ==");
// =========================================================================
{
  const regs = clasificar([filaCsv(1, "Carballo 1 #12/2025", 3, 0, 0, 0), filaCsv(2, "Cáceres 8 #12/2025", 3, 0, 0, 0)], []);
  const orden = rendimientos(regs).map(r => r.periodo_fiscal);
  assert("«carballo» antes que «cáceres», letra a letra", igual(orden, ["Carballo 1 #12/2025", "Cáceres 8 #12/2025"]), orden);
}

// =========================================================================
console.log("== Distribuidor aprendido por la wallet (A6) ==");
// =========================================================================
{
  const otro = "0x" + "d8".repeat(20);
  const correr = (importe) => {
    const sb = nuevoSandbox();
    const cache = cacheSintetica(sb, [tx(h(1), otro, WALLET, importe, ts(2026, 8, 5)),
                                      tx(h(2), otro, WALLET, 6, ts(2026, 9, 5))], false);
    sb.__cache = cache;
    sb.__config = { wallet: WALLET, vault: "", compra_bancaria_coste_eur_por_token: 100.0 };
    sb.__csv = [CABECERA, filaCsv(1, "Prueba US #7/2026", 4, 0, 0, 4, { claims: [h(1)] })].join("\n") + "\n";
    vm.runInContext(`
      state.config = __config;
      __r = cargarCsvRendimientos(__csv);
      descubrimientoDinamico(__cache, __r.filas, __r.indicePorHash, __config.wallet, "");
      __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});
    `, sb);
    return { cache, regs: sb.__regs };
  };
  const { cache, regs } = correr(4);
  const nuevo = regs.find(r => r.hash === h(2));
  assert("sin vault: quien paga el reclamo a la wallet es distribuidor", otro in cache.contratos_aprendidos.DISTRIBUIDOR);
  assert("y su siguiente pago sin fila sale como rendimiento a revisar", nuevo.categoria === "RENDIMIENTO" &&
    nuevo.subcategoria === "RCM_RECLAMADO" && nuevo.revisar, nuevo);
  assert("un importe que no es lo reclamado no se aprende", !(otro in correr(3).cache.contratos_aprendidos.DISTRIBUIDOR));
}

// =========================================================================
console.log("== Fila de otra wallet (A12) ==");
// =========================================================================
{
  const otra = "0x" + "aa".repeat(20);
  const regs = rendimientos(clasificar([filaCsv(1, "Prueba ES #8/2026", 10, 0, 0, 0, { wallet: otra }),
                                        filaCsv(2, "Prueba ES #7/2026", 10, 0, 0, 0)], [], false));
  const ajena = regs.find(r => r.periodo_fiscal === "Prueba ES #8/2026"), propia = regs.find(r => r !== ajena);
  assert("la de otra wallet, a revisar y dice cuál", ajena.revisar && ajena.nota.includes("fila de otra wallet (" + otra + ")"), ajena);
  assert("la tuya, no", !propia.revisar, propia);
}

// =========================================================================
console.log("== Vault quitado con sus movimientos en la cache (A13) ==");
// =========================================================================
{
  const sb = nuevoSandbox(["19-arranque.js"]);
  const lineas = d => sb.arrResumen(Object.assign({ cacheOk: true, vaultConfigurado: false }, d)).lineas;
  const con = lineas({ vaultEnCache: true }), sin = lineas({ vaultEnCache: false });
  assert("con movimientos del vault en la cache: aviso y tus datos", con.some(l => l.tipo === "warn" &&
    l.texto.includes("vault que ya no está en tus datos") && l.accion.ir === "arrDatos"), con);
  assert("sin ellos: la nota de siempre", sin.some(l => l.tipo === "info" && l.texto.startsWith("Sin vault")) &&
    !sin.some(l => l.texto.includes("ya no está")), sin);
}

// =========================================================================
console.log("== Panel: tus decisiones y el íntegro (A14) ==");
// =========================================================================
{
  const sb = nuevoSandbox(["15-correcciones.js", "16-dashboard.js"]);
  const filas = [filaCsv(1, "Prueba ES #8/2026", 10, 0, 0, 0), filaCsv(2, "Prueba ES #7/2026", 10, 0, 0, 0)];
  const csv = sb.cargarCsvRendimientos([CABECERA, ...filas].join("\n") + "\n");
  const cache = cacheSintetica(sb, []);
  cache.ajustes_usuario = { "csv::prueba es #8/2026::2026-08-31": { categoria: "MOVIMIENTO", subcategoria: "NEUTRO" },
                            "csv::prueba es #7/2026::2026-08-31": { integro_usdt: 12 } };
  const regs = clasificar(filas, [], true, cache);
  const sinRegs = sb.dashRendimientosResumen(csv.filas), conRegs = sb.dashRendimientosResumen(csv.filas, regs);
  assert("sin clasificar: el archivo tal cual", sinRegs.total === 20 && sinRegs.filas === 2 && sinRegs.sinContar === 0, sinRegs);
  assert("con tus decisiones: el neutro no suma y el íntegro ajustado sí", conRegs.total === 12 && conRegs.filas === 1 &&
    conRegs.sinContar === 1, conRegs);
  assert("y la tarjeta lo dice", sb.dashTarjetaRendimientos(conRegs).includes("1 sin contar por tus decisiones)"));
  // Sin el resumen largo de #resumenCsv en 🚀 (oculto): no hay íntegro que mirar ahí.
}

// =========================================================================
console.log("== Huecos de los tests de la regla 2 ==");
// =========================================================================
{
  const r1 = rendimientos(clasificar([filaCsv(1, "Prueba ES #8/2026", 5, 0, 5, 0, { reinvests: [h(1)] }),
    filaCsv(2, "Prueba ES #7/2026", 5, 0, 5, 0, { reinvests: [h(1)] })],
    [tx(h(1), DISTRIBUIDOR, VAULT, 5, ts(2026, 9, 1))]));
  const sueltas = r1.filter(r => !r.destino);
  assert("una transferencia no casa dos filas", r1.filter(r => r.destino).length === 1 && sueltas.length === 1 &&
    sueltas[0].revisar && sueltas[0].nota.includes("no localizado") && sueltas[0].fecha_cobro === null, r1);
  const [m] = rendimientos(clasificar([filaCsv(1, "Prueba ES #8/2026", 0.3, 0, 0.1, 0.2, { reinvests: [h(1)], claims: [h(1)] })],
    [tx(h(1), DISTRIBUIDOR, VAULT, 0.3, ts(2026, 9, 1))]));
  assert("mixto con un hash: casa por el redondeo y queda a revisar", m.subcategoria === "RCM_MIXTO" && m.destino === VAULT &&
    m.revisar && m.nota === "rendimiento mixto reinvertido/reclamado", m);
  const sb = nuevoSandbox();
  const transfers = [tx(h(1), DISTRIBUIDOR, VAULT, 5, ts(2026, 9, 1))];
  const cache = cacheSintetica(sb, transfers);
  cache.catalogo_propiedades[PROP_ES].nombre_reental = "Caceres 8";
  const [t] = rendimientos(clasificar([filaCsv(1, "Cáceres 8 #8/2026", 5, 0, 5, 0, { reinvests: [h(1)] })], transfers, true, cache));
  assert("«Cáceres» casa con «Caceres» del catálogo", t.contrato === PROP_ES, t.contrato);
}

console.log("\n" + ok + " OK, " + fallos + " FALLO(S)");
process.exit(fallos ? 1 : 0);
