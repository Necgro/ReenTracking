/* Test unitario de los pagos diferidos: validacion de los vinculos.
 *
 * Funciones bajo prueba (Reental-SPA/js/14-clasificador.js):
 * - resolverReferenciaMovimiento (5-tupla -> registro unico)
 * - validarPagosDiferidos (reglas del bloque pagos_diferidos)
 *
 * Casos obligatorios: resolucion, sobreasignacion rechazada,
 * duplicado rechazado, salida con contraprestacion ya asignada rechazada.
 * Mas los estructurales: bloque vacio/ausente, ANULADO ignorado,
 * pago agrupado entre varias ventas, ambiguedad, estados invalidos y pureza.
 *
 * DATOS 100% SINTETICOS: ninguna direccion, hash ni importe real.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/test_pagos_diferidos_paso_22.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
const { resolverReferenciaMovimiento, validarPagosDiferidos } = sandbox;

// -------------------------------------------------------------------------
// Direcciones y hashes sinteticos (formato valido, contenido inventado)
// -------------------------------------------------------------------------
const HASH_SALIDA_1 = "0x" + "a1".repeat(32);
const HASH_SALIDA_2 = "0x" + "a2".repeat(32);
const HASH_PAGO = "0x" + "b1".repeat(32);
const PROP = "0x" + "c1".repeat(20);     // contrato de propiedad
const USDC = "0x" + "d1".repeat(20);     // contrato USDC sintético
const WALLET = "0x" + "e1".repeat(20);   // direccion propia
const RECEPTOR = "0x" + "f1".repeat(20); // receptor de la salida (tercero)
const TERCERO = "0x" + "11".repeat(20);  // origen del cobro (tercero)

const DEC_PROP = 18;
const DEC_USDC = 6;

const raw = (unidades, decimales) =>
  BigInt(Math.trunc(unidades * Math.pow(10, decimales))).toString();

// -------------------------------------------------------------------------
// Constructores sinteticos (imitan los registros y el bloque pagos_diferidos)
// -------------------------------------------------------------------------
function registro(hash, contrato, origen, destino, cantidad, categoria,
                  { subcategoria = "PENDIENTE", revisar = false, clave = null,
                    fecha = "2026-05-12 10:13:41" } = {}) {
  return {
    clave: clave || `${hash}::${contrato}`,
    fecha,
    hash: hash.toLowerCase(),
    contrato: contrato.toLowerCase(),
    token: null, simbolo: null,
    cantidad,
    categoria, subcategoria,
    inmueble: null, periodo_fiscal: null,
    importe_usdt: null, coste_eur: null, via_compra: null,
    origen: origen.toLowerCase(), destino: destino.toLowerCase(),
    fuente: "ONCHAIN", nota: "", revisar,
  };
}
function referencia(hash, contrato, origen, destino, unidades, decimales) {
  return { cadena: 137, hash, contrato, origen, destino,
           valor_raw: raw(unidades, decimales), decimales };
}
function asignacion(aid, pagoRef, cantidad, activo = "USDC") {
  return { id: aid, pago: pagoRef, activo, cantidad_asignada: cantidad,
           nota: "", creado: "2026-09-25T10:00:00", modificado: null };
}
function venta(vid, salidaRef, asignaciones,
               { estado = "CONFIRMADO", estado_liquidacion = "DESCONOCIDA",
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
const bloque = (...ventas) => ({ version: 1, ventas: [...ventas] });

// Escenario base: 2 salidas REVISAR (500 tokens, 18 dec) y 1 cobro de 1000 USDC
function registros() {
  return [
    registro(HASH_SALIDA_1, PROP, WALLET, RECEPTOR, 500.0, "REVISAR",
             { revisar: true, fecha: "2026-05-12 10:13:41" }),
    registro(HASH_SALIDA_2, PROP, WALLET, RECEPTOR, 500.0, "REVISAR",
             { revisar: true, fecha: "2026-05-12 10:18:17" }),
    registro(HASH_PAGO, USDC, TERCERO, WALLET, 1000.0, "DEPOSITO",
             { subcategoria: "COSTE_BASE", fecha: "2026-05-20 12:00:00" }),
  ];
}
const refSalida1 = () => referencia(HASH_SALIDA_1, PROP, WALLET, RECEPTOR, 500.0, DEC_PROP);
const refSalida2 = () => referencia(HASH_SALIDA_2, PROP, WALLET, RECEPTOR, 500.0, DEC_PROP);
const refPago = () => referencia(HASH_PAGO, USDC, TERCERO, WALLET, 1000.0, DEC_USDC);

// -------------------------------------------------------------------------
// Mini-arnes de aserciones
// -------------------------------------------------------------------------
let total = 0, fallos = 0;
function ok(nombre, cond, extra) {
  total++;
  if (cond) console.log("  OK   " + nombre);
  else { fallos++; console.log("  FAIL " + nombre + (extra !== undefined ? " → " + JSON.stringify(extra) : "")); }
}
function eqList(nombre, obtenido, esperado) {
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado),
     { obtenido, esperado });
}
const validar = (blk, regs = registros()) => validarPagosDiferidos(blk, regs);

// =========================================================================
console.log("1) Resolucion de referencias (5-tupla -> registro)");
{
  const r = resolverReferenciaMovimiento(refSalida1(), registros());
  ok("resolucion unica", r !== null && r.hash === HASH_SALIDA_1 && r.categoria === "REVISAR", r && r.clave);
}
{
  const ref = refPago();
  ref.hash = ref.hash.toUpperCase();
  ref.origen = " " + ref.origen.toUpperCase();
  const r = resolverReferenciaMovimiento(ref, registros());
  ok("insensible a mayusculas y espacios", r !== null && r.clave === `${HASH_PAGO}::${USDC}`, r && r.clave);
}
{
  const ref = refPago();
  ref.valor_raw = raw(999.999999, DEC_USDC);
  ok("por valor exacto (otro importe no casa)", resolverReferenciaMovimiento(ref, registros()) === null);
}
{
  const ref = refPago();
  ref.destino = "0x" + "99".repeat(20);
  ok("no encontrada", resolverReferenciaMovimiento(ref, registros()) === null);
}
for (const ref of [null, "basura", {}, { hash: HASH_PAGO }]) {
  ok("referencia invalida " + JSON.stringify(ref), resolverReferenciaMovimiento(ref, registros()) === null);
}
{
  const regs = registros();
  regs.push(Object.assign({}, regs[2], { clave: `${HASH_PAGO}::${USDC}::2` }));
  ok("ambigua devuelve null (nunca elegir arbitrariamente)",
     resolverReferenciaMovimiento(refPago(), regs) === null);
}

// =========================================================================
console.log("2) Validacion del bloque (reglas de la seccion 3 del plan)");

// --- Caso obligatorio: bloque vacio ---
eqList("bloque vacio es valido", validar({ version: 1, ventas: [] }), []);
eqList("bloque ausente (null) es valido", validar(null), []);
eqList("bloque {} es valido", validar({}), []);

// --- Vinculo minimo valido (y frontera suma == recibida) ---
eqList("vinculo minimo valido", validar(bloque(
  venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 1000.0)])
)), []);
eqList("asignacion parcial valida", validar(bloque(
  venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 400.0)],
        { estado_liquidacion: "PARCIAL" })
)), []);

// --- Caso obligatorio: sobreasignacion rechazada ---
{
  const problemas = validar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 1000.5)])
  ));
  ok("sobreasignacion rechazada (una venta)", problemas.length === 1 && problemas[0].includes("sobreasignacion"), problemas);
}
{
  const problemas = validar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 600.0)]),
    venta("pd_002", refSalida2(), [asignacion("as_001", refPago(), 500.0)])
  ));
  ok("sobreasignacion rechazada (pago agrupado, suma global)",
     problemas.length === 1 && problemas[0].includes("sobreasignacion") &&
     problemas[0].includes("pd_001") && problemas[0].includes("pd_002"), problemas);
}
eqList("pago agrupado dentro del recibido permitido", validar(bloque(
  venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 600.0)]),
  venta("pd_002", refSalida2(), [asignacion("as_001", refPago(), 400.0)])
)), []);

// --- Caso obligatorio: duplicado venta+pago rechazado ---
ok("duplicado venta+pago rechazado", validar(bloque(
  venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 400.0),
                                 asignacion("as_002", refPago(), 400.0)])
)).some(p => p.includes("duplicado venta+pago")));

// --- Caso obligatorio: salida con contraprestacion ya asignada ---
{
  const regs = registros();
  regs[0].categoria = "VENTA";
  regs[0].subcategoria = "GPP_INMUEBLE";
  regs[0].revisar = false;
  const problemas = validar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 500.0)])
  ), regs);
  ok("salida con contraprestacion ya asignada rechazada",
     problemas.some(p => p.includes("contraprestacion")), problemas);
}
ok("salida duplicada entre ventas rechazada", validar(bloque(
  venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 400.0)]),
  venta("pd_002", refSalida1(), [asignacion("as_002", refPago(), 400.0)])
)).some(p => p.includes("salida duplicada")));

// --- Referencias que no resuelven ---
{
  const ref = refSalida1();
  ref.hash = "0x" + "ee".repeat(32);
  ok("salida no encontrada", validar(bloque(
    venta("pd_001", ref, [asignacion("as_001", refPago(), 500.0)])
  )).some(p => p.includes("salida no encontrada")));
}
{
  const ref = refPago();
  ref.valor_raw = raw(1234.0, DEC_USDC);
  ok("pago no encontrado", validar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", ref, 500.0)])
  )).some(p => p.includes("pago no encontrado")));
}
{
  const regs = registros();
  regs.push(Object.assign({}, regs[0], { clave: `${HASH_SALIDA_1}::${PROP}::2` }));
  ok("salida ambigua rechazada", validar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 500.0)])
  ), regs).some(p => p.includes("ambigua")));
}

// --- Lo ANULADO se ignora ---
{
  const refRota = refSalida1();
  refRota.hash = "0x" + "ee".repeat(32);
  eqList("venta anulada ignorada (referencias rotas y sobreasignacion)",
    validar(bloque(venta("pd_001", refRota,
      [asignacion("as_001", refPago(), 5000.0)],
      { estado: "ANULADO", anulado: "2026-09-25T12:00:00" }))), []);
}
eqList("anulada no cuenta para sobreasignacion", validar(bloque(
  venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 1000.0)]),
  venta("pd_002", refSalida2(), [asignacion("as_001", refPago(), 1000.0)],
        { estado: "ANULADO" })
)), []);

// --- Estructura y dominios ---
ok("estado invalido", validar(bloque(
  venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), 500.0)],
        { estado: "BORRADOR" })
)).some(p => p.includes("estado")));
ok("estado_liquidacion invalido", validar(bloque(
  venta("pd_002", refSalida1(), [asignacion("as_001", refPago(), 500.0)],
        { estado_liquidacion: "MEDIA" })
)).some(p => p.includes("estado_liquidacion")));
ok("version no soportada", validar({ version: 2, ventas: [] })
  .some(p => p.includes("version")));
ok("id de venta duplicado", validar(bloque(
  venta("pd_001", refSalida1(), []),
  venta("pd_001", refSalida2(), [])
)).some(p => p.includes("id duplicado")));
for (const mala of [0, -5.0, "500", null, true]) {
  ok("cantidad_asignada invalida " + JSON.stringify(mala), validar(bloque(
    venta("pd_001", refSalida1(), [asignacion("as_001", refPago(), mala)])
  )).some(p => p.includes("cantidad_asignada")));
}
ok("bloque no objeto", validarPagosDiferidos("basura", registros()).length > 0);
ok("ventas no lista", validarPagosDiferidos({ version: 1, ventas: "no" }, registros()).length > 0);

// --- Pureza ---
{
  const regs = registros();
  const b = bloque(venta("pd_001", refSalida1(),
                         [asignacion("as_001", refPago(), 1000.0)]));
  const copiaB = JSON.stringify(b), copiaR = JSON.stringify(regs);
  validarPagosDiferidos(b, regs);
  resolverReferenciaMovimiento(refPago(), regs);
  ok("no modifica entradas (pureza)",
     JSON.stringify(b) === copiaB && JSON.stringify(regs) === copiaR);
}

console.log(fallos === 0
  ? `\nRESULTADO: ${total} comprobaciones, TODO VERDE ✔`
  : `\nRESULTADO: ${fallos} FALLO(S) de ${total} ✘`);
process.exit(fallos === 0 ? 0 : 1);
