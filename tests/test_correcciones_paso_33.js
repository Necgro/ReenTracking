/* Test unitario del buscador de «Vincular cobro…».
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - ccCobrosCoincidentes: búsqueda de cobros candidatos por activo, RANGO de
 *   importe desde/hasta (importeMin/importeMax), fechas y dirección (trozo,
 *   con o sin 0x, mayúsculas); solo candidatos a cobro ACOTADOS por defecto a
 *   entrantes sin contraparte explicada (DEPOSITO/REVISAR; consulta.verTodos=true
 *   devuelve todos los entrantes de stablecoin); sin cantidad parseable nunca
 *   casa con un rango pedido; sin fecha válida fuera de rangos activos; orden
 *   por fecha (sin fecha al final), hash y clave.
 * - ccTextoRegCorto: resumen legible de las tarjetas y líneas de Resueltos.
 *   (No hay propuestas de emparejamiento en memoria: el buscador abre directo
 *   el formulario.)
 * - PUERTA: el fuente del módulo no guarda al margen del patrón de js/13.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_33.js
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
const get = nombre => vm.runInContext(nombre, sandbox);
const { ccContextoCandidatos, ccCobrosCoincidentes, ccTextoRegCorto, ccCandidatura } = sandbox;
const USDT = get("USDT"), USDC = get("USDC");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "11".repeat(20);
const V = "0x" + "22".repeat(20);
const T = "0x" + "77".repeat(20);
const D = "0x" + "d1".repeat(20);
const P1 = "0x" + "a1".repeat(20);
const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);

const CACHE = {
  catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1" } },
  contratos_aprendidos: {},
};
const CONFIG = { wallet: W, vault: V };
const ctx = ccContextoCandidatos(CACHE, CONFIG);

function reg(hash, contrato, origen, destino, cantidad, categoria,
             { simbolo = null, fecha = "2026-05-20 18:00:00", clave = null,
               revisar = false } = {}) {
  return {
    clave: clave || hash + "::" + contrato,
    fecha, hash: hash.toLowerCase(), contrato: String(contrato).toLowerCase(),
    token: null, simbolo, cantidad, categoria, subcategoria: "PENDIENTE",
    inmueble: null, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen: origen.toLowerCase(), destino: destino.toLowerCase(),
    fuente: "ONCHAIN", nota: "", revisar,
  };
}

const C1 = reg(H(1), USDC, T, W, 300, "DEPOSITO", { simbolo: "USDC", clave: "c1" });
const C2 = reg(H(2), USDC, T, W, 179.4321, "DEPOSITO", { simbolo: "USDC", fecha: "2026-05-20 18:00:05", clave: "c2" });
const C3 = reg(H(3), USDT, D, V, 400, "RENDIMIENTO", { simbolo: "USDT", fecha: "2026-04-10 12:00:00", clave: "c3" });
const C4 = reg(H(4), USDC, T, W, 77.5, "DEPOSITO", { simbolo: "USDC", fecha: "2026-08-01 09:00:00", clave: "c4" });
const C5 = reg(H(5), USDT, T, V, 55, "REVISAR", { simbolo: "USDT", fecha: null, clave: "c5", revisar: true });
const S1 = reg(H(6), P1, W, T, 250, "REVISAR", { simbolo: "RALC1", fecha: "2026-05-12 09:45:46", clave: "s1", revisar: true });
const N1 = reg(H(7), USDT, W, T, 50, "RETIRADA", { simbolo: "USDT", clave: "n1" });
const REGS = [S1, C1, C2, C3, C4, C5, N1];
const clavesDe = lista => lista.map(r => r.clave).join(",");
const vacia = {};

console.log("== 1. Base del buscador (T4: acotado por defecto + conmutador verTodos) ==");
assert("sanidad: C1 DEPOSITO es cobro, S1 salida, N1 retirada no candidato",
  ccCandidatura(C1, ctx) === "cobro" && ccCandidatura(S1, ctx) === "salida" && ccCandidatura(N1, ctx) === null);
assert("T4: C3 (RENDIMIENTO casado por CSV) NO es candidato por defecto; con verTodos sí",
  ccCandidatura(C3, ctx) === null && ccCandidatura(C3, ctx, true) === "cobro");
let r = ccCobrosCoincidentes(REGS, ctx, vacia);
assert("sin consulta -> los 4 cobros acotados (c1,c2,c4 DEPOSITO + c5 REVISAR; c3 RENDIMIENTO fuera)",
  clavesDe(r) === "c1,c2,c4,c5", clavesDe(r));
assert("orden por fecha y sin fecha al final", clavesDe(r) === "c1,c2,c4,c5", clavesDe(r));
assert("conmutador verTodos -> los 5 entrantes de stablecoin (definición completa 3.2)",
  clavesDe(ccCobrosCoincidentes(REGS, ctx, { verTodos: true })) === "c3,c1,c2,c4,c5",
  clavesDe(ccCobrosCoincidentes(REGS, ctx, { verTodos: true })));

console.log("== 2. Filtro por activo ==");
assert("USDC -> 3", clavesDe(ccCobrosCoincidentes(REGS, ctx, { activo: "USDC" })) === "c1,c2,c4");
assert("USDT acotado -> solo c5 (c3 es RENDIMIENTO)", clavesDe(ccCobrosCoincidentes(REGS, ctx, { activo: "USDT" })) === "c5");
assert("USDT con verTodos -> c3,c5", clavesDe(ccCobrosCoincidentes(REGS, ctx, { activo: "USDT", verTodos: true })) === "c3,c5");
assert("activo inventado -> 0 (no se mapea a ningún contrato)",
  ccCobrosCoincidentes(REGS, ctx, { activo: "DAI" }).length === 0);

console.log("== 3. Rango de importe desde/hasta (T3, 4.6) ==");
assert("min=max=300 (rango cerrado) -> c1", clavesDe(ccCobrosCoincidentes(REGS, ctx, { importeMin: 300, importeMax: 300 })) === "c1");
assert("min 179 max 180 -> c2 (179,4321)", clavesDe(ccCobrosCoincidentes(REGS, ctx, { importeMin: 179, importeMax: 180 })) === "c2");
assert("límites inclusivos a 6 decimales: min=max=179.4321 -> c2",
  clavesDe(ccCobrosCoincidentes(REGS, ctx, { importeMin: 179.4321, importeMax: 179.4321 })) === "c2");
assert("solo min 190 -> c1 (300; c3=400 fuera por acotado)", clavesDe(ccCobrosCoincidentes(REGS, ctx, { importeMin: 190 })) === "c1");
assert("solo min 190 con verTodos -> c3 (400) y c1 (300), por fecha",
  clavesDe(ccCobrosCoincidentes(REGS, ctx, { importeMin: 190, verTodos: true })) === "c3,c1");
assert("solo max 100 -> c4 (77,5) y c5 (55)", clavesDe(ccCobrosCoincidentes(REGS, ctx, { importeMax: 100 })) === "c4,c5");
assert("min > max -> ninguno (rango imposible, honesto)",
  ccCobrosCoincidentes(REGS, ctx, { importeMin: 500, importeMax: 100 }).length === 0);
assert("rango no numérico ('abc') -> se ignora el filtro (los acotados)",
  clavesDe(ccCobrosCoincidentes(REGS, ctx, { importeMin: "abc", importeMax: "" })) === "c1,c2,c4,c5");
assert("rango ancho 0-100000 -> los 4 con cantidad", clavesDe(ccCobrosCoincidentes(REGS, ctx, { importeMin: 0, importeMax: 100000 })) === "c1,c2,c4,c5");
const SIN_CANT = reg(H(8), USDC, T, W, null, "REVISAR", { simbolo: "USDC", clave: "c8", revisar: true });
assert("cobro sin cantidad parseable nunca casa con un rango pedido",
  clavesDe(ccCobrosCoincidentes(REGS.concat([SIN_CANT]), ctx, { importeMin: 0, importeMax: 100000 })) === "c1,c2,c4,c5");
assert("sin rango activo, el cobro sin cantidad sí entra (ordenado por fecha y hash)",
  clavesDe(ccCobrosCoincidentes(REGS.concat([SIN_CANT]), ctx, vacia)) === "c1,c8,c2,c4,c5");

console.log("== 4. Fechas ==");
assert("rango mayo -> c1,c2", clavesDe(ccCobrosCoincidentes(REGS, ctx, { desde: "2026-05-01", hasta: "2026-05-31" })) === "c1,c2");
assert("solo desde 2026-05-21 -> c4", clavesDe(ccCobrosCoincidentes(REGS, ctx, { desde: "2026-05-21" })) === "c4");
assert("sin fecha válida + rango activo -> fuera (honesto)",
  clavesDe(ccCobrosCoincidentes(REGS, ctx, { desde: "2020-01-01" })) === "c1,c2,c4");
assert("rango de abril con verTodos -> c3 (RENDIMIENTO visible con el conmutador)",
  clavesDe(ccCobrosCoincidentes(REGS, ctx, { desde: "2026-04-01", hasta: "2026-04-30", verTodos: true })) === "c3");

console.log("== 5. Dirección (trozo, con o sin 0x, mayúsculas) ==");
assert("trozo '7777' (origen tercero) -> 4", clavesDe(ccCobrosCoincidentes(REGS, ctx, { direccion: "7777" })) === "c1,c2,c4,c5");
assert("'0x7777' con prefijo -> mismo resultado", clavesDe(ccCobrosCoincidentes(REGS, ctx, { direccion: "0x7777" })) === "c1,c2,c4,c5");
assert("MAYÚSCULAS con 0X -> normalizado, mismo resultado", clavesDe(ccCobrosCoincidentes(REGS, ctx, { direccion: T.toUpperCase() })) === "c1,c2,c4,c5");
assert("dirección completa del distribuidor por defecto -> 0 (solo casaba c3, RENDIMIENTO)",
  ccCobrosCoincidentes(REGS, ctx, { direccion: D }).length === 0);
assert("dirección del distribuidor con verTodos -> c3", clavesDe(ccCobrosCoincidentes(REGS, ctx, { direccion: D, verTodos: true })) === "c3");
assert("vault (destino) por defecto -> c5", clavesDe(ccCobrosCoincidentes(REGS, ctx, { direccion: V })) === "c5");
assert("vault (destino) con verTodos -> c3,c5", clavesDe(ccCobrosCoincidentes(REGS, ctx, { direccion: V, verTodos: true })) === "c3,c5");
assert("dirección ajena -> 0", ccCobrosCoincidentes(REGS, ctx, { direccion: "0x9999" }).length === 0);

console.log("== 6. Combinados ==");
assert("USDC + rango 250-350 -> c1", clavesDe(ccCobrosCoincidentes(REGS, ctx, { activo: "USDC", importeMin: 250, importeMax: 350 })) === "c1");
assert("USDT + rango abril con verTodos -> c3", clavesDe(ccCobrosCoincidentes(REGS, ctx, { activo: "USDT", desde: "2026-04-01", hasta: "2026-04-30", verTodos: true })) === "c3");
assert("dirección + rango exacto -> c2", clavesDe(ccCobrosCoincidentes(REGS, ctx, { direccion: T, importeMin: 179.4321, importeMax: 179.4321 })) === "c2");
assert("combinación imposible -> 0 con mensaje gestionado por el diálogo",
  ccCobrosCoincidentes(REGS, ctx, { activo: "USDT", importeMin: 300, importeMax: 300 }).length === 0);

console.log("== 7. Resumen corto ==");
const texto = ccTextoRegCorto(C1);
assert("texto corto: cantidad + símbolo + fecha + hash corto",
  texto === "300 USDC · 20/05/2026 · " + C1.hash.slice(0, 10) + "…" + C1.hash.slice(-6), texto);
assert("texto corto sin símbolo ni fecha", ccTextoRegCorto(reg(H(9), USDC, T, W, 5, "DEPOSITO", { fecha: null })) === "5 · sin fecha · " + H(9).slice(0, 10) + "…" + H(9).slice(-6));

console.log("== 8. PUERTA DE FASE: el módulo no guarda nada ==");
/* js/15 escribe ajustes_usuario a propósito, pero solo en
   ccGuardarAjustesDecision (decisiones de la cola, con su guardado): las
   guardas de aquí miran el resto del módulo. */
const fuente = fs.readFileSync(path.join(BASE, "15-correcciones.js"), "utf8")
  .replace(/async function ccGuardarAjustesDecision[\s\S]*?\r?\n}\r?\n/, "");
/* Que buscar no guarde nada se verifica en RUNTIME en el arnés (cache
   idéntica tras buscar). Aquí queda el contrato estático del módulo:
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
