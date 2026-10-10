/* Test unitario de la lista de candidatos a vincular (pagos diferidos) en
 * 🔍 Revisión.
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - ccContextoCandidatos / ccEsSalidaCandidata / ccEsCobroCandidato /
 *   ccCandidatura: cobros acotados por defecto a entrantes sin contraparte
 *   explicada —DEPOSITO o REVISAR— con verTodos=true para la definición
 *   completa; las marcas de las cards y los contadores usan
 *   ccPendienteDeVincular = vinculable Y sin vínculo —sin contraprestación
 *   propia y sin venta/asignación CONFIRMADA—; sobre datos sintéticos SIN
 *   vínculos guardados ambas definiciones coinciden; lo de los vínculos se
 *   prueba en tests/test_correcciones_paso_47.js.
 * - ccPendienteDeVincular / ccResumen (la lista no tiene filtros)
 * - ccCantidad / ccHashCorto / ccFechaCorta / ccEsc
 * - ccHtmlTarjeta (card patrón revCard: motivo en recuadro, hash corto
 *   + enlace Polygonscan, cantidad, tag, badge de candidatura)
 * - PUERTA: el fuente del módulo no guarda al margen del patrón de js/13
 *   (ver el final del test).
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_32.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
// Las const de nivel superior no son propiedades del sandbox: se leen por VM.
const get = nombre => vm.runInContext(nombre, sandbox);
const { ccContextoCandidatos, ccEsSalidaCandidata, ccEsCobroCandidato, ccCandidatura,
        ccPendienteDeVincular, ccResumen, ccCantidad,
        ccHashCorto, ccFechaCorta, ccEsc, ccHtmlTarjeta } = sandbox;
const USDT = get("USDT"), USDC = get("USDC"), RNT = get("RNT"), BURN = get("BURN");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

// -------------------------------------------------------------------------
// Direcciones, contratos y hashes sintéticos
// -------------------------------------------------------------------------
const W = "0x" + "11".repeat(20);   // wallet propia
const V = "0x" + "22".repeat(20);   // vault propio
const T = "0x" + "77".repeat(20);   // tercero desconocido
const D = "0x" + "d1".repeat(20);   // tercero (p. ej. distribuidor)
const P1 = "0x" + "a1".repeat(20);  // propiedad CONFIRMADA
const P2 = "0x" + "a2".repeat(20);  // propiedad sin campo estado (= confirmada)
const P3 = "0x" + "a3".repeat(20);  // CANDIDATA (no confirmada)
const P4 = "0x" + "a4".repeat(20);  // DESCARTADA
const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);

const CACHE = {
  catalogo_propiedades: {
    [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1" },
    [P2]: { nombre_reental: "Prueba Brezo 2" },          // sin estado = confirmada
    [P3]: { estado: "CANDIDATA", nombre_reental: "Prueba Cedro 3" },
    [P4]: { estado: "DESCARTADA", nombre_reental: "Prueba Dalia 4" },
  },
  contratos_aprendidos: {},
};
const CONFIG = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100 };

function registro(hash, contrato, origen, destino, cantidad, categoria,
                  { subcategoria = "PENDIENTE", revisar = false, clave = null,
                    fecha = "2026-05-12 10:13:41", inmueble = null, simbolo = null,
                    nota = "" } = {}) {
  return {
    clave: clave || `${hash}::${contrato}`,
    fecha, hash: hash.toLowerCase(),
    contrato: String(contrato || "").toLowerCase(),
    token: null, simbolo, cantidad,
    categoria, subcategoria, inmueble,
    periodo_fiscal: null, importe_usdt: null, coste_eur: null, via_compra: null,
    origen: String(origen || "").toLowerCase(), destino: String(destino || "").toLowerCase(),
    fuente: "ONCHAIN", nota, revisar,
  };
}

console.log("== 1. Contexto de candidatos ==");
const ctx = ccContextoCandidatos(CACHE, CONFIG);
assert("propias = {wallet, vault}", ctx.propias.size === 2 && ctx.propias.has(W) && ctx.propias.has(V));
assert("propiedades confirmadas = P1 y P2 (fuera CANDIDATA/DESCARTADA)",
  ctx.inmuebles.size === 2 && ctx.inmuebles.has(P1) && ctx.inmuebles.has(P2));
assert("hayCache y hayPropias verdaderos", ctx.hayCache === true && ctx.hayPropias === true);
const ctxSinCache = ccContextoCandidatos(null, CONFIG);
assert("cache null -> sin propiedades, hayCache=false", ctxSinCache.inmuebles.size === 0 && !ctxSinCache.hayCache);
const ctxSinCfg = ccContextoCandidatos(CACHE, {});
assert("config sin wallet/vault -> hayPropias=false", ctxSinCfg.hayPropias === false && ctxSinCfg.propias.size === 0);
assert("direcciones MIXED-CASE normalizadas", ccContextoCandidatos(CACHE, { wallet: W.toUpperCase(), vault: V }).propias.has(W));

console.log("== 2. Candidatos de SALIDA (propiedad confirmada + origen propio) ==");
const r1 = registro(H(1), P1, W, T, 250, "REVISAR", { revisar: true, inmueble: "Prueba Alcazaba 1" });
assert("REVISAR de propiedad desde wallet -> salida", ccCandidatura(r1, ctx) === "salida");
assert("origen vault también es salida", ccEsSalidaCandidata(registro(H(2), P1, V, T, 40, "MOVIMIENTO"), ctx));
const rVenta = registro(H(4), P1, W, BURN, 40, "VENTA", { revisar: true, inmueble: "Prueba Alcazaba 1" });
assert("VENTA (burn) también es candidata: sea cual sea su categoría", ccCandidatura(rVenta, ctx) === "salida");
assert("propiedad CANDIDATA (P3) NO es salida", ccCandidatura(registro(H(6), P3, W, T, 10, "REVISAR", { revisar: true }), ctx) === null);
assert("propiedad DESCARTADA (P4) NO es salida", ccCandidatura(registro(H(7), P4, W, T, 10, "SPAM"), ctx) === null);
assert("origen tercero NO es salida", ccCandidatura(registro(H(8), P1, T, W, 10, "COMPRA"), ctx) === null);
assert("origen vacío NO es salida (no se supone)", ccCandidatura(registro(H(9), P1, "", T, 10, "REVISAR"), ctx) === null);
assert("contrato vacío NO es salida", ccCandidatura(registro(H(10), "", W, T, 1, "COMISION"), ctx) === null);
assert("stablecoin propia->tercero NO es salida (no es propiedad)", ccCandidatura(registro(H(11), USDT, W, T, 50, "RETIRADA"), ctx) === null);
assert("sin cache no hay candidatos de salida", ccCandidatura(r1, ctxSinCache) === null);
assert("sin wallet/vault no hay candidatos", ccCandidatura(r1, ccContextoCandidatos(CACHE, { vault: V })) === null);

console.log("== 3. Candidatos de COBRO (stablecoin entrante a propia desde tercero) ==");
const rCobro1 = registro(H(3), USDC, T, W, 300, "DEPOSITO",
  { clave: H(3) + "::" + USDC, fecha: "2026-05-20 18:00:00" });
const rCobro2 = registro(H(3), USDC, T, W, 179.4321, "DEPOSITO",
  { clave: H(3) + "::" + USDC + "::2", fecha: "2026-05-20 18:00:05" });
assert("USDC tercero->wallet DEPOSITO es cobro", ccCandidatura(rCobro1, ctx) === "cobro");
assert("USDT tercero->vault DEPOSITO es cobro", ccCandidatura(registro(H(5), USDT, D, V, 400, "DEPOSITO"), ctx) === "cobro");
assert("mismo hash, 2 movimientos = 2 candidatos independientes",
  ccCandidatura(rCobro2, ctx) === "cobro" && rCobro1.clave !== rCobro2.clave);
assert("origen propio (traspaso interno) NO es cobro", ccCandidatura(registro(H(12), USDT, W, V, 100, "MOVIMIENTO"), ctx) === null);
assert("destino tercero NO es cobro", ccCandidatura(registro(H(13), USDT, T, D, 100, "MOVIMIENTO"), ctx) === null);
assert("RNT (no stablecoin) entrante NO es cobro", ccCandidatura(registro(H(14), RNT, T, W, 100, "REWARD"), ctx) === null);
assert("RNT no es cobro ni con verTodos (la estructura no cambia)", ccCandidatura(registro(H(14), RNT, T, W, 100, "REWARD"), ctx, true) === null);
assert("stablecoin sin origen NO es cobro (no se confirma 'desde tercero')",
  ccCandidatura(registro(H(15), USDC, "", W, 10, "REVISAR"), ctx) === null);
assert("propiedad confirmada entrante NO es cobro (no es stablecoin)",
  ccCandidatura(registro(H(16), P1, T, W, 10, "COMPRA"), ctx) === null);

console.log("== 3b. T4 (4.6): cobros ACOTADOS a entrantes sin contraparte explicada ==");
const rDiv = registro(H(17), USDT, D, V, 400, "RENDIMIENTO");           // casado por CSV
const rRew = registro(H(18), USDT, D, V, 12, "REWARD");               // recompensa explicada
const rRev = registro(H(19), USDT, D, V, 60, "REVISAR", { revisar: true }); // sin contraparte
const rMov = registro(H(21), USDT, D, V, 60, "MOVIMIENTO");           // neutro explicado
const rDepVer = registro(H(22), USDC, T, W, 479.4321, "DEPOSITO",
  { nota: "verificar origen (venta P2P, bridge o exchange)", clave: H(22) + "::" + USDC });
assert("RENDIMIENTO entrante NO es cobro por defecto (contraparte explicada por CSV)",
  ccCandidatura(rDiv, ctx) === null && ccEsCobroCandidato(rDiv, ctx) === false);
assert("REWARD entrante NO es cobro por defecto", ccCandidatura(rRew, ctx) === null);
assert("MOVIMIENTO entrante NO es cobro por defecto", ccCandidatura(rMov, ctx) === null);
assert("REVISAR entrante SÍ es cobro (sin contraparte explicada)", ccCandidatura(rRev, ctx) === "cobro");
assert("el caso real (DEPOSITO «verificar origen») SIGUE siendo candidato", ccCandidatura(rDepVer, ctx) === "cobro");
assert("verTodos=true -> RENDIMIENTO/REWARD/MOVIMIENTO vuelven a ser cobros (definición 3.2)",
  ccCandidatura(rDiv, ctx, true) === "cobro" && ccCandidatura(rRew, ctx, true) === "cobro" &&
  ccCandidatura(rMov, ctx, true) === "cobro");
assert("verTodos no cambia las salidas", ccCandidatura(r1, ctx, true) === "salida" && ccCandidatura(r1, ctx) === "salida");
assert("verTodos no cuela traspasos internos ni salidas a terceros",
  ccCandidatura(registro(H(12), USDT, W, V, 100, "DEPOSITO"), ctx, true) === null &&
  ccCandidatura(registro(H(13), USDT, T, D, 100, "DEPOSITO"), ctx, true) === null);
assert("ccEsCobroCandidato: estructura + categoría; ccEsCobroEntrante ignora la categoría",
  ccEsCobroCandidato(rDiv, ctx, true) === true);

console.log("== 4. Filtros ==");
const regs = [
  registro(H(6), P3, W, T, 10, "REVISAR", { revisar: true, fecha: "2026-05-03 10:00:00" }),
  registro(H(5), P1, D, V, null, "RENDIMIENTO", { fecha: "2026-06-10 00:00:00", inmueble: "Prueba Alcazaba 1" }),
  r1, // REVISAR salida 2026-05-12, propiedad Alcazaba
  registro(H(2), P2, W, T, 100, "REVISAR", { revisar: true, inmueble: "Prueba Brezo 2", fecha: "2026-05-13 08:00:00" }),
  rCobro1, // DEPOSITO 2026-05-12 (fecha por defecto), sin propiedad
  rCobro2,
  registro(H(11), USDT, W, T, 50, "RETIRADA", { fecha: "2026-07-25 09:00:00" }),
  rVenta, // VENTA 2026-08-02? -> se fija abajo
];
regs[7].fecha = "2026-08-02 12:00:00";
const porVincular = (regs, c, verTodos) => regs.filter(r => ccPendienteDeVincular(r, c, verTodos)); // sin filtros en Revisión; se comprueba la definición de «por vincular»
assert("por vincular -> 4.7: 2 salidas + 2 cobros; la VENTA correlacionada queda fuera", porVincular(regs, ctx).length === 4);
const regsT4 = [rDiv, rRew, rCobro1, rRev];
assert("T4: por vincular por defecto -> solo DEPOSITO/REVISAR (2 de 4)", porVincular(regsT4, ctx).length === 2);
assert("T4: con verTodos=true -> los 4 entrantes", porVincular(regsT4, ctx, true).length === 4);

console.log("== 5. Resumen ==");
const res = ccResumen(regs, ctx);
assert("resumen: total/pendientes/salidas/cobros (4.7: salidas = por vincular; la VENTA correlacionada no lo es)",
  res.total === 8 && res.pendientes === 4 && res.salidas === 2 && res.cobros === 2, res);
const resT4 = ccResumen(regsT4, ctx), resT4V = ccResumen(regsT4, ctx, true);
assert("T4: resumen de cobros respeta el conmutador (2 por defecto, 4 con verTodos)",
  resT4.cobros === 2 && resT4V.cobros === 4 && resT4.salidas === 0 && resT4V.salidas === 0,
  { resT4, resT4V });

console.log("== 6. Formateo determinista ==");
assert("cantidad 250 -> '250'", ccCantidad(250) === "250", ccCantidad(250));
assert("cantidad 479.4321 -> '479,4321'", ccCantidad(479.4321) === "479,4321", ccCantidad(479.4321));
assert("cantidad 1234.5 -> '1.234,5'", ccCantidad(1234.5) === "1.234,5", ccCantidad(1234.5));
assert("cantidad 1234567.891 -> miles + 6 dec", ccCantidad(1234567.891) === "1.234.567,891", ccCantidad(1234567.891));
assert("cantidad null -> '?'", ccCantidad(null) === "?" && ccCantidad(undefined) === "?" && ccCantidad(NaN) === "?");
assert("hash corto: 10 primeros … 6 últimos", ccHashCorto(H(1)) === H(1).slice(0, 10) + "…" + H(1).slice(-6));
assert("fecha corta de 'AAAA-MM-DD HH:MM:SS'", ccFechaCorta(r1) === "2026-05-12");
assert("fecha corta null/inválida -> null", ccFechaCorta({ fecha: null }) === null && ccFechaCorta({ fecha: "no-es-fecha" }) === null);
assert("ccEsc escapa HTML", ccEsc('<img src="x" onerror="y">&\'') === "&lt;img src=&quot;x&quot; onerror=&quot;y&quot;&gt;&amp;&#39;");

console.log("== 7. ccHtmlTarjeta (card §6.2) ==");
const card1 = ccHtmlTarjeta(r1, { seleccionada: false, candidatura: ccCandidatura(r1, ctx) });
assert("clases cc-item + pend + cand-salida", /class="cc-item pend cand-salida"/.test(card1), card1.slice(0, 120));
// La tarjeta no lleva casilla de selección: no serviría para nada.
assert("sin casilla de selección", !card1.includes("cc-sel-box") && !card1.includes('type="checkbox"'));
// Sin la etiqueta «a revisar» / «clasificado».
assert("sin etiqueta «a revisar»", !card1.includes("cc-tag"));
// Marca «🔗 Por vincular» con burbuja corta.
assert("marca de salida pendiente con su burbuja corta", /cc-cand salida" title="Venta sin su cobro vinculado\.">🔗 Por vincular/.test(card1));
// La nota del motor, en la ⓘ de la categoría.
assert("nota del motor en la ⓘ de la categoría", !card1.includes("cc-motivo") && (!r1.nota || /<span class="cc-cat">[^<]*<span class="cc-info"/.test(card1)), (card1.match(/cc-cat.{0,120}/) || [""])[0]);
assert("hash corto + enlace Polygonscan con noopener",
  card1.includes("https://polygonscan.com/tx/" + r1.hash) && /target="_blank" rel="noopener"/.test(card1));
assert("cantidad y símbolo visibles, el símbolo una vez", /cc-sym">250 [^<]+</.test(card1), (card1.match(/cc-sym">[^<]*/) || [""])[0]);
const cardSel = ccHtmlTarjeta(rCobro1, { seleccionada: true, candidatura: "cobro" });
// Los cobros no llevan marca «por vincular» en Revisión.
assert("sin selección: ni clase sel ni casilla", !/cc-item sel/.test(cardSel) && !cardSel.includes("checkbox"));
assert("4.4b: sin marca de cobro por vincular (T70)", !cardSel.includes("cc-cand"));
assert("sin etiqueta «clasificado» cuando revisar=false", !cardSel.includes("cc-tag"));
const cardXss = ccHtmlTarjeta(registro(H(30), P1, W, T, 1, "REVISAR", {
  revisar: true, simbolo: '<b>x</b>', nota: '<script>alert("x")</script>', inmueble: "a & b" }),
  { candidatura: "salida" });
