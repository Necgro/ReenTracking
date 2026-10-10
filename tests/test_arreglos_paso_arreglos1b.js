/* Test de más arreglos de la app. Una sección por fallo arreglado.
 * Editar el coste con «✏️ Editar» está en test_coste_compras_paso_du2i.js.
 * js/15, js/18 y js/20: un «Mandado a revisar» con coste sigue siendo tuyo.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_arreglos_paso_arreglos1b.js
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
/* Con un DOM falso (los campos, por id) y soportaFSA, para js/04 y js/19
   (como el de test_arreglos_paso_arreglos1.js). */
function sandboxConDom(archivos, campos = {}, extra = {}) {
  const elementos = {};
  const sb = Object.assign({ console, document: { getElementById: id => (elementos[id] = elementos[id] ||
    { id, value: campos[id] || "", dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } }) } }, extra);
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext("var soportaFSA = true;", sb);
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  return sb;
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

console.log("== R1. «Aplicar» en «Ajustes en JSON» avisa si los ajustes cambiaron mientras escribías ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "08-coingecko.js", "14-clasificador.js",
    "15-correcciones.js", "18-transacciones.js", "11-panel.js"]);
  const f = S.pnAjustesCambiaronAlEscribir;
  const base = JSON.stringify({ a: { revisar: true } }, null, 2);
  const conDecision = JSON.stringify({ a: { revisar: true }, b: { categoria: "VENTA" } }, null, 2);
  const escrito = '{"a": {"revisar": false}}';
  assert("sin cambios por debajo: no avisa", f(base, base, escrito) === false);
  assert("una decisión tomada mientras escribías: avisa", f(base, conDecision, escrito) === true);
  assert("tu texto ya es lo de ahora (aunque con otro formato): no avisa",
    f(base, conDecision, '{"a":{"revisar":true},"b":{"categoria":"VENTA"}}') === false);
  assert("lo mismo con otro formato no cuenta como cambio",
    f(base, '{"a":{"revisar":true}}', escrito) === false);
  assert("sin base (el editor nunca se pintó): no avisa", f(undefined, conDecision, escrito) === false && f("", conDecision, escrito) === false);
  assert("tu texto a medio escribir (no es JSON) y ajustes cambiados: avisa", f(base, conDecision, '{"a": ') === true);
}

console.log("== R2. Deshacer «✔ Dejar como compra» con coste, cuando venía de «Mandar a revisar» ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js",
    "18-transacciones.js", "20-coste-compras.js"]);
  const HOY = "2026-10-02T10:00:00.000Z";
  const W = "0x" + "e1".repeat(20), T = "0x" + "e9".repeat(20);
  const compra = { clave: "c", categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", cantidad: 2,
    coste_eur: 200, origen: T, destino: W, contrato: "0x" + "c1".repeat(20), hash: "0x" + "0a".repeat(32),
    fuente: "ONCHAIN", revisar: true };
  const previos = { c: { revisar: true, nota: "Mandado a revisar por ti (2026-09-30): ver" } };
  let aj = S.ccAjustesConDecision(previos, compra, "dejar", null, HOY);
  aj = S.cbAjustesConCostes(aj, [{ clave: "c", valor: 250 }], [compra], 100, HOY);
  const vuelta = S.ccAjustesSinDecision(aj, "c", HOY);
  assert("deshacer: vuelve el «Mandado a revisar» con su motivo y el coste de 250 €",
    JSON.stringify(vuelta) === JSON.stringify({ c: { revisar: true, nota: previos.c.nota, coste_eur: 250 } }), vuelta);

  // 🔍 Revisión: se puede volver a decidir, y «✔ Dejar como …» conserva el coste.
  assert("🔍 Revisión: es tuyo (se puede decidir)", S.ccEstadoDecision(compra, vuelta) === "propio");
  const otra = S.ccAjustesConDecision(vuelta, compra, "dejar", null, HOY);
  assert("«✔ Dejar como compra» otra vez: el coste sigue y recuerda el «Mandado a revisar»",
    otra.c.coste_eur === 250 && otra.c.revisar === false && otra.c.nota.includes("[antes: mandado a revisar (2026-09-30), coste 250,00 EUR: ver]"), otra);
  assert("…y deshacerla vuelve exactamente a lo mismo", JSON.stringify(S.ccAjustesSinDecision(otra, "c", HOY)) === JSON.stringify(vuelta));
  const neutro = S.ccAjustesConDecision(vuelta, compra, "neutro", null, HOY);
  assert("otra decisión (movimiento neutro) no arrastra el coste", !("coste_eur" in neutro.c), neutro);

  // 📒 Transacciones: «↩ Quitar de revisar» se puede y el coste se queda.
  assert("📒: es un «Mandado a revisar» tuyo (se puede quitar)", S.txEstadoRevisar(compra, vuelta) === "spa");
  const sinRevisar = S.txAjustesSinRevisar(vuelta, "c", HOY);
  assert("📒: quitarlo deja el coste como el de «💶 Coste…»",
    JSON.stringify(sinRevisar) === JSON.stringify({ c: { coste_eur: 250, nota: "Coste puesto por ti (2026-10-02)" } }) &&
    S.cbEstadoCoste(compra, sinRevisar) === "propio", sinRevisar);
  assert("📒: sin coste, quitarlo lo borra entero (como antes)", JSON.stringify(S.txAjustesSinRevisar(previos, "c", HOY)) === "{}");

  // 💶 Coste: se puede cambiar, y sigue a revisar.
  assert("💶: se edita (solo el coste)", S.cbEstadoCoste(compra, vuelta) === "decision");
  const cambiado = S.cbAjustesConCostes(vuelta, [{ clave: "c", valor: 300 }], [compra], 100, HOY);
  assert("💶: cambia el coste y sigue el «Mandado a revisar»",
    JSON.stringify(cambiado) === JSON.stringify({ c: { revisar: true, nota: previos.c.nota, coste_eur: 300 } }), cambiado);

  // Lo que no es tuyo sigue sin tocarse.
  const sacadoConCoste = { c: { categoria: "REVISAR", revisar: true, nota: "Sacado del spam por ti (2026-10-01)", coste_eur: 5 } };
  assert("un «Sacado del spam» con coste (no lo escribe la app): ajeno",
    S.ccEstadoDecision(compra, sacadoConCoste) === "ajeno" && S.cbEstadoCoste(compra, sacadoConCoste) === "ajeno");
  const conOtroCampo = { c: { revisar: true, nota: previos.c.nota, coste_eur: 5, importe_usdt: 1 } };
  assert("un «Mandado a revisar» con otro campo más: ajeno",
    S.ccEstadoDecision(compra, conOtroCampo) === "ajeno" && S.txEstadoRevisar(compra, conOtroCampo) === "motor");
}

