/* Test unitario de los pagos diferidos: aplicar los vinculos.
 *
 * Funcion bajo prueba: aplicarPagosDiferidos (insertada en
 * clasificarTransacciones entre la ordenacion y aplicarAjustesUsuario).
 *
 * Comprobaciones:
 * - Cache sintetica 1 salida + 1 cobro vinculados -> salida VENTA con importe,
 *   cobro DEPOSITO sin revisar.
 * - Con bloque vacio -> identico a no tenerlo (registros intactos + E2E).
 * - Idempotencia: 2 ejecuciones -> mismo resultado.
 *
 * DATOS 100% SINTETICOS (la unica direccion real es la constante publica
 * USDC de la SPA, necesaria para que STABLECOINS reconozca la stablecoin).
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/test_pagos_diferidos_paso_23.js
 */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {}, log: () => {}, toast: () => {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js",
                 "14-clasificador.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox,
                  { filename: f });
}
const { aplicarPagosDiferidos, validarPagosDiferidos, clasificarTransacciones,
        cacheVacia } = sandbox;
// Los `const` de nivel superior del contexto VM no son propiedades del sandbox:
const USDC = vm.runInContext("USDC", sandbox);

// -------------------------------------------------------------------------
// Datos sinteticos
// -------------------------------------------------------------------------
const HASH_SALIDA_1 = "0x" + "a1".repeat(32);
const HASH_SALIDA_2 = "0x" + "a2".repeat(32);
const HASH_PAGO = "0x" + "b1".repeat(32);
const PROP = "0x" + "c1".repeat(20);     // contrato de propiedad sintetico
const WALLET = "0x" + "e1".repeat(20);   // direccion propia (state.config)
const VAULT = "0x" + "e2".repeat(20);    // vault (state.config)
const RECEPTOR = "0x" + "f1".repeat(20); // receptor de la salida (desconocida)
const TERCERO = "0x" + "11".repeat(20);  // origen del cobro (desconocida)

const DEC_PROP = 18;
const DEC_USDC = 6;
const TS_SALIDA = Date.UTC(2026, 4, 12, 10, 13, 41) / 1000;
const TS_PAGO = Date.UTC(2026, 4, 20, 12, 0, 0) / 1000;

const raw = (unidades, decimales) =>
  BigInt(Math.trunc(unidades * Math.pow(10, decimales))).toString();

function referencia(hash, contrato, origen, destino, unidades, decimales) {
  return { cadena: 137, hash, contrato, origen, destino,
           valor_raw: raw(unidades, decimales), decimales };
}
function asignacion(aid, pagoRef, cantidad, activo = "USDC") {
  return { id: aid, pago: pagoRef, activo, cantidad_asignada: cantidad,
           nota: "", creado: "2026-09-25T10:00:00", modificado: null };
}
function venta(vid, salidaRef, asignaciones,
               { estado = "CONFIRMADO", estado_liquidacion = "COMPLETA",
                 ...extra } = {}) {
  return Object.assign({
    id: vid, salida: salidaRef, cantidad_tokens: 500.0,
    propiedad: "Prueba 1", importe_esperado_usd: null,
    moneda_esperada: "USD", estado_liquidacion,
    estado, nota: "",
    creado: "2026-09-25T10:00:00", modificado: null,
    anulado: null, asignaciones,
  }, extra);
}
const bloque = (...vs) => ({ version: 1, ventas: [...vs] });

function registro(hash, contrato, origen, destino, cantidad, categoria,
                  { subcategoria = "PENDIENTE", revisar = false, nota = "",
                    simbolo = null, importe_usdt = null, clave = null,
                    fecha = "2026-05-12 10:13:41" } = {}) {
  return {
    clave: clave || `${hash}::${contrato}`,
    fecha, hash: hash.toLowerCase(), contrato: contrato.toLowerCase(),
    token: null, simbolo, cantidad,
    categoria, subcategoria,
    inmueble: null, periodo_fiscal: null,
    importe_usdt, coste_eur: null, via_compra: null,
    origen: origen.toLowerCase(), destino: destino.toLowerCase(),
    fuente: "ONCHAIN", nota, revisar,
  };
}