assert("XSS escapado en símbolo, nota y propiedad",
  !cardXss.includes("<script>") && cardXss.includes("&lt;script&gt;") && cardXss.includes("a &amp; b"));
assert("con nota: la ⓘ de la categoría la lleva, escapada", /<span class="cc-cat">[^<]*<span class="cc-info"[^>]*>ⓘ<span class="cc-burbuja" role="tooltip">&lt;script&gt;/.test(cardXss));
const cardSinHash = ccHtmlTarjeta(registro("", P1, W, T, null, "COMPRA", { nota: "" }), {});
assert("sin hash -> estado honesto, sin enlace", cardSinHash.includes("sin hash") && !cardSinHash.includes("polygonscan"));
assert("sin nota -> sin ⓘ", !cardSinHash.includes("cc-info"));
assert("cantidad null -> solo el símbolo, sin «?»", /cc-sym">[^<?]+</.test(cardSinHash), (cardSinHash.match(/cc-sym">[^<]*/) || [""])[0]);
const cardSinCand = ccHtmlTarjeta(registro(H(31), USDT, W, T, 5, "RETIRADA"), {});
assert("no candidata -> sin badge", !cardSinCand.includes("cc-cand"));

console.log("== 8. PUERTA DE FASE: el módulo no guarda nada ==");
/* js/15 escribe ajustes_usuario a propósito, pero solo en
   ccGuardarAjustesDecision (decisiones de la cola, con su guardado): las
   guardas de aquí miran el resto del módulo. */