console.log("== R3. «Añadir otro cobro» con vínculos mal escritos en la cache ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
    "14-clasificador.js", "15-correcciones.js"]);
  const h = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
  S.ccClaveRef = r => r.hash; // las referencias sintéticas solo traen el hash
  const borrador = { salida: { hash: h(1) }, importe_esperado_usd: null, moneda_esperada: "USD",
    estado_liquidacion: "COMPLETA", nota: "n", asignaciones: [{ pago: { hash: h(3) }, cantidad_asignada: 100 }] };
  const sinAsignaciones = { id: "pd_1", estado: "CONFIRMADO", salida: { hash: h(1) }, estado_liquidacion: "COMPLETA", nota: "" };
  const objeto = { id: "pd_2", estado: "CONFIRMADO", salida: { hash: h(2) }, asignaciones: { raro: 1 } };
  const json = x => JSON.stringify(x);

  assert("ids de asignación: un null y unas asignaciones que son un objeto no rompen (as_001)",
    S.ccGenerarIdAsignacion([null, objeto, sinAsignaciones]) === "as_001");

  let r, error = null;
  const ventas = [null, sinAsignaciones, objeto];
  const antes = json(ventas);
  try { r = S.ccAplicarBorradorABloque(ventas, { borrador, refSalida: { hash: h(1) }, conservarVenta: true }); }
  catch (e) { error = e.message; }
  assert("añadir un cobro a un vínculo sin asignaciones, con un null y otro mal escrito en la lista: no lanza", !error, error);
  if (r) {
    const v = r.ventas.find(x => x && x.id === "pd_1");
    assert("el vínculo queda con su cobro (as_001) y es una edición", v.asignaciones.length === 1 &&
      v.asignaciones[0].id === "as_001" && v.asignaciones[0].cantidad_asignada === 100 && r.editada, v);
    assert("el null y el vínculo mal escrito se guardan como estaban",
      r.ventas[0] === null && json(r.ventas[2]) === json(objeto) && r.ventas.length === 3, r.ventas);
    assert("lo recibido no se toca", json(ventas) === antes);
  }

  // El vínculo de la salida, anulado, con un null al lado: se reutiliza.
  const anulado = Object.assign({}, sinAsignaciones, { estado: "ANULADO", asignaciones: { raro: 1 } });
  error = null;
  try { r = S.ccAplicarBorradorABloque([null, anulado], { borrador, refSalida: { hash: h(1) }, conservarVenta: true }); }
  catch (e) { error = e.message; }
  assert("volver a vincular una salida anulada con un null en la lista: no lanza y reutiliza su id",
    !error && r.ventaId === "pd_1" && r.reutilizada && r.ventas[0] === null, error || r);

  // Lo que queda de un cobro, con un null entre las asignaciones (al editar).
  S.ccReferenciaDeRegistro = reg => ({ hash: reg.hash });
  const conNull = [{ id: "pd_3", estado: "CONFIRMADO", salida: { hash: h(1) },
    asignaciones: [null, { id: "as_001", pago: { hash: h(3) }, cantidad_asignada: 40 }] }];
  error = null;
  let disp;
  try { disp = S.ccDisponibleCobroExcluyendo({ hash: h(3), cantidad: 100 }, conNull, {}, { ventaId: "pd_9", asignacionId: "as_009" }); }
  catch (e) { error = e.message; }
  assert("lo que queda de un cobro, con un null entre las asignaciones: no lanza (60)", !error && disp === 60, error || disp);
}

