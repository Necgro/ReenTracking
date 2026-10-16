/* Test de los arreglos de la zona «clasificación». La paridad de la
 * clasificación entera está en tests/paridad_clasificacion_paso_arreglos8.js;
 * aquí va lo que
 * solo tiene la app y lo que conviene ver también por este lado:
 *
 * - A4  La app guarda el sello de cada ajuste (origen, destino y cantidad
 *       de su movimiento) y, si al reclasificar su movimiento cambia de
 *       clave, lo pasa a la clave nueva; el que se queda sin movimiento y
 *       ocupa esa clave se aparta a una libre (no se borra).
 * - A5  El vault no puede ser la wallet; si la wallet o el vault cambian,
 *       lo descargado para la dirección vieja se vacía y se pide otra vez
 *       desde el principio, y 🚀 Puesta en marcha lo avisa.
 * - A7  Un estado del catálogo con una errata sale «con dudas» en el
 *       catálogo de 🔍 Revisión, con sus botones (no cuenta como inmueble).
 * - A9  Un token «con dudas» o descartado (p. ej. el recibo de un pool) se
 *       puede añadir como contrato en 🔍 Revisión y sale del catálogo; un
 *       inmueble confirmado, no.
 * - A22 «Ajustes en JSON» no acepta una nota que no sea un texto.
 * - A18 Guardar una decisión en 🔍 Revisión (o mandar algo al spam) no
 *       apila los avisos de la clasificación («Clasificación completada»,
 *       tokens con dudas); los de lo que falta para clasificar, sí.
 * - A19 El gas vacío o en hexadecimal queda a revisar (no 0 ni leído en
 *       hexadecimal sin revisar).
 * - A20 Unos decimales absurdos no se leen (ni Infinity ni NaN).
 * - A21 La cantidad, con un solo redondeo.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz):
 *     node tests/test_arreglos_paso_arreglos8.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
let ok = 0, fallos = 0;
function assert(nombre, cond, detalle) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.log("  FALLO " + nombre + (detalle !== undefined ? " -> " + JSON.stringify(detalle) : "")); }
}

/* La app en un vm con los módulos que se pidan; document de mentira para
   marcarCacheDirty (botón «Guardar cache»). */
function nuevo(modulos) {
  const sb = { console, URLSearchParams, URL };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of modulos || ["01-constantes.js", "02-utilidades.js", "05-cache.js",
                              "10-csv-descubrimiento.js", "14-clasificador.js"]) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  }
  vm.runInContext(`log = function () {}; __toasts = []; toast = function (m, t) { __toasts.push([t, m]); };
    document = { getElementById() { return { disabled: false, classList: { add() {}, remove() {} } }; } };`, sb);
  return sb;
}
const W = "0x" + "ab".repeat(20), EXCH = "0x" + "24".repeat(20);
const H = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);

console.log("A19 · gas raro a revisar");
{
  const sb = nuevo();
  sb.__cache = {
    transacciones: {
      wallet_normales: [
        { hash: H(42), timeStamp: "1720000042", from: W, to: EXCH, value: "0", gasUsed: "", gasPrice: "30000000000", isError: "0" },
        { hash: H(43), timeStamp: "1720000043", from: W, to: EXCH, value: "0", gasUsed: "21000", gasPrice: "0x6fc23ac00", isError: "0" },
        { hash: H(44), timeStamp: "1720000044", from: W, to: EXCH, value: "0", gasUsed: "21000", gasPrice: "30000000000", isError: "0" },
      ],
    },
  };
  const regs = vm.runInContext(`
    state.config = { wallet: "${W}", vault: "" };
    clasificarTransacciones(asegurarEstructuraCache(__cache), [], {}, state.config, {});`, sb);
  const gas = h => regs.find(r => r.clave === h + "::gas");
  assert("gas vacío: sin cantidad y a revisar", gas(H(42)).cantidad === null && gas(H(42)).revisar === true, gas(H(42)));
  assert("gas en hexadecimal: sin cantidad y a revisar", gas(H(43)).cantidad === null && gas(H(43)).revisar === true, gas(H(43)));
  assert("gas normal: 0,00063 POL sin revisar", gas(H(44)).cantidad === 0.00063 && gas(H(44)).revisar === false, gas(H(44)));
}