function escenarioRegistros() {
  // 1 salida REVISAR (motivo real del clasificador) + 1 cobro DEPOSITO
  const salida = registro(HASH_SALIDA_1, PROP, WALLET, RECEPTOR, 500.0,
                          "REVISAR", { revisar: true, simbolo: "P1",
    nota: "envío de tokens de un inmueble sin contraprestación en el hash" });
  salida.inmueble = "Prueba 1";
  const cobro = registro(HASH_PAGO, USDC, TERCERO, WALLET, 1000.0, "DEPOSITO",
                         { subcategoria: "COSTE_BASE", simbolo: "USDC",
                           importe_usdt: 1000.0, fecha: "2026-05-20 12:00:00",
                           nota: "verificar origen (venta P2P, bridge o exchange)" });
  return [salida, cobro];
}
const refSalida1 = () => referencia(HASH_SALIDA_1, PROP, WALLET, RECEPTOR, 500.0, DEC_PROP);
const refPago = () => referencia(HASH_PAGO, USDC, TERCERO, WALLET, 1000.0, DEC_USDC);
const cacheMinima = (bloquePd = null, ajustes = null) =>
  ({ pagos_diferidos: bloquePd !== null && bloquePd !== undefined ? bloquePd : {},
     ajustes_usuario: ajustes || {} });

function deepCopy(x) { return JSON.parse(JSON.stringify(x)); }
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual(a[k], b[k]));
}

function huella(registros) {
  const lineas = [...registros]
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "") ||
                    String(a.clave).localeCompare(String(b.clave)))
    .map(r => [
      r.clave, r.hash, r.contrato, r.fecha, r.categoria, r.subcategoria,
      typeof r.cantidad === "number" ? r.cantidad.toFixed(6) : "None",
      r.importe_usdt, r.revisar, r.nota,
      r.pago_diferido === undefined ? "None" : JSON.stringify(r.pago_diferido),
    ].join("|"));
  return crypto.createHash("sha256").update(lineas.join("\n"), "utf8").digest("hex");
}

// -------------------------------------------------------------------------
// Mini-arnes
// -------------------------------------------------------------------------
let total = 0, fallos = 0;
function ok(nombre, cond, extra) {
  total++;
  if (cond) console.log("  OK   " + nombre);
  else { fallos++; console.log("  FAIL " + nombre + (extra !== undefined ? " → " + JSON.stringify(extra) : "")); }
}
function aplicar(blk, regs = null, ajustes = null) {
  regs = regs !== null ? regs : escenarioRegistros();
  const info = aplicarPagosDiferidos(regs, cacheMinima(blk, ajustes));
  return [regs, info];
}

// =========================================================================
console.log("1) Efectos sobre registros sinteticos (llamada directa)");

// --- Comprobacion principal ---
{
  const [regs, info] = aplicar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 1000.0)])));
  const [salida, cobro] = regs;
  ok("salida → VENTA/GPP_INMUEBLE con importe y sin revisar",
     salida.categoria === "VENTA" && salida.subcategoria === "GPP_INMUEBLE" &&
     salida.importe_usdt === 1000.0 && salida.revisar === false &&
     deepEqual(salida.pago_diferido, { venta_id: "pd_001", rol: "salida" }) &&
     !salida.nota.includes("sin contraprestación") &&
     salida.nota === "Cobrada aparte el 20/05/2026: 1.000,00 USDC", salida); // nota en llano
  ok("cobro → DEPOSITO/COSTE_BASE sin revisar, importe independiente intacto",
     cobro.categoria === "DEPOSITO" && cobro.subcategoria === "COSTE_BASE" &&
     cobro.revisar === false &&
     deepEqual(cobro.pago_diferido, { venta_id: "pd_001", rol: "pago" }) &&
     cobro.nota === "Pago de la venta de Prueba 1 del 12/05/2026: 1.000,00 USDC" &&
     cobro.importe_usdt === 1000.0, cobro);
  ok("info: 1 aplicado pd_001, sin problemas ni conflictos",
     info.aplicados.map(a => a.venta_id).join() === "pd_001" &&
     info.problemas.length === 0 && info.conflictos.length === 0, info);
}
{
  const [regs] = aplicar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 1000.0)])));
  ok("fechas intactas (salida y cobro conservan su fecha, D1)",
     regs[0].fecha === "2026-05-12 10:13:41" && regs[1].fecha === "2026-05-20 12:00:00");
}