console.log("== R4. La wallet y el vault: la misma regla en el paso 1 y al clasificar ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"]);
  const avisos = [];
  S.toast = (m, t) => avisos.push([m, t]);
  const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20);
  vm.runInContext("state.cache = cacheVacia(); state.csvCargado = true; state.filasCsv = [{}];", S);
  const ponerConfig = cfg => vm.runInContext("state.config = " + JSON.stringify(cfg) + ";", S);
  const req = cfg => { ponerConfig(cfg); return S.requisitosClasificacionOk().configOk; };
  const casos = [
    [{ wallet: W, vault: "" }, true], [{ wallet: W }, true], [{ wallet: W, vault: V }, true],
    [{ wallet: W, vault: "0xe2e2" }, false], [{ wallet: "0xe1e1", vault: V }, false], [{ wallet: "", vault: V }, false],
    [{ wallet: "  " + W.toUpperCase().replace("0X", "0x") + " " }, true],
  ];
  for (const [cfg, esperado] of casos) cfg.compra_bancaria_coste_eur_por_token = 100;
  assert("al clasificar: wallet válida y vault vacío o válido; nada a medio escribir",
    casos.every(([cfg, esperado]) => req(cfg) === esperado), casos.map(([cfg]) => req(cfg)));
  assert("…exactamente la regla del paso 1 (direccionesConfigOk)",
    casos.every(([cfg]) => req(cfg) === S.direccionesConfigOk(cfg)));
  ponerConfig({ wallet: W, vault: "0xe2e2", compra_bancaria_coste_eur_por_token: 100 });
  assert("con el vault mal escrito no reclasifica y el aviso dice que es el vault",
    S.ejecutarClasificacion() === false && /El vault está mal escrito/.test((avisos.pop() || [])[0]));
  assert("con la wallet a medio escribir, el aviso dice que está mal escrita",
    /La wallet está mal escrita/.test(S.motivoConfigMal({ wallet: "0xe1" })));
  assert("A12: la wallet y el vault mal los dos (o sin wallet y el vault mal): el aviso nombra los dos",
    [{ wallet: "0xe1", vault: "0xe2" }, { wallet: "", vault: "0xe2" }].every(c => /wallet y vault/.test(S.motivoConfigMal(c))));
  assert("sin wallet, el aviso de siempre",
    /^Falta tu dirección de wallet/.test(S.motivoConfigMal({})) && /^Falta tu dirección de wallet/.test(S.motivoConfigMal(null)));
}

console.log("== R5. Wallet y vault mal los dos: el aviso habla de los dos ==");
{
  const S = sandboxConDom(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js",
    "04-config.js", "19-arranque.js"]);
  const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20);
  const titulo = cfg => {
    vm.runInContext("state.config = " + JSON.stringify(cfg) + "; state.cache = cacheVacia(); state.csvCargado = true; " +
      "state.filasCsv = [{}]; state.registros = null;", S);
    return S.arrResumen(S.arrDatosResumen()).titulo || "";
  };
  const ambos = titulo({ wallet: "", vault: "0xe2" });
  assert("sin wallet y con el vault mal escrito: habla de los dos", /wallet/.test(ambos) && /vault/.test(ambos), ambos);
  const ambosMal = titulo({ wallet: "0xe1", vault: "0xe2" });
  assert("las dos mal escritas: también", /wallet/.test(ambosMal) && /vault/.test(ambosMal), ambosMal);
  const soloVault = titulo({ wallet: W, vault: "0xe2" });
  assert("solo el vault: solo el vault", /vault/.test(soloVault) && !/wallet/.test(soloVault), soloVault);
  const soloWallet = titulo({ wallet: "0xe1", vault: V });
  assert("solo la wallet: solo la wallet", /wallet/.test(soloWallet) && !/vault/.test(soloWallet), soloWallet);
}