console.log("A4 · el ajuste sigue a su movimiento");
{
  const sb = nuevo();
  const U1 = "0x" + "22".repeat(20), U2 = "0x" + "23".repeat(20), PT = "0x" + "18".repeat(20);
  const USDT = vm.runInContext("USDT", sb);
  const tx = (ca, de, a, valor, nombre, simbolo, dec) => ({ hash: H(65), timeStamp: "1720000065",
    contractAddress: ca, from: de, to: a, value: String(valor), tokenName: nombre, tokenSymbol: simbolo, tokenDecimal: String(dec) });
  const base = H(65) + "::" + USDT;
  sb.__cache = {
    transacciones: { wallet_tokens: [
      tx(USDT, W, U1, 200000000, "Tether USD", "USDT", 6),
      tx(USDT, U2, W, 50000000, "Tether USD", "USDT", 6),
      tx(PT, U1, W, "2000000000000000000", "Torre Azul", "TAZ", 18)] },
    // Una decisión de antes, sin sello: sigue por su clave (no se sella).
    ajustes_usuario: { [H(91) + "::x"]: { nota: "de antes" } },
  };
  vm.runInContext(`
    state.config = { wallet: "${W}", vault: "", compra_bancaria_coste_eur_por_token: 100 };
    state.cache = asegurarEstructuraCache(__cache);
    state.filasCsv = []; state.indicePorHash = {}; state.csvCargado = true;
    requisitosClasificacionOk = () => ({ cacheOk: true, csvOk: true, configOk: true });
    ejecutarClasificacion({ silencioso: true, detalle: false });`, sb);
  // El usuario decide la retirada y el depósito con el token aún con dudas.
  sb.__nuevos = {
    [base]: { categoria: "MOVIMIENTO", subcategoria: "NEUTRO", revisar: false, nota: "a mi exchange" },
    [base + "::2"]: { nota: "devolucion de un amigo" },
  };
  vm.runInContext("Object.assign(state.cache.ajustes_usuario, __nuevos); marcarCacheDirty();", sb);
  const sellos = vm.runInContext("state.cache.ajustes_movimiento", sb);
  assert("sella cada decisión nueva con su movimiento",
    sellos && sellos[base].cantidad === 200 && sellos[base].destino === U1 && sellos[base + "::2"].cantidad === 50, sellos);
  assert("una decisión de antes, sin sello, no se sella (la cache solo cambia en lo que tocas)",
    !(H(91) + "::x" in sellos));
  // Se confirma el token: la compra se come la retirada de 200.
  vm.runInContext(`state.cache.catalogo_propiedades["${PT}"] = { nombre_etherscan: "Torre Azul", estado: "CONFIRMADA" };
    ejecutarClasificacion({ silencioso: true, detalle: false });`, sb);
  const regs = vm.runInContext("state.registros", sb);
  const dep = regs.find(r => r.clave === base);
  assert("el depósito de 50 conserva su ajuste y no hereda el de la retirada",
    dep && dep.cantidad === 50 && dep.categoria === "DEPOSITO" && /devolucion/.test(dep.nota) && !/a mi exchange/.test(dep.nota), dep);
  const aj = vm.runInContext("state.cache.ajustes_usuario", sb);
  assert("la decisión del depósito pasa a su clave nueva", aj[base] && /devolucion/.test(aj[base].nota), aj);
  const apartada = Object.keys(aj).find(k => k.endsWith("::100"));
  assert("la de la retirada se aparta a una clave libre, sin borrarse",
    apartada && aj[apartada].nota === "a mi exchange" && !aj[base + "::2"], Object.keys(aj));
  const s2 = vm.runInContext("state.cache.ajustes_movimiento", sb);
  assert("los sellos van con sus ajustes", s2 && s2[base]?.cantidad === 50 && s2[apartada]?.cantidad === 200, s2);
  // Reclasificar otra vez no cambia nada más.
  const antes = JSON.stringify(aj);
  vm.runInContext("ejecutarClasificacion({ silencioso: true, detalle: false });", sb);
  assert("reclasificar otra vez deja los ajustes igual",
    JSON.stringify(vm.runInContext("state.cache.ajustes_usuario", sb)) === antes);
  // Si el token vuelve a estar con dudas, la retirada vuelve a su ajuste.
  vm.runInContext(`state.cache.catalogo_propiedades["${PT}"].estado = "CANDIDATA";
    ejecutarClasificacion({ silencioso: true, detalle: false });`, sb);
  const r3 = vm.runInContext("state.registros", sb);
  const ret = r3.find(r => r.cantidad === 200 && r.contrato === USDT);
  assert("si la retirada vuelve, su ajuste vuelve a ella", ret && ret.categoria === "MOVIMIENTO" && ret.clave === base, ret);
  assert("y el depósito sigue con el suyo", r3.find(r => r.cantidad === 50 && /devolucion/.test(r.nota)));
}