// --- Liquidacion: revisar hasta COMPLETA y derivacion ---
{
  const [regs] = aplicar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 400.0)],
          { estado_liquidacion: "PARCIAL" })));
  const [salida, cobro] = regs;
  ok("liquidacion PARCIAL: salida VENTA/importe 400/revisar",
     salida.categoria === "VENTA" && salida.importe_usdt === 400.0 &&
     salida.revisar === true && salida.nota.includes("aún sin cobrar entera"), salida);
  ok("cobro parcial: conserva categoria, revisar y notas X/Z",
     cobro.categoria === "DEPOSITO" && cobro.revisar === true &&
     cobro.nota === "Pago de la venta de Prueba 1 del 12/05/2026: 400,00 USDC; el resto (600,00 USDC), verificar origen",
     cobro.nota);
}
{
  const [regs, info] = aplicar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 400.0)],
          { estado_liquidacion: "COMPLETA", importe_esperado_usd: 1000.0 })));
  ok("liquidacion DERIVADA del importe esperado → PARCIAL",
     regs[0].revisar === true && info.aplicados[0].liquidacion === "PARCIAL" &&
     regs[0].nota.includes("faltan 600,00 USD por cobrar"), regs[0].nota);

  const [regs2, info2] = aplicar(bloque(
    venta("pd_002", refSalida1(), [asignacion("as_001", refPago(), 1000.0)],
          { estado_liquidacion: "DESCONOCIDA", importe_esperado_usd: 1000.0 })));
  ok("derivada → COMPLETA cuando cubre el importe esperado",
     regs2[0].revisar === false && info2.aplicados[0].liquidacion === "COMPLETA");
}
{
  const [regs] = aplicar(bloque(
    venta("pd_001", refSalida1(), [], { estado_liquidacion: "PARCIAL" })));
  ok("venta sin asignaciones: reconocida con 0 y revisar (D5); cobro intacto",
     regs[0].categoria === "VENTA" && regs[0].importe_usdt === 0.0 &&
     regs[0].revisar === true && regs[1].pago_diferido === undefined, regs);
}

// --- Pago agrupado (1 cobro -> 2 ventas) ---
{
  const salida2 = registro(HASH_SALIDA_2, PROP, WALLET, RECEPTOR, 500.0,
                           "REVISAR", { revisar: true, simbolo: "P1",
    fecha: "2026-05-12 10:18:17",
    nota: "envío de tokens de un inmueble sin contraprestación en el hash" });
  salida2.inmueble = "Prueba 1";
  const regs = [salida2, ...escenarioRegistros()];
  const ref2 = referencia(HASH_SALIDA_2, PROP, WALLET, RECEPTOR, 500.0, DEC_PROP);
  const [, info] = aplicar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 600.0)]),
    venta("pd_002", ref2, [asignacion("as_001", refPago(), 400.0)])
  ), regs);
  ok("pago agrupado: 2 aplicados, marcador con lista, cobro completo",
     info.aplicados.length === 2 &&
     regs[0].categoria === "VENTA" && regs[1].categoria === "VENTA" &&
     regs[2].revisar === false &&
     deepEqual(regs[2].pago_diferido,
               { venta_id: ["pd_001", "pd_002"], rol: "pago" }) &&
     regs[2].nota.startsWith("Pago de las ventas de ") && !regs[2].nota.includes("pd_00"), regs[2]);
}

// --- Motivos ajenos al vinculo se conservan ---
{
  const regs = escenarioRegistros();
  regs[0].nota = "envío de tokens de un inmueble sin contraprestación en el hash; otro motivo pendiente";
  aplicar(bloque(venta("pd_001", refSalida1(),
                       [asignacion("as_001", refPago(), 1000.0)])), regs);
  ok("otros motivos de revisar se conservan (COMPLETA + motivo ajeno)",
     regs[0].revisar === true &&
     regs[0].nota.includes("otro motivo pendiente") &&
     !regs[0].nota.includes("sin contraprestación"), regs[0].nota);
}

// --- Bloque vacio: nada cambia ---
{
  const regs = escenarioRegistros();
  const copia = deepCopy(regs);
  const info = aplicarPagosDiferidos(regs, cacheMinima({}));
  ok("bloque {} no toca nada", deepEqual(regs, copia) &&
     deepEqual(info, { aplicados: [], problemas: [], conflictos: [] }));
  const info2 = aplicarPagosDiferidos(regs, cacheMinima({ version: 1, ventas: [] }));
  ok("bloque {version:1, ventas:[]} no toca nada",
     deepEqual(regs, copia) && info2.aplicados.length === 0);
  const info3 = aplicarPagosDiferidos(regs, {}); // cache antigua sin bloque
  ok("cache antigua sin bloque no toca nada",
     deepEqual(regs, copia) && info3.problemas.length === 0);
}