console.log("== R6. Ampliar un vínculo que ya tenía un problema: el formulario dice por qué ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js"]);
  const USDC = vm.runInContext("USDC", S), P1 = "0x" + "a1".repeat(20);
  const W = "0x" + "e1".repeat(20), T = "0x" + "e9".repeat(20);
  const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
  const reg = (hash, contrato, origen, destino, cantidad, categoria, clave, simbolo) => ({
    clave, fecha: "2026-05-12 09:45:46", hash, contrato, token: null, simbolo, cantidad, categoria,
    subcategoria: "PENDIENTE", inmueble: null, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen, destino, fuente: "ONCHAIN", nota: "", revisar: categoria === "REVISAR" });
  const tx = (hash, contrato, from, to, value, dec) => ({ hash, contractAddress: contrato, from, to, value,
    tokenDecimal: dec, timeStamp: "1778556800" });
  const cache = { catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba" } },
    contratos_aprendidos: {}, ajustes_usuario: {}, pagos_diferidos: { version: 1, ventas: [] },
    transacciones: { wallet_tokens: [
      tx(H(1), P1, W, T, "250000000000000000000", "18"), tx(H(2), USDC, T, W, "300000000", "6"),
      tx(H(4), USDC, T, W, "120000000", "6")],
      vault_tokens: [], wallet_normales: [], wallet_internas: [], vault_normales: [] } };
  const SA = reg(H(1), P1, W, T, 250, "REVISAR", "sa", "P"), CA = reg(H(2), USDC, T, W, 300, "DEPOSITO", "ca", "USDC");
  const CB = reg(H(4), USDC, T, W, 120, "DEPOSITO", "cb", "USDC");
  const vincular = (ventas, s, c, cant) => {
    const refSalida = S.ccReferenciaDeRegistro(s, cache), refCobro = S.ccReferenciaDeRegistro(c, cache);
    const borrador = S.ccBorradorVenta({ salida: s, cobro: c, refSalida, refCobro, cantidadAsignada: cant,
      estadoLiquidacion: "COMPLETA", importeEsperado: null, monedaEsperada: "USD", nota: "" });
    return S.ccAplicarBorradorABloque(ventas, { borrador, refSalida, refCobro, conservarVenta: true });
  };
  const guardadas = vincular([], SA, CA, 300).ventas;
  const id = guardadas[0].id;
  // La venta guardada se queda sin su salida (la cache cambió): el motor da un problema de ESA venta.
  const regs = [CA, CB];
  const base = S.ccSimularBloque(regs, cache, guardadas);
  assert("el vínculo guardado ya trae su problema", base.info.problemas.some(m => m.startsWith("venta " + id + ":")), base.info.problemas);
  // «➕ Añadir otro cobro…» a esa misma venta (la salida, de la referencia guardada).
  const refSalida = guardadas[0].salida, refCobro = S.ccReferenciaDeRegistro(CB, cache);
  const borrador = S.ccBorradorVenta({ salida: SA, cobro: CB, refSalida, refCobro, cantidadAsignada: 120,
    estadoLiquidacion: "COMPLETA", importeEsperado: null, monedaEsperada: "USD", nota: "" });
  const esc = S.ccAplicarBorradorABloque(guardadas, { borrador, refSalida, refCobro, conservarVenta: true });
  assert("es una ampliación de esa venta", esc.editada && esc.ventaId === id);
  const v = S.ccValidacionBorrador({ regSalida: SA, regCobro: CB, cantidadOk: true, dupCobro: false,
    sim: S.ccSoloLoNuevo(S.ccSimularBloque(regs, cache, esc.ventas), base, esc.ventaId), ventaId: esc.ventaId });
  assert("no se guarda y el motivo es el problema de esa venta (no un «revisa los datos» genérico)",
    !v.ok && v.motivos.includes("La venta ya no está entre tus movimientos.") && // en llano
    !v.motivos.includes("Este vínculo no se puede aplicar: revisa los datos."), v.motivos);
  // El problema de OTRA venta no se cuenta.
  const v2 = S.ccSoloLoNuevo(S.ccSimularBloque(regs, cache, esc.ventas), base, "pd_otra");
  assert("con otra venta, ese problema se resta (ARREGLOS-1, M2)", !v2.info.problemas.some(m => m.startsWith("venta " + id + ":")), v2.info.problemas);
  assert("los dos formatos de problema por venta",
    S.ccProblemaDeVenta("venta pd_1: sin salida", "pd_1") && !S.ccProblemaDeVenta("venta pd_10: x", "pd_1") &&
    S.ccProblemaDeVenta("sobreasignacion: pago x suma 2 > 1 (ventas: pd_2, pd_1)", "pd_1") &&
    !S.ccProblemaDeVenta("sobreasignacion: pago x (ventas: pd_2)", "pd_1") && !S.ccProblemaDeVenta("venta pd_1: x", undefined));
}