console.log("A7 · un estado con errata sale con dudas en el catálogo");
{
  const sb = nuevo(["01-constantes.js", "02-utilidades.js", "05-cache.js", "14-clasificador.js", "11-panel.js"]);
  const e = x => sb.estadoCatalogo(x);
  assert("los estados se leen sin mayúsculas ni espacios",
    e({ estado: " descartada " }) === "DESCARTADA" && e({ estado: "CONFIRMADA " }) === "CONFIRMADA" && e({}) === "CONFIRMADA");
  assert("uno que no se entiende, o una entrada que no es un objeto, con dudas",
    e({ estado: "DESCARTADO" }) === "CANDIDATA" && e("CONFIRMADA") === "CANDIDATA" && e(null) === "CANDIDATA");
  const cache = sb.cacheVacia();
  cache.catalogo_propiedades["0x" + "19".repeat(20)] = { nombre_etherscan: "Free Claim", estado: "DESCARTADO" };
  const lista = sb.pnFilasVisibles(sb.pnFilasCatalogo(cache));
  const fila = lista.find(f => f.addr === "0x" + "19".repeat(20));
  assert("sale en la lista, con dudas y sus botones", fila && fila.estado === "CANDIDATA", lista);
  assert("no cuenta como inmueble", Object.keys(sb.inmueblesConfirmadosCache(cache)).length === 0);
}