// --- Vinculos invalidos no se aplican ---
{
  const v = venta("pd_001", refSalida1(),
                  [asignacion("as_001", refPago(), 1500.0)]);
  const regs = escenarioRegistros();
  const copia = deepCopy(regs);
  const info = aplicarPagosDiferidos(regs, cacheMinima(bloque(v)));
  ok("sobreasignacion: nada aplicado + mismos problemas que el validador",
     deepEqual(regs, copia) && info.aplicados.length === 0 &&
     info.problemas.some(p => p.includes("sobreasignacion")) &&
     deepEqual(info.problemas, validarPagosDiferidos(bloque(v), copia)), info.problemas);
}
{
  const v = venta("pd_001", refSalida1(),
                  [asignacion("as_001", refPago(), 1000.0)],
                  { estado: "ANULADO", anulado: "2026-09-25T12:00:00" });
  const regs = escenarioRegistros();
  const copia = deepCopy(regs);
  const info = aplicarPagosDiferidos(regs, cacheMinima(bloque(v)));
  ok("venta ANULADA no se aplica (D6)",
     deepEqual(regs, copia) && info.aplicados.length === 0 &&
     info.problemas.length === 0);
}
{
  const refRota = referencia("0x" + "ee".repeat(32), PROP, WALLET, RECEPTOR,
                             500.0, DEC_PROP);
  const [regs, info] = aplicar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 1000.0)]),
    venta("pd_002", refRota, [])));
  ok("venta valida se aplica junto a invalida",
     regs[0].categoria === "VENTA" &&
     info.aplicados.map(a => a.venta_id).join() === "pd_001" &&
     info.problemas.some(p => p.includes("pd_002")), info);
}

// --- Idempotencia ---
{
  const v = venta("pd_001", refSalida1(),
                  [asignacion("as_001", refPago(), 400.0)],
                  { estado_liquidacion: "PARCIAL" });
  const regs = escenarioRegistros();
  aplicarPagosDiferidos(regs, cacheMinima(bloque(v)));
  const unaVez = deepCopy(regs);
  const info2 = aplicarPagosDiferidos(regs, cacheMinima(bloque(v)));
  ok("idempotencia (parcial): 2ª aplicacion no cambia nada",
     deepEqual(regs, unaVez) &&
     info2.aplicados.map(a => a.venta_id).join() === "pd_001" &&
     info2.problemas.length === 0);
}
{
  const v = venta("pd_001", refSalida1(),
                  [asignacion("as_001", refPago(), 1000.0)]);
  const regs = escenarioRegistros();
  aplicarPagosDiferidos(regs, cacheMinima(bloque(v)));
  const unaVez = deepCopy(regs);
  aplicarPagosDiferidos(regs, cacheMinima(bloque(v)));
  ok("idempotencia (completa): 2ª aplicacion no cambia nada",
     deepEqual(regs, unaVez));
}

// --- Conflictos con ajustes_usuario (aviso, nunca silencioso) ---
{
  const regs = escenarioRegistros();
  const claveSalida = regs[0].clave;
  const info = aplicarPagosDiferidos(regs, cacheMinima(
    bloque(venta("pd_001", refSalida1(),
                 [asignacion("as_001", refPago(), 1000.0)])),
    { [claveSalida]: { categoria: "MOVIMIENTO", nota: "x" } }));
  ok("conflicto con ajuste avisado (vinculo se aplica igual)",
     info.conflictos.length === 1 &&
     info.conflictos[0].includes("categoria") &&
     info.conflictos[0].includes(claveSalida) &&
     regs[0].categoria === "VENTA", info.conflictos);
}
{
  const regs = escenarioRegistros();
  const claveCobro = regs[1].clave;
  const info = aplicarPagosDiferidos(regs, cacheMinima(
    bloque(venta("pd_001", refSalida1(),
                 [asignacion("as_001", refPago(), 1000.0)])),
    { [claveCobro]: { coste_eur: 900.0 } }));
  ok("ajuste sin campos fijados no genera conflicto",
     info.conflictos.length === 0, info.conflictos);
}

// --- Compatibilidad con validarPagosDiferidos ---
{
  const regs = escenarioRegistros();
  ok("validador 2.2 sigue accesible",
     validarPagosDiferidos(bloque(venta("pd_001", refSalida1(),
       [asignacion("as_001", refPago(), 1000.0)])), regs).length === 0 &&
     validarPagosDiferidos(null, regs).length === 0);
}

// =========================================================================
console.log("2) End-to-end con cache sintetica a traves de clasificarTransacciones");

// `state` es un const lexico del contexto VM (declarado en 01-constantes.js),
// no una propiedad del sandbox: se configura desde dentro del contexto.
vm.runInContext(`state.config = Object.assign(state.config || {}, ${
  JSON.stringify({ wallet: WALLET, vault: VAULT })});`, sandbox);