console.log("== R7. 📒 «A revisar» con spam a revisar: nunca «3 de 1 movimiento» ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"]);
  const r = (clave, categoria, revisar) => ({ clave, categoria, revisar, fecha: "2026-07-0" + (clave.length % 9 + 1) + " 10:00:00" });
  const registros = [r("a", "REVISAR", true), r("b", "COMPRA", false),
    r("s1", "SPAM", true), r("s2", "SPAM", true), r("s3", "SPAM", false)];
  const f = { q: "", grupo: "revisar", ocultarSpam: true, plegarCobros: false, categoria: "", motivo: "" };
  const visibles = S.txFiltrar(registros, f, null);
  const total = S.txTotalRecuento(registros, f, null, false);
  const texto = S.txTextoRecuento(visibles.length, total, true, false);
  assert("con «A revisar» se ven los 3 (1 + 2 spam a revisar) y el total no es menor",
    visibles.length === 3 && total >= visibles.length, { visibles: visibles.length, total, texto });
  assert("el recuento dice «3 de 4 movimientos» (2 del libro + los 2 spam que se ven)", texto === "3 de 4 movimientos", texto);
  const sinGrupo = Object.assign({}, f, { grupo: "" });
  assert("sin «A revisar», el total de siempre (el spam va aparte)",
    S.txTotalRecuento(registros, sinGrupo, null, false) === 2);
  const modoSpam = Object.assign({}, f, { grupo: "", categoria: "SPAM" });
  assert("en el modo spam, el total es el spam (3)",
    S.txTotalRecuento(registros, modoSpam, null, true) === 3);
  // El «de N» no cambia con los demás filtros (año o búsqueda).
  const conAnio = Object.assign({}, f, { ejercicio: "2026" }), buscando = Object.assign({}, f, { q: "s1" });
  assert("A16: con «A revisar», el total no cambia al filtrar por año o al buscar (4)",
    S.txTotalRecuento(registros, conAnio, null, false) === 4 && S.txTotalRecuento(registros, buscando, null, false) === 4,
    [S.txTotalRecuento(registros, conAnio, null, false), S.txTotalRecuento(registros, buscando, null, false)]);
  assert("…y lo que se ve nunca pasa del total",
    [conAnio, buscando].every(g => S.txFiltrar(registros, g, null).length <= S.txTotalRecuento(registros, g, null, false)));
}

console.log("== R8. «✔ Dejar como movimiento neutro» en una salida de un inmueble: ya no queda «por vincular» ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
    "14-clasificador.js", "15-correcciones.js"]);
  const HOY = "2026-10-02T10:00:00.000Z";
  const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20), T = "0x" + "e9".repeat(20), PROP = "0x" + "c1".repeat(20);
  const h7 = "0x" + "07".repeat(32);
  const cache = S.cacheVacia();
  cache.catalogo_propiedades[PROP] = { nombre_reental: "Prueba ES", nombre_etherscan: "PRUEBA ES", simbolo: "P", estado: "CONFIRMADA" };
  const config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0 };
  // Una salida de tokens del inmueble que el motor dejó como movimiento neutro.
  const neutro = { clave: h7 + "::" + PROP, hash: h7, contrato: PROP, inmueble: "Prueba ES", origen: W, destino: T,
    cantidad: 2, categoria: "MOVIMIENTO", subcategoria: "NEUTRO", revisar: false, fuente: "ONCHAIN" };
  const ctxSin = S.ccContextoCandidatos(cache, config, [neutro]);
  assert("sin decidir: sigue «por vincular» (como hasta ahora)", S.ccPendienteDeVincular(neutro, ctxSin, false) === "salida");
  const ops = S.ccOpcionesDecision(neutro, ctxSin);
  assert("Revisión ofrece «✔ Dejar como Movimiento neutro»", ops.some(o => o.id === "dejar" && /Movimiento neutro/.test(o.etiqueta)), ops);
  cache.ajustes_usuario = S.ccAjustesConDecision({}, neutro, "dejar", null, HOY);
  assert("la decisión no lleva categoría (deja la del motor)", !("categoria" in cache.ajustes_usuario[S.ccClaveAjuste(neutro.clave)]));
  const ctx = S.ccContextoCandidatos(cache, config, [neutro]);
  assert("decidido: ya no está «por vincular» ni en Revisión",
    S.ccPendienteDeVincular(neutro, ctx, false) === null && S.ccMotivoRevision(neutro, ctx) === null);
  assert("una decisión en otra categoría (no neutra) no la saca: solo cuenta si el movimiento es neutro",
    S.ccPendienteDeVincular(Object.assign({}, neutro, { categoria: "REVISAR", revisar: true }), ctx, false) === "salida");
}

console.log("== R10. Redondeo a 6 decimales: los empates, al par, como round de Python ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js"]);
  assert("12,0078125 (= 12 + 1/128) → 12,007812", S.pdRedondear6(12.0078125) === 12.007812);
  assert("12,0234375 → 12,023438 (el par de arriba) y -12,0078125 → -12,007812",
    S.pdRedondear6(12.0234375) === 12.023438 && S.pdRedondear6(-12.0078125) === -12.007812);
  // Muchos números, comparados con round(x, 6) del Python de verdad.
  const valores = [];
  for (let k = 0; k < 4000; k++) valores.push(k / 128, -k / 128, 1000 + k / 64, k / 1024);
  let semilla = 7;
  const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 4000; k++) valores.push(azar() * 1000, -azar() * 10, Number((azar() * 500).toFixed(7)));
  const { spawnSync } = require("child_process");
  const py = spawnSync("python", ["-c", "import json,sys; print(json.dumps([round(x, 6) for x in json.load(sys.stdin)]))"],
    { input: JSON.stringify(valores), encoding: "utf8", maxBuffer: 1 << 26 });
  const esperados = py.status === 0 ? JSON.parse(py.stdout) : null;
  const distintos = esperados ? valores.filter((x, i) => S.pdRedondear6(x) !== esperados[i]) : null;
  assert("los " + valores.length + " números, idénticos a round(x, 6) de Python", esperados && distintos.length === 0,
    esperados ? distintos.slice(0, 5) : py.stderr);
}