console.log("A18 · una decisión no apila los avisos de la clasificación");
(async () => {
  const sb = nuevo(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
                    "14-clasificador.js", "15-correcciones.js"]);
  const cache = sb.cacheVacia();
  cache.transacciones.wallet_tokens.push({ hash: H(90), timeStamp: "1720000090", contractAddress: "0x" + "5d".repeat(20),
    from: "0x" + "22".repeat(20), to: W, value: "5000000000000000000", tokenName: "Mystery", tokenSymbol: "MYS", tokenDecimal: "18" });
  sb.__cache = cache;
  vm.runInContext(`state.cache = __cache; state.config = { wallet: "${W}", vault: "", compra_bancaria_coste_eur_por_token: 100 };
    state.filasCsv = []; state.indicePorHash = {}; state.csvCargado = true;
    requisitosClasificacionOk = () => ({ cacheOk: true, csvOk: true, configOk: true });
    renderPanel = () => {};`, sb);
  await sb.ccGuardarYReclasificar();
  const avisos = vm.runInContext("__toasts", sb);
  assert("sin «Clasificación completada» ni «tokens con dudas»", avisos.length === 0, avisos);
  vm.runInContext("__toasts.length = 0; requisitosClasificacionOk = () => ({ cacheOk: true, csvOk: false, configOk: true });", sb);
  await sb.ccGuardarYReclasificar();
  const falta = vm.runInContext("__toasts", sb);
  assert("lo que falta para clasificar sí se avisa", falta.some(([, m]) => /archivo de rendimientos/.test(m)), falta);
})().then(() => {

console.log("A22 · «Ajustes en JSON» pide la nota como texto");
{
  const sb = nuevo(["01-constantes.js", "02-utilidades.js", "05-cache.js", "14-clasificador.js"]);
  assert("una nota numérica se rechaza", /texto/.test(sb.errorAjustesUsuario({ a: { nota: 5 } })));
  assert("null también", /texto/.test(sb.errorAjustesUsuario({ a: { nota: null } })));
  assert("un texto vale", sb.errorAjustesUsuario({ a: { nota: "x", revisar: true } }) === "");
}

console.log("A9 · añadir como contrato un token con dudas");
(async () => {
  const sb = nuevo(["01-constantes.js", "02-utilidades.js", "05-cache.js", "14-clasificador.js", "11-panel.js"]);
  const POOL = "0x" + "5a".repeat(20), CONF = "0x" + "5b".repeat(20), DESC = "0x" + "5c".repeat(20);
  const cache = sb.cacheVacia();
  cache.catalogo_propiedades[POOL] = { nombre_etherscan: "Uniswap V2", estado: "CANDIDATA" };
  cache.catalogo_propiedades[CONF] = { nombre_reental: "Cáceres 8", estado: "CONFIRMADA" };
  cache.catalogo_propiedades[DESC] = { nombre_etherscan: "LP", estado: "DESCARTADA" };
  const v = sb.pnValidarContrato(cache, POOL, "Pool RNT/USDT", "DEFI_POOL");
  assert("con dudas: se puede añadir y sale del catálogo", !v.error && v.quitarDelCatalogo.join() === POOL, v);
  assert("descartado: también", !sb.pnValidarContrato(cache, DESC, "LP", "DEFI_POOL").error);
  assert("un inmueble confirmado, no", /catálogo/.test(sb.pnValidarContrato(cache, CONF, "x", "DEFI_POOL").error || ""));
  // «Infraestructura» ya no se elige al añadir (las que hay se quitan con ✕).
  assert("«Infraestructura», ya no se elige", /Elige un tipo/.test(sb.pnValidarContrato(cache, DESC, "x", "INFRAESTRUCTURA").error || "") &&
    sb.pnContratoQuitable("INFRAESTRUCTURA"));
  // El botón «Añadir»: guarda el contrato y quita la entrada del catálogo.
  const campos = { inpContratoDir: { value: POOL }, inpContratoNombre: { value: "Pool RNT/USDT" }, selContratoTipo: { value: "DEFI_POOL" } };
  sb.__campos = campos;
  sb.__cache = cache;
  vm.runInContext(`document = { getElementById(id) { return __campos[id] || { disabled: false, classList: { add() {}, remove() {} } }; } };
    state.cache = __cache; state.config = { wallet: "${W}", vault: "" };
    pnGuardarYClasificar = async () => {};`, sb);
  await sb["pnAñadirContrato"]();
  assert("al añadirlo: es un pool y ya no está en el catálogo",
    cache.contratos_aprendidos.DEFI_POOL[POOL] === "Pool RNT/USDT" && !(POOL in cache.catalogo_propiedades), cache.catalogo_propiedades);
})().then(() => {

console.log("A5 · el vault no es la wallet y una dirección nueva se descarga entera");
(async () => {
  const sb = nuevo(["01-constantes.js", "02-utilidades.js", "05-cache.js", "06-etherscan.js", "14-clasificador.js"]);
  const V = "0x" + "cd".repeat(20), OTRA = "0x" + "ef".repeat(20);
  const cfg = { wallet: W, vault: W.toUpperCase().replace("0X", "0x"), compra_bancaria_coste_eur_por_token: 100 };
  assert("vault igual a la wallet: no vale", sb.vaultMalEscrito(cfg) === true && sb.direccionesConfigOk(cfg) === false);
  assert("y el aviso lo dice", /misma wallet/.test(sb.motivoConfigMal(cfg)), sb.motivoConfigMal(cfg));
  assert("un vault distinto sí vale", sb.direccionesConfigOk({ wallet: W, vault: V }) === true);
  const pedidas = [];
  sb.sleep = async () => {};
  sb.fetch = async url => {
    const p = new URL(url).searchParams;
    pedidas.push([p.get("address"), p.get("action"), +p.get("startblock")]);
    return { json: async () => ({ status: "1", message: "OK",
      result: [{ blockNumber: "900", hash: "0x" + p.get("action"), from: p.get("address") }] }) };
  };
  const cache = sb.cacheVacia();
  await sb.actualizarTransacciones(cache, "k", W, V);
  assert("guarda para qué direcciones se descargó",
    cache.direcciones_descargadas && cache.direcciones_descargadas.wallet === W && cache.direcciones_descargadas.vault === V,
    cache.direcciones_descargadas);
  assert("con las mismas, nada cambiado", sb.direccionesCambiadas(cache, W, V).length === 0);
  assert("con otra wallet, la wallet cambió", sb.direccionesCambiadas(cache, OTRA, V).join() === "wallet");
  assert("un vault quitado no cuenta", sb.direccionesCambiadas(cache, W, "").length === 0);
  pedidas.length = 0;
  await sb.actualizarTransacciones(cache, "k", OTRA, V);
  assert("la wallet nueva se pide desde el bloque 0",
    pedidas.some(([a, ac, b]) => a === OTRA && ac === "tokentx" && b === 0), pedidas);
  assert("el vault, desde el suyo", pedidas.some(([a, ac, b]) => a === V && ac === "tokentx" && b === 901), pedidas);
  assert("lo de la wallet vieja ya no está",
    cache.transacciones.wallet_tokens.length === 1 && cache.transacciones.wallet_tokens[0].from === OTRA,
    cache.transacciones.wallet_tokens);
  assert("y queda apuntada la nueva", cache.direcciones_descargadas.wallet === OTRA);
})().then(() => {

console.log("A20 y A21 · leer los enteros de la blockchain");
{
  const sb = nuevo(["01-constantes.js", "02-utilidades.js"]);
  const u = (v, d) => sb.enteroAUnidades(v, d);
  assert("decimales -400: no se lee (antes Infinity)", u("5", "-400") === null);
  assert("decimales «abc»: no se lee (antes NaN)", u("5", "abc") === null);
  assert("decimales 256: no se lee", u("5", 256) === null);
  assert("valor «1_000»: no se lee", u("1_000", 0) === null);
  assert("valor de 400 cifras: no se lee", u("9".repeat(400), 0) === null);
  assert("con signo y espacios: 1,5", u(" +1500000 ", " 6 ") === 1.5);
  assert("negativo: -1,5", u("-1500000", 6) === -1.5);
  assert("cero: 0", u("0", 18) === 0);
  assert("18 decimales con un solo redondeo (antes ...373)",
    u("58377506870913721280270", 18) === 58377.50687091372, u("58377506870913721280270", 18));
  assert("gas 500000 × 987654321987 (antes ...50005)",
    u(500000n * 987654321987n, 18) === 0.4938271609935, u(500000n * 987654321987n, 18));
}

console.log("");
console.log(fallos ? `RESULTADO: ${ok} OK, ${fallos} FALLO(S)` : `RESULTADO: ${ok}/${ok} — todo en verde`);
process.exit(fallos ? 1 : 0);
});
});
});