function tx(hash, contrato, origen, destino, unidades, decimales, nombre,
            simbolo, ts) {
  return { hash, contractAddress: contrato, from: origen, to: destino,
           value: raw(unidades, decimales), tokenDecimal: String(decimales),
           tokenName: nombre, tokenSymbol: simbolo, timeStamp: String(ts) };
}
function cacheSintetica(bloquePd) {
  const cache = cacheVacia();
  cache.catalogo_propiedades[PROP] = {
    nombre_reental: "Prueba 1", nombre_etherscan: "PRUEBA 1",
    simbolo: "P1", estado: "CONFIRMADA",
  };
  cache.transacciones.wallet_tokens = [
    tx(HASH_SALIDA_1, PROP, WALLET, RECEPTOR, 500.0, DEC_PROP,
       "Prueba 1 Token", "P1", TS_SALIDA),
    tx(HASH_PAGO, USDC, TERCERO, WALLET, 1000.0, DEC_USDC,
       "USD Coin", "USDC", TS_PAGO),
  ];
  cache.pagos_diferidos = bloquePd;
  return cache;
}
const CONFIG_SINTETICA = { compra_bancaria_coste_eur_por_token: 100.0 };
const clasificar = cache =>
  clasificarTransacciones(cache, [], {}, CONFIG_SINTETICA);

{
  const regs = clasificar(cacheSintetica({ version: 1, ventas: [] }));
  const porHash = Object.fromEntries(regs.map(r => [r.hash, r]));
  const salida = porHash[HASH_SALIDA_1], cobro = porHash[HASH_PAGO];
  ok("sin vinculos: comportamiento original (2 registros, REVISAR + DEPOSITO)",
     regs.length === 2 && salida && cobro &&
     salida.categoria === "REVISAR" && salida.revisar === true &&
     salida.nota.includes("sin contraprestación") &&
     salida.pago_diferido === undefined &&
     cobro.categoria === "DEPOSITO" && cobro.revisar === false &&
     cobro.pago_diferido === undefined,
     regs.map(r => [r.clave, r.categoria, r.revisar, r.nota]));
}
{
  const regs = clasificar(cacheSintetica(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 1000.0)]))));
  const porHash = Object.fromEntries(regs.map(r => [r.hash, r]));
  const salida = porHash[HASH_SALIDA_1], cobro = porHash[HASH_PAGO];
  ok("vinculo confirmado: efectos completos en el pipeline",
     salida.categoria === "VENTA" && salida.subcategoria === "GPP_INMUEBLE" &&
     salida.importe_usdt === 1000.0 && salida.revisar === false &&
     salida.pago_diferido.rol === "salida" && salida.inmueble === "Prueba 1" &&
     cobro.categoria === "DEPOSITO" && cobro.subcategoria === "COSTE_BASE" &&
     cobro.revisar === false && cobro.pago_diferido.rol === "pago",
     regs.map(r => [r.clave, r.categoria, r.subcategoria, r.revisar]));
}
{
  const cache = cacheSintetica(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 1000.0)])));
  const h1 = huella(clasificar(cache));
  const h2 = huella(clasificar(cache));
  const cache0 = cacheSintetica({ version: 1, ventas: [] });
  const h0a = huella(clasificar(cache0));
  const h0b = huella(clasificar(cache0));
  ok("idempotencia: 2 ejecuciones del pipeline → misma huella (con y sin vinculo)",
     h1 === h2 && h0a === h0b);
  ok("el vinculo cambia SOLO lo vinculado (huella distinta al bloque vacio)",
     h1 !== h0a);
}
{
  const cache = cacheSintetica(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 1000.0)])));
  const claveSalida = `${HASH_SALIDA_1}::${PROP}`;
  cache.ajustes_usuario[claveSalida] = { categoria: "MOVIMIENTO" };
  const regs = clasificar(cache);
  const porHash = Object.fromEntries(regs.map(r => [r.hash, r]));
  ok("orden con ajustes_usuario: el ajuste tiene la ultima palabra",
     porHash[HASH_SALIDA_1].categoria === "MOVIMIENTO" &&
     porHash[HASH_SALIDA_1].pago_diferido.rol === "salida");
}

console.log(fallos === 0
  ? `\nRESULTADO: ${total} comprobaciones, TODO VERDE ✔`
  : `\nRESULTADO: ${fallos} FALLO(S) de ${total} ✘`);
process.exit(fallos === 0 ? 0 : 1);