console.log("== A1. Decidir otra cosa sobre un «Mandado a revisar» con coste y deshacer: el coste vuelve ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js",
    "18-transacciones.js", "20-coste-compras.js"]);
  const HOY = "2026-10-02T10:00:00.000Z";
  const W = "0x" + "e1".repeat(20), T = "0x" + "e9".repeat(20);
  const compra = { clave: "c", categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", cantidad: 2,
    coste_eur: 200, origen: T, destino: W, contrato: "0x" + "c1".repeat(20), hash: "0x" + "0a".repeat(32),
    fuente: "ONCHAIN", revisar: true };
  const json = x => JSON.stringify(x);
  for (const coste of [250, 1234.5]) {
    const partida = { c: { revisar: true, nota: "Mandado a revisar por ti (2026-09-30): ver", coste_eur: coste } };
    for (const id of ["neutro", "spam", "dejar"]) {
      const decidido = S.ccAjustesConDecision(partida, compra, id, null, HOY);
      const vuelta = S.ccAjustesSinDecision(decidido, "c", HOY);
      assert("«" + id + "» con " + coste + " € y deshacer: vuelve exactamente lo de antes, con el coste",
        json(vuelta) === json(partida), { decidido, vuelta });
    }
    const spam = S.ccAjustesConDecision(partida, compra, "spam", null, HOY);
    assert("«🚫 Es spam» con " + coste + " € y «↩ Quitar del spam» en 📒: también", json(S.txAjustesSinSpam(spam, "c", HOY)) === json(partida));
  }
  const sinCoste = { c: { revisar: true, nota: "Mandado a revisar por ti (2026-09-30): ver" } };
  const neutro = S.ccAjustesConDecision(sinCoste, compra, "neutro", null, HOY);
  assert("sin coste, la nota es la de siempre y deshacer no pone coste",
    !/coste/.test(neutro.c.nota) && json(S.ccAjustesSinDecision(neutro, "c", HOY)) === json(sinCoste), neutro.c.nota);
  assert("la nota de la decisión lo dice en llano y sin €",
    S.ccAjustesConDecision({ c: { revisar: true, nota: "Mandado a revisar por ti (2026-09-30): ver", coste_eur: 250 } }, compra, "neutro", null, HOY).c.nota ===
    "Decidido por ti en Revisión (2026-10-02): movimiento neutro [antes: mandado a revisar (2026-09-30), coste 250,00 EUR: ver]");
}

console.log("== A2. Con un coste de «💶 Coste…», «Mandar a revisar» de 📒 funciona y lo conserva ==");
{
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js",
    "18-transacciones.js", "20-coste-compras.js"]);
  const HOY = "2026-10-02T10:00:00.000Z";
  const compra = { clave: "c", categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", cantidad: 2,
    coste_eur: 250, fuente: "ONCHAIN", revisar: false };
  const propio = { c: { coste_eur: 250, nota: "Coste puesto por ti (2026-10-01)" } };
  assert("📒: con un coste tuyo, el 🔍 está libre (antes «Ya tiene un ajuste»)", S.txEstadoRevisar(compra, propio) === "libre");
  const mandado = S.txAjustesConRevisar(propio, "c", "comprobar", HOY);
  assert("mandarlo a revisar lleva el coste dentro",
    JSON.stringify(mandado) === JSON.stringify({ c: { revisar: true, nota: "Mandado a revisar por ti (2026-10-02): comprobar", coste_eur: 250 } }), mandado);
  const quitado = S.txAjustesSinRevisar(mandado, "c", HOY);
  assert("«↩ Quitar de revisar» devuelve el coste como de «💶 Coste…»",
    quitado.c.coste_eur === 250 && S.cbEstadoCoste(compra, quitado) === "propio", quitado);
  const ajeno = { c: { coste_eur: 250, nota: "ajuste a mano" } };
  let error = "";
  try { S.txAjustesConRevisar(ajeno, "c", "", HOY); } catch (e) { error = e.message; }
  assert("un ajuste de otro origen sigue sin pisarse", S.txEstadoRevisar(compra, ajeno) === "ajeno" && /ajuste manual/.test(error));
}

/* Datos de los vínculos: dos ventas de un inmueble y
   tres cobros, y lo que hace el formulario al crear o ampliar un vínculo. */
