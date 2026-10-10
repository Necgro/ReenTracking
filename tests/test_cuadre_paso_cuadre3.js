/* Test del cuadre con la blockchain en la app (js/28):
 *
 * - cuadreLeerSaldos: wallet y vault (sin vault, solo la wallet), POL con
 *   18 decimales, la API sin respuesta, un saldo negativo y unos
 *   decimales que no se saben (sin llamar a la API).
 * - cuadreDeLaPasada / cuadreVigente: solo con la cache y la wallet y el
 *   vault de la lectura; un token de la cartera sin leer sale sin leer y
 *   uno leído que ya no se cuadra no sale.
 * - Sin red, la lectura deja de preguntar; el redondeo, el orden y los
 *   decimales.
 * - cuadreAvisar: al año de la lectura o al último hasta él, con los
 *   movimientos a revisar y la nota de los que no se leyeron.
 * - fiCalcular (js/23): pasa «apartado» al motor, pone los avisos y el
 *   cálculo se rehace al cambiar los saldos.
 * - arrResumen (js/19): la línea del cuadre.
 * - excelHojaCuadre (js/26) y saldoTokenOnchain con «pol» (js/06).
 * - index.html: js/28 después de js/27 y antes de js/13.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_cuadre_paso_cuadre3.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const S = { console, log: () => {}, toast: () => {}, structuredClone, TextEncoder, URLSearchParams };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "06-etherscan.js", "07-bce.js", "09-sincronizacion.js",
  "10-csv-descubrimiento.js", "14-clasificador.js", "15-correcciones.js", "19-arranque.js", "21-fiscal.js", "22-informe-renta.js",
  "23-fiscal-pestana.js", "25-xlsx.js", "26-excel.js", "28-cuadre.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), S, { filename: f });
}
vm.runInContext("log = () => {}; toast = () => {}; setProgreso = () => {};", S);
const ST = vm.runInContext("state", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plano = x => JSON.parse(JSON.stringify(x));

const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20);
const INM_A = "0x" + "a1".repeat(20), INM_B = "0x" + "a2".repeat(20);
const USDT = vm.runInContext("USDT", S);
const lote = n => ({ cantidad: n, coste_unitario_eur: 1 });
const colasDe = o => vm.runInContext("new Map(" + JSON.stringify(Object.entries(o).map(([a, n]) => [a, [lote(n)]])) + ")", S);
const catalogo = { [INM_A]: { nombre_reental: "Piso A", estado: "CONFIRMADA" }, [INM_B]: { nombre_reental: "Alfa", estado: "CANDIDATA" } };

(async () => {
  console.log("== 1. Leer los saldos ==");
  const llamadas = [], saldoOriginal = S.saldoTokenOnchain;
  let respuestas = {};
  S.saldoTokenOnchain = async (dir, contrato, key, dec) => {
    llamadas.push([dir, contrato, dec]);
    const r = respuestas[dir + "|" + contrato];
    return r === undefined ? 0 : r;
  };
  respuestas = { [W + "|" + USDT]: 12.5, [V + "|" + USDT]: 1, [W + "|pol"]: 3, [W + "|" + INM_A]: -5 };
  const cacheDec = { transacciones: { wallet_tokens: [
    { contractAddress: INM_A.toUpperCase().replace("0X", "0x"), tokenDecimal: "2" }, { contractAddress: INM_A, tokenDecimal: "abc" },
    { contractAddress: INM_B, tokenDecimal: "0" }], vault_tokens: [{ contractAddress: INM_B, tokenDecimal: "2" }] } };
  const s = await S.cuadreLeerSaldos({ USDT, POL: "pol", [INM_A]: INM_A, [INM_B]: INM_B }, cacheDec, "k", W, V, 0);
  assert("wallet y vault de cada token; un saldo negativo no se afirma (A8)", igual(plano(s), {
    USDT: { wallet: 12.5, vault: 1 }, POL: { wallet: 3, vault: 0 }, [INM_A]: { wallet: null, vault: 0 },
    [INM_B]: { wallet: null, vault: null } }), plano(s));
  assert("POL con 18 decimales, USDT con 6 y el inmueble con los de sus transfers (mal escritos no cuentan, A18)",
    igual(llamadas.slice(0, 6).map(x => x[2]), [6, 6, 18, 18, 2, 2]), llamadas);
  assert("decimales que no coinciden: sin leer y sin llamar a la API (A18)", !llamadas.some(x => x[1] === INM_B));
  llamadas.length = 0;
  respuestas = { [W + "|" + USDT]: null };
  const sinVault = await S.cuadreLeerSaldos({ USDT }, {}, "k", W, "", 0);
  assert("sin vault, solo la wallet; la API sin respuesta da null (nunca 0)", igual(plano(sinVault), { USDT: { wallet: null } }) && llamadas.length === 1);
  llamadas.length = 0;
  respuestas = {};
  await S.cuadreLeerSaldos({ USDT }, { transacciones: { wallet_tokens: [{ contractAddress: USDT, tokenDecimal: "8" }] } }, "k", W, "", 0);
  assert("los decimales de los transfers mandan sobre los de siempre (USDT con 8)", llamadas[0][2] === 8, llamadas);
  llamadas.length = 0;
  respuestas = new Proxy({}, { get: () => null });   // sin red: nada responde
  const cinco = { USDT, USDC: vm.runInContext("USDC", S), RNT: vm.runInContext("RNT", S), POL: "pol", [INM_A]: INM_A };
  const sinRed = plano(await S.cuadreLeerSaldos(cinco, {}, "k", W, V, 0));
  assert("A3: sin red, tras 3 respuestas sin saldo deja de preguntar y lo demás sale sin leer",
    llamadas.length === 3 && Object.values(sinRed).every(x => x.wallet === null && x.vault === null), llamadas.length);
  llamadas.length = 0;
  respuestas = { [W + "|" + USDT]: null, [V + "|" + USDT]: null };
  await S.cuadreLeerSaldos({ USDT, POL: "pol" }, {}, "k", W, V, 0);
  assert("A3: un solo token sin respuesta (wallet y vault) no corta la lectura", llamadas.length === 4, llamadas.length);
  const dec = S.cuadreDecimalesPorContrato({ transacciones: { wallet_tokens: [null, "x", { contractAddress: null, tokenDecimal: 300 }] } });
  assert("transfers mal escritos o con decimales absurdos: no cuentan", igual(plano(dec), {}));
  assert("la cache sin transacciones no rompe", igual(plano(S.cuadreDecimalesPorContrato(null)), {}));

  console.log("== 2. Los tokens que se cuadran ==");
  const act = S.cuadreActivos(colasDe({ [INM_B]: 1, "no-es-direccion": 2 }), { catalogo_propiedades: { ...catalogo, __proto__x: null } });
  assert("USDT, USDC, RNT, POL, los inmuebles confirmados y lo que quede en la cartera (con dirección)",
    igual(Object.keys(act), ["USDT", "USDC", "RNT", "POL", INM_A, INM_B]) && act.POL === "pol", Object.keys(act));

  console.log("== 3. El cuadre de la app: vigente y sin leer ==");
  const cache = { catalogo_propiedades: catalogo };
  ST.cache = cache;
  ST.config = { wallet: W, vault: V };
  const huella = S.arrHuellaConfig(ST.config);
  ST.cuadre = { cache, huella, fecha: "2026-10-08", saldos: { USDT: { wallet: 300, vault: 0 } } };
  const colas = colasDe({ USDT: 500, [INM_A]: 3 });
  const apartado = { USDT: { pools: 0, defi: 0, otras_cuentas: 200 } };
  let cu = S.cuadreDeLaPasada(colas, apartado, cache, S.cuadreVigente());
  assert("cuadra USDT (500 menos 200 en otras cuentas = 300)", cu.filas[0].activo === "USDT" && cu.filas[0].coincide === true);
  assert("un inmueble de la cartera que no se leyó sale sin leer, no se salta", cu.sin_leer.length === 1 && cu.sin_leer[0].nombre === "Piso A");
  assert("con la fecha de la lectura", cu.fecha === "2026-10-08");
  assert("los saldos guardados no cambian", igual(Object.keys(ST.cuadre.saldos), ["USDT"]));
  const leidoAntes = Object.assign({}, ST.cuadre, { saldos: { USDT: { wallet: 300, vault: 0 }, [INM_B]: { wallet: 5, vault: 0 } } });
  cu = S.cuadreDeLaPasada(colas, apartado, cache, leidoAntes);
  assert("A1: un token leído que ya no se cuadra (descartado o al spam después) no sale", !cu.filas.some(f => f.activo === INM_B) &&
    !cu.diferencias.length);
  ST.config = { wallet: W, vault: "" };
  assert("otra wallet o vault: los saldos no valen", S.cuadreVigente() === null);
  ST.config = { wallet: W, vault: V };
  ST.cache = {};
  assert("otra cache: los saldos no valen", S.cuadreVigente() === null);
  ST.cache = cache;
  assert("sin lectura: nada", (ST.cuadre = null, S.cuadreVigente() === null));

  const justo = S.cuadreCartera(colasDe({ USDC: 0.01 }), null, { USDC: { wallet: 0.02 } }, {});
  const pasa = S.cuadreCartera(colasDe({ USDC: 0.01 }), null, { USDC: { wallet: 0.03 } }, {});
  assert("una diferencia de justo la tolerancia (0,01) cuadra; de más, no",
    justo.filas[0].diferencia === 0.01 && justo.filas[0].coincide === true && pasa.filas[0].coincide === false);

  const red = S.cuadreCartera(colasDe({}), null, { RNT: { wallet: 12.0078125 } }, {});
  assert("redondeo a 6 decimales, al par (12,0078125 -> 12,007812)", red.filas[0].blockchain === 12.007812, red.filas[0]);
  const cat2 = { catalogo_propiedades: { [INM_A]: { nombre_reental: "beta" }, [INM_B]: { nombre_reental: "Alfa" } } };
  const orden = S.cuadreCartera(colasDe({}), null, { [INM_A]: { wallet: 1 }, [INM_B]: { wallet: 1 }, USDT: { wallet: 1 } }, cat2);
  assert("orden: USDT primero y los inmuebles por nombre sin mirar mayúsculas", igual(orden.filas.map(f => f.nombre), ["USDT", "Alfa", "beta"]));

  console.log("== 4. Avisos del informe ==");
  const fila = { activo: INM_A, nombre: "Piso A", motor: 3, en_pools: 0, en_defi: 0, en_otras_cuentas: 0, esperado: 3, wallet: 4,
    vault: 0, blockchain: 4, diferencia: 1, coincide: false };
  const sinLeer = { ...fila, nombre: "USDC", blockchain: null, diferencia: null, coincide: null };
  const cuadre = { filas: [fila, sinLeer], diferencias: [fila], sin_leer: [sinLeer] };
  const informes = () => ({ 2024: { avisos: [] }, 2025: { avisos: [] }, 2027: { avisos: [] } });
  let inf = informes();
  S.cuadreAvisar(inf, cuadre, "2026-10-08", 3);
  assert("sin informe del año de la lectura: al último hasta él, no al futuro (A11)", inf[2025].avisos.length === 2 && !inf[2027].avisos.length);
  const [aviso, nota] = inf[2025].avisos;
  assert("la diferencia, a revisar, con la fecha de la lectura", aviso.tipo === "revisar" && aviso.fecha === "2026-10-08" &&
    aviso.concepto === "Cuadre con la blockchain");
  assert("con lo que dice cada lado y la diferencia", /Piso A: según la app tendrías 3 en la wallet y el vault y la blockchain dice 4 \(diferencia \+1\)/.test(aviso.detalle), aviso.detalle);
  assert("A6: dice cuántos movimientos hay a revisar, sin mandar a decidirlos", /hay 3 movimientos a revisar: puede venir de ahí/.test(aviso.detalle) &&
    !/decide/.test(aviso.detalle), aviso.detalle);
  assert("lo que no se leyó, en una nota", nota.tipo === "nota" && /USDC/.test(nota.detalle));
  inf = { 2027: { avisos: [] }, 2028: { avisos: [] } };
  S.cuadreAvisar(inf, cuadre, "2026-10-08");
  assert("todos posteriores: al primero (A11)", inf[2027].avisos.length === 2 && !/a revisar/.test(inf[2027].avisos[0].detalle));
  inf = { 2026: { avisos: [] } };
  S.cuadreAvisar(inf, { filas: [], diferencias: [], sin_leer: [] }, "2026-10-08");
  S.cuadreAvisar({}, cuadre, "2026-10-08");
  assert("si todo cuadra, ningún aviso; sin informes, no rompe", !inf[2026].avisos.length);
  assert("sin vault: «en la wallet», sin el vault", /tendrías 3 en la wallet y la blockchain/.test(S.cuadreTextoDiferencia({ ...fila, vault: null })));
  const a12 = S.cuadreTextoDiferencia({ ...fila, en_otras_cuentas: 150, esperado: -50, blockchain: 0, diferencia: 50 });
  assert("A12: lo apartado pasa de lo que tienes: no dice «tendrías -50»", !/-50/.test(a12) && /pasa en 50 de lo que cree que tienes/.test(a12), a12);

  console.log("== 5. fiCalcular (js/23) ==");
  const motorOriginal = S.motorFiscal, informesOriginal = S.informesRentaAnuales;
  let opRecibidas = null, pasadas = 0;
  S.motorFiscal = (rs, cacheMotor, cfg, op) => {
    pasadas++;
    opRecibidas = op;
    rs[0].revisar = true;   // lo marca el motor: cuenta
    op.apartado.USDT = { pools: 0, defi: 0, otras_cuentas: 200 };
    const c = new Map();
    S.crearLote(c, "USDT", 500, 500, "2026-01-01", "COMPRA");   // nace por crearLote, como en el motor
    return c;
  };
  S.informesRentaAnuales = () => ({ 2026: { avisos: [] } });
  ST.registros = [{ clave: "r1", fecha: "2026-01-01", revisar: false }];
  ST.cuadre = null;
  let r = S.fiResultado();
  assert("el motor recibe «apartado» y sin lectura no hay cuadre", opRecibidas && "apartado" in opRecibidas && r.cuadre === null &&
    !r.informes[2026].avisos.length);
  ST.cuadre = { cache, huella, fecha: "2026-10-08", saldos: { USDT: { wallet: 250, vault: 0 } } };
  const antes = pasadas;
  r = S.fiResultado();
  assert("con saldos nuevos se rehace el cálculo", pasadas === antes + 1);
  assert("el cuadre, con lo apartado del motor: -50 USDT", r.cuadre && r.cuadre.diferencias.length === 1 && r.cuadre.diferencias[0].diferencia === -50);
  assert("su aviso en el informe, con el movimiento a revisar", r.informes[2026].avisos.length === 1 &&
    /hay 1 movimiento a revisar/.test(r.informes[2026].avisos[0].detalle), r.informes[2026].avisos);
  S.fiResultado();
  assert("sin cambios, no se rehace", pasadas === antes + 1);

  console.log("== 6. La línea de 🚀 ==");
  const lineas = d => S.arrResumen(Object.assign({ clasificacion: { inmuebles: 1 }, cacheOk: true, configOk: true, csvOk: true,
    vaultConfigurado: true }, d)).lineas.map(l => [l.tipo, l.texto, l.accion && l.accion.fn, l.accion && l.accion.href]);
  assert("sin cuadre, nada", !lineas({ cuadre: null }).some(l => /blockchain/.test(l[1])));
  assert("todo cuadra: una línea en verde", igual(lineas({ cuadre: { filas: [fila], diferencias: [], sin_leer: [] } })
    .filter(l => /blockchain/.test(l[1])), [["ok", "Tu cartera cuadra con la blockchain.", undefined, undefined]]));
  const unaSinLeer = lineas({ cuadre: { filas: [{ ...fila, coincide: true }, sinLeer], diferencias: [], sin_leer: [sinLeer] } });
  assert("A8: con algo sin leer no dice que la cartera cuadra", !unaSinLeer.some(l => l[0] === "ok" && /cuadra/.test(l[1])) &&
    unaSinLeer.some(l => /No se pudo leer/.test(l[1])));
  const malas = lineas({ cuadre: cuadre }).filter(l => /blockchain/.test(l[1]));
  assert("una diferencia y uno sin leer: dos avisos, el primero con enlace a los avisos", malas.length === 2 &&
    malas[0][0] === "warn" && /<b>1<\/b> token no cuadra con la blockchain: Piso A\./.test(malas[0][1]) && malas[0][2] === "cuadre" &&
    malas[0][3] === "#fiscal" &&
    /USDC/.test(malas[1][1]), malas);
  assert("el título dice que hay avisos", S.arrResumen({ clasificacion: { inmuebles: 1 }, cacheOk: true, configOk: true, csvOk: true,
    vaultConfigurado: true, cuadre }).titulo === "⚠ Listo, con avisos.");
  const nombreRaro = { ...fila, nombre: "<b>x</b>" };
  assert("el nombre de un token va escapado", lineas({ cuadre: { filas: [nombreRaro], diferencias: [nombreRaro], sin_leer: [] } })
    .some(l => l[1].includes("&lt;b&gt;x&lt;/b&gt;")));
  S.motorFiscal = motorOriginal; S.informesRentaAnuales = informesOriginal;

  console.log("== 7. La hoja del Excel y POL en Etherscan ==");
  const libro = S.xlsxLibro();
  S.excelHojaCuadre(libro, Object.assign({}, cuadre, { fecha: "2026-10-08" }));
  const hoja = libro.hojas[0];
  const celda = (f, c) => hoja.filas.get(f) && hoja.filas.get(f).get(c);
  assert("se llama «Cuadre con la blockchain»", hoja.nombre === "Cuadre con la blockchain");
  assert("cifras con el formato de las cantidades (entera: el de entero)", celda(2, 2).valor === 3 && celda(2, 2).estilo.formato === "#,##0");
  assert("¿Cuadra?: No en rojo y negrita; Sin leer, igual", celda(2, 10).valor === "No" && celda(2, 10).estilo.color === "C00000" &&
    celda(2, 10).estilo.negrita && celda(3, 10).valor === "Sin leer" && celda(3, 10).estilo.color === "C00000");
  assert("sin leer: las celdas de la blockchain, vacías", !celda(3, 9));
  const libroSi = S.xlsxLibro();
  S.excelHojaCuadre(libroSi, { filas: [{ ...fila, diferencia: 0, coincide: true }], fecha: null });
  const si = libroSi.hojas[0].filas.get(2).get(10);
  assert("¿Cuadra?: Sí, sin negrita ni rojo; sin fecha, la nota sin «el»", si.valor === "Sí" && !si.estilo.negrita && !si.estilo.color &&
    /^Saldos de la blockchain leídos\. /.test(libroSi.hojas[0].filas.get(4).get(1).valor));
  assert("la nota de debajo, con la fecha de la lectura", /08\/10\/2026/.test(celda(5, 1).valor));
  assert("con filtro y cabecera congelada", hoja.filtro && hoja.congelar);
  S.saldoTokenOnchain = saldoOriginal;
  const pedidas = [];
  S.etherscanGet = async (params) => { pedidas.push(params); return "3000000000000000000"; };
  const pol = await S.saldoTokenOnchain(W, "pol", "k", 18);
  await S.saldoTokenOnchain(W, USDT, "k", 6);
  assert("POL: account/balance, sin contrato", pol === 3 && pedidas[0].action === "balance" && !("contractaddress" in pedidas[0]));
  assert("un token: account/tokenbalance con su contrato", pedidas[1].action === "tokenbalance" && pedidas[1].contractaddress === USDT);

  console.log("== 8. index.html ==");
  const html = fs.readFileSync(path.join(SPA, "index.html"), "utf8");
  const pos = f => html.indexOf('src="js/' + f + '"');
  assert("js/28 después de js/27 y antes de js/13", pos("28-cuadre.js") > pos("27-informe-pdf.js") && pos("28-cuadre.js") < pos("13-inicio.js") &&
    pos("27-informe-pdf.js") > 0);

  console.log("\n" + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})();