const fuente = fs.readFileSync(path.join(BASE, "15-correcciones.js"), "utf8")
  .replace(/async function ccGuardarAjustesDecision[\s\S]*?\r?\n}\r?\n/, "");
/* Que la lista no guarde nada se verifica en RUNTIME en los arneses (cache
   idéntica tras usarla). Aquí queda el contrato estático del módulo:
   escribir en cache.pagos_diferidos y usar marcarCacheDirty/autoGuardarCache
   ES legítimo (es el guardado de los vínculos); está prohibida toda
   persistencia al margen del patrón de js/13 y cualquier escritura en
   ajustes_usuario o en el state global. */
const prohibidos = [
  [/guardarCacheDisco\s*\(/, "guardarCacheDisco("],
  [/guardarJsonComo\s*\(/, "guardarJsonComo("],
  [/descargarJson\s*\(/, "descargarJson("],
  [/localStorage\s*\./, "localStorage."],
  [/state\.cache\s*=[^=]/, "state.cache = ..."],
  [/state\.cacheDirty\s*=[^=]/, "state.cacheDirty = ..."],
  [/state\.registros\s*=[^=]/, "state.registros = ..."],
  [/\.ajustes_usuario\s*=[^=]/, ".ajustes_usuario = ..."],
];
for (const [re, nombre] of prohibidos) {
  assert("fuente sin " + nombre, !re.test(fuente));
}

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