function datosVinculos() {
  const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
    "14-clasificador.js", "15-correcciones.js"]);
  const USDC = vm.runInContext("USDC", S), P1 = "0x" + "a1".repeat(20);
  const W = "0x" + "e1".repeat(20), T = "0x" + "e9".repeat(20);
  const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
  const reg = (hash, contrato, origen, destino, cantidad, categoria, clave) => ({
    clave, fecha: "2026-05-12 09:45:46", hash, contrato, token: null, simbolo: "P", cantidad, categoria,
    subcategoria: "PENDIENTE", inmueble: null, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen, destino, fuente: "ONCHAIN", nota: "", revisar: categoria === "REVISAR" });
  const tx = (hash, contrato, from, to, value, dec) => ({ hash, contractAddress: contrato, from, to, value,
    tokenDecimal: dec, timeStamp: "1778556800" });
  const cache = { catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba" } },
    contratos_aprendidos: {}, ajustes_usuario: {}, pagos_diferidos: { version: 1, ventas: [] },
    transacciones: { wallet_tokens: [
      tx(H(1), P1, W, T, "250000000000000000000", "18"), tx(H(2), USDC, T, W, "300000000", "6"),
      tx(H(5), P1, W, T, "10000000000000000000", "18"), tx(H(6), USDC, T, W, "50000000", "6"),
      tx(H(7), USDC, T, W, "70000000", "6")],
      vault_tokens: [], wallet_normales: [], wallet_internas: [], vault_normales: [] } };
  const SA = reg(H(1), P1, W, T, 250, "REVISAR", "sa"), CA = reg(H(2), USDC, T, W, 300, "DEPOSITO", "ca");
  const SB = reg(H(5), P1, W, T, 10, "REVISAR", "sb"), CC = reg(H(6), USDC, T, W, 50, "DEPOSITO", "cc");
  const CD = reg(H(7), USDC, T, W, 70, "DEPOSITO", "cd");
  const ref = r => S.ccReferenciaDeRegistro(r, cache);
  const formulario = (regs, ventas, s, c, cant) => {
    const borrador = S.ccBorradorVenta({ salida: s, cobro: c, refSalida: ref(s), refCobro: ref(c), cantidadAsignada: cant,
      estadoLiquidacion: "COMPLETA", importeEsperado: null, monedaEsperada: "USD", nota: "" });
    const esc = S.ccAplicarBorradorABloque(ventas, { borrador, refSalida: ref(s), conservarVenta: true });
    const base = S.ccSimularBloque(regs, cache, ventas);
    const sim = S.ccSoloLoNuevo(S.ccSimularBloque(regs, cache, esc.ventas), base, esc.ventaId);
    return { esc, val: S.ccValidacionBorrador({ regSalida: s, regCobro: c, cantidadOk: true, dupCobro: false, sim, ventaId: esc.ventaId }) };
  };
  return { S, SA, CA, SB, CC, CD, ref, formulario };
}

console.log("== A5. Un null o un texto en los cobros de OTRO vínculo no impide guardar uno nuevo ==");
{
  const { S, SA, CA, SB, CC, ref, formulario } = datosVinculos();
  for (const raro of [null, "x"]) {
    const otra = { id: "pd_001", estado: "CONFIRMADO", estado_liquidacion: "COMPLETA", nota: "", salida: ref(SB),
      asignaciones: [raro, { id: "as_001", pago: ref(CC), cantidad_asignada: 50 }] };
    const f = formulario([SA, CA, SB, CC], [otra], SA, CA, 300);
    assert("con " + JSON.stringify(raro) + " en el otro vínculo: el nuevo se puede guardar", f.val.ok, f.val.motivos);
    assert("…y el otro vínculo se guarda como estaba", JSON.stringify(f.esc.ventas[0].asignaciones[0]) === JSON.stringify(raro));
  }
  const propia = { id: "pd_001", estado: "CONFIRMADO", estado_liquidacion: "COMPLETA", nota: "", salida: ref(SA),
    asignaciones: [null, { id: "as_001", pago: ref(CA), cantidad_asignada: 300 }] };
  let ed, error = null;
  try { ed = S.ccEditarVenta([propia], { ventaId: "pd_001", asignaciones: [{ asignacionId: "as_001", cantidadAsignada: 250 }], nota: "" }); }
  catch (e) { error = e.message; }
  assert("editar un vínculo con un null entre sus cobros: no lanza, cambia la parte y deja el null",
    !error && ed[0].asignaciones[0] === null && ed[0].asignaciones[1].cantidad_asignada === 250, error || ed);
}

console.log("== A6. Ampliar un vínculo con un problema en uno de sus cobros: el formulario dice cuál ==");
{
  const { S, SA, CA, CC, CD, ref, formulario } = datosVinculos();
  const casos = [
    ["un cobro que ya no está", { id: "as_001", pago: ref(CC), cantidad_asignada: 50 }, [SA, CA, CD]],
    ["una cantidad escrita como texto", { id: "as_001", pago: ref(CC), cantidad_asignada: "50" }, [SA, CA, CC, CD]],
  ];
  for (const [nombre, asig, regs] of casos) {
    const venta = { id: "pd_001", estado: "CONFIRMADO", estado_liquidacion: "COMPLETA", nota: "", salida: ref(SA), asignaciones: [asig] };
    const f = formulario(regs, [venta], SA, CD, 70);
    assert("con " + nombre + ": no se guarda y el motivo es el de su cobro, no «revisa los datos»",
      f.esc.ventaId === "pd_001" && !f.val.ok && f.val.motivos.length > 0 && !f.val.motivos.some(m => /^venta |asignacion/.test(m)) && // en llano
      !f.val.motivos.includes("Este vínculo no se puede aplicar: revisa los datos."), f.val.motivos);
  }
  assert("el formato del cobro, solo para esa venta",
    S.ccProblemaDeVenta("venta pd_1, asignacion as_001: x", "pd_1") && !S.ccProblemaDeVenta("venta pd_10, asignacion as_001: x", "pd_1"));
}

console.log("== A13. Sincronizar usa la misma regla de direcciones que el paso 1 y la clasificación ==");
{
  const S = sandboxConDom(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "04-config.js"]);
  const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20);
  const problemas = cfg => JSON.parse(vm.runInContext("state.config = " + JSON.stringify(cfg) +
    "; JSON.stringify(configValidaParaSincronizar())", S));
  const casos = [{ wallet: W }, { wallet: W, vault: V }, { wallet: W, vault: "" }, { wallet: "0x12" },
    { wallet: W, vault: "0xabc" }, { wallet: "" }, { wallet: "0x12", vault: "0xabc" }];
  assert("con la API key, sincroniza exactamente cuando las direcciones valen (direccionesConfigOk)",
    casos.every(c => (problemas(Object.assign({ etherscan_api_key: "K" }, c)).length === 0) === S.direccionesConfigOk(c)),
    casos.map(c => problemas(Object.assign({ etherscan_api_key: "K" }, c))));
  assert("y dice cuál falta",
    JSON.stringify(problemas({ etherscan_api_key: "K", wallet: "0x12", vault: "0xabc" })) ===
    JSON.stringify(["wallet bien escrita (0x y 40 caracteres)", "vault bien escrito (0x y 40 caracteres) o vacío"]));
}

/* Un config.json que no es una config se rechaza con su motivo. Se abre
   con «📂 Abrir copia» (js/19, arrTipoArchivo); aquí, la regla
   (motivoConfigNoValida) y que uno de verdad se carga con la key que tenías. */
async function probarR9() {
  console.log("== R9. Un config.json que no es una config ==");
  const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20);
  const campos = { cfgEthKey: "KEY-ESCRITA", cfgWallet: W, cfgVault: V, cfgNombre: "Ana", cfgNif: "123X" };
  const S = sandboxConDom(["01-constantes.js", "02-utilidades.js", "05-cache.js", "14-clasificador.js", "04-config.js"], campos,
    { localStorage: { setItem: () => {} } });
  const avisos = [];
  S.toast = (m, t) => avisos.push([m, t]);
  vm.runInContext("log = function () {}; state.config = { wallet: '" + W + "', vault: '" + V + "', etherscan_api_key: 'KEY-ESCRITA' };", S);
  const cache = vm.runInContext("cacheVacia()", S);
  for (const [nombre, obj, texto] of [["una lista", [1, 2], /no es un config\.json/], ["un número", 5, /no es un config\.json/],
    ["null", null, /no es un config\.json/], ["tu cache", cache, /es tu archivo de la app/],
    ["un objeto sin nada de config", { hola: 1 }, /no trae wallet/], ["una wallet que no es texto", { wallet: 5 }, /«wallet» no es un texto/]]) {
    assert(nombre + ": se rechaza con su motivo", texto.test(S.motivoConfigNoValida(obj) || ""), S.motivoConfigNoValida(obj));
  }
  S.__obj = { wallet: V, vault: "", compra_bancaria_coste_eur_por_token: 100 };
  vm.runInContext("usarConfigAbierta(__obj)", S);
  const c = vm.runInContext("state.config", S);
  assert("un config.json de verdad se sigue cargando (con la key que tenías)",
    c.wallet === V && c.etherscan_api_key === "KEY-ESCRITA" && avisos[0][1] === "ok", { c, avisos });
  // Una plantilla sin datos (como config.ejemplo.json), escrita aquí.
  const ejemplo = { etherscan_api_key: "TU-CLAVE-API-DE-ETHERSCAN-AQUI", coingecko_api_key: "",
    wallet: "0xTU_DIRECCION_DE_WALLET_AQUI", vault: "0xDIRECCION_DEL_VAULT_DE_REENTAL_AQUI",
    inversor: { nombre: "Nombre y apellidos", nif: "12345678A" }, compra_bancaria_coste_eur_por_token: 100.0,
    fecha_adquisicion_token: null, retencion_irpf_pct: 19 };
  assert("la plantilla de config vale", S.motivoConfigNoValida(ejemplo) === null);
}

(async () => {
  await probarR9();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
