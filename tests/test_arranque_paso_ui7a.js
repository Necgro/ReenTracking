/* Test unitario del asistente de arranque en una sola pestaña (Reental-SPA/js/19-arranque.js).
 *
 * Funciones bajo prueba (sección pura del módulo):
 * - arrEvaluar: estado de los 5 pasos (config, cache, sync, csv,
 *   clasificar), lista de lo que falta, paso activo y botones permitidos.
 *   Los requisitos de clasificar son EXACTAMENTE los de js/14
 *   (requisitosClasificacionOk); sincronizar pide además la API key.
 * - arrAlias: #sync / #clasificacion → Puesta en marcha (con su tarjeta),
 *   #panel heredado → Revisión; el resto no se toca.
 * - arrNumTx: cuenta de transacciones de la cache.
 *
 * DATOS 100% SINTÉTICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_arranque_paso_ui7a.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {}, log: () => {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "19-arranque.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
const S = sandbox;

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "a1".repeat(20), V = "0x" + "b2".repeat(20);
const CFG = { wallet: W, vault: V, etherscan_api_key: "CLAVE_SINTETICA", compra_bancaria_coste_eur_por_token: 100 };
const cache = n => ({ transacciones: { wallet_tokens: Array.from({ length: n }, (_, i) => ({ i })), vault_tokens: [] } });
const base = o => Object.assign({ config: CFG, cache: cache(3), csvCargado: true, nCsv: 5, registros: null,
  syncCorriendo: false, syncErrores: [], preparando: false }, o);

/* A) Todo vacío */
console.log("A) Arranque desde cero");
let r = S.arrEvaluar({ config: {}, cache: null, csvCargado: false, nCsv: 0, registros: null });
assert("todos los pasos pendientes", ["config", "cache", "sync", "csv", "clasificar"].every(p => r.pasos[p].estado === "pendiente"), r.pasos);
assert("paso activo = config", r.activo === "config", r.activo);
// Primero tu archivo (trae tus datos), luego tus datos y el archivo de Reental.
// Tu archivo siempre está (en este navegador): nunca falta.
assert("faltan 2 cosas (config, csv) en orden", r.faltan.map(f => f.paso).join() === "config,csv", r.faltan);
// La dirección del vault es OPCIONAL, así que no se lista como pendiente (lo que se pierde sin ella se explica en la
// burbuja ⓘ de su campo).
assert("la config nombra los campos que faltan, sin el vault (opcional)",
  /wallet/.test(r.faltan[0].texto) && /API key/.test(r.faltan[0].texto) &&
  /€ por token/.test(r.faltan[0].texto) && !/vault/i.test(r.faltan[0].texto), r.faltan[0].texto);
assert("no se puede preparar, sincronizar ni clasificar", !r.puedeActualizar && !r.puedeSincronizar && !r.puedeClasificar);
assert("sync pide «🔄 Actualizar»", /Actualizar/.test(r.pasos.sync.texto), r.pasos.sync.texto);

/* B) Todo listo */
console.log("B) Requisitos completos");
r = S.arrEvaluar(base({}));
assert("se puede preparar, sincronizar y clasificar", r.puedeActualizar && r.puedeSincronizar && r.puedeClasificar);
assert("nada falta", r.faltan.length === 0, r.faltan);
assert("config/cache/sync/csv en ok; clasificar pendiente y activo", ["config", "cache", "sync", "csv"].every(p => r.pasos[p].estado === "ok") &&
  r.pasos.clasificar.estado === "pendiente" && r.activo === "clasificar", r.pasos);
assert("cache: cuenta las transacciones", r.nTx === 3 && /3 transacciones/.test(r.pasos.cache.texto), r.pasos.cache);

/* C) Sin API key: se clasifica pero no se sincroniza */
console.log("C) Sin API key de Etherscan");
r = S.arrEvaluar(base({ config: Object.assign({}, CFG, { etherscan_api_key: "  " }) }));
assert("config en aviso (solo falta la key)", r.pasos.config.estado === "warn" && /API key/.test(r.pasos.config.texto), r.pasos.config);
assert("se puede clasificar pero no preparar ni sincronizar", r.puedeClasificar && !r.puedeActualizar && !r.puedeSincronizar);
assert("falta la key en la lista", r.faltan.length === 1 && /API key/.test(r.faltan[0].texto), r.faltan);

/* D) Paridad con los requisitos de js/14 */
console.log("D) Mismos requisitos que js/14 para clasificar");
const casos = [
  base({}),
  base({ config: Object.assign({}, CFG, { compra_bancaria_coste_eur_por_token: 0 }) }),
  base({ config: Object.assign({}, CFG, { compra_bancaria_coste_eur_por_token: null }) }),
  base({ config: Object.assign({}, CFG, { wallet: "" }) }),
  base({ config: Object.assign({}, CFG, { vault: undefined }) }),
  base({ cache: null }),
  base({ csvCargado: false }),
  base({ nCsv: 0 }),
];
let iguales = 0;
for (const c of casos) {
  S.__s = { config: c.config, cache: c.cache, csvCargado: c.csvCargado, filasCsv: Array.from({ length: c.nCsv }, () => ({})) };
  vm.runInContext("Object.assign(state, globalThis.__s);", sandbox); // state es const en js/01
  const q = S.requisitosClasificacionOk();
  if ((q.cacheOk && q.csvOk && q.configOk) === S.arrEvaluar(c).puedeClasificar) iguales++;
}
assert("8/8 casos: puedeClasificar ≡ requisitosClasificacionOk", iguales === casos.length, iguales);

/* E) Sincronización en curso, errores y cache sin transacciones */
console.log("E) Estados de la sincronización");
r = S.arrEvaluar(base({ syncCorriendo: true }));
assert("en curso: sync = run y botones bloqueados", r.pasos.sync.estado === "run" && !r.puedeActualizar && !r.puedeSincronizar);
assert("en curso: clasificar a mano sigue permitido (js/14 decide)", r.puedeClasificar);
r = S.arrEvaluar(base({ preparando: true }));
assert("preparando: no se relanza", !r.puedeActualizar);
r = S.arrEvaluar(base({ syncErrores: ["bce", "rnt"] }));
assert("con errores: sync en aviso nombrando los pasos", r.pasos.sync.estado === "warn" && /bce, rnt/.test(r.pasos.sync.texto), r.pasos.sync);
r = S.arrEvaluar(base({ cache: cache(0) }));
assert("cache nueva sin transacciones: sync pendiente y activo", r.pasos.cache.estado === "ok" && r.pasos.sync.estado === "pendiente" &&
  r.activo === "sync" && /Actualizar/.test(r.pasos.sync.texto), r.pasos.sync);

/* F) Clasificación hecha */
console.log("F) Resultado de la clasificación");
r = S.arrEvaluar(base({ registros: [{ revisar: false }, { revisar: true }, { revisar: true }] }));
assert("3 registros · 2 a revisar → aviso", r.pasos.clasificar.estado === "warn" && r.nRegistros === 3 && r.nRevisar === 2 &&
  /3 registros · 2 a revisar/.test(r.pasos.clasificar.texto), r.pasos.clasificar);
r = S.arrEvaluar(base({ registros: [{ revisar: false }] }));
assert("sin nada a revisar → todo ok y ningún paso activo", r.pasos.clasificar.estado === "ok" && r.activo === null, r);
r = S.arrEvaluar(base({ registros: [] }));
assert("clasificación vacía cuenta como hecha (0 registros)", r.pasos.clasificar.estado === "ok" && r.nRegistros === 0);

/* G) Alias de rutas antiguas */
console.log("G) Direcciones antiguas");
const a1 = S.arrAlias("#sync"), a2 = S.arrAlias("clasificacion"), a3 = S.arrAlias("#panel");
assert("#sync → inicio, tarjeta de sincronizar", a1 && a1.vista === "inicio" && a1.ancla === "arrPasoSync", a1);
// No hay tarjeta de clasificación: su resultado vive en la de sincronización,
// así que la dirección antigua #clasificacion baja hasta esa tarjeta.
assert("#clasificacion → inicio, tarjeta donde vive el resultado de clasificar",
  a2 && a2.vista === "inicio" && a2.ancla === "arrPasoSync", a2);
assert("#panel → revisión", a3 && a3.vista === "revision" && a3.ancla === null, a3);
assert("las vistas vigentes no se tocan", ["#inicio", "#revision", "#transacciones", "#dashboard", "", null].every(h => S.arrAlias(h) === null));
assert("sin falsos alias por el prototipo", S.arrAlias("#constructor") === null && S.arrAlias("#toString") === null);

/* H) Entradas no mutadas */
console.log("H) Pureza");
const entrada = base({ registros: [{ revisar: true }] });
const antes = JSON.stringify(entrada);
S.arrEvaluar(entrada);
assert("arrEvaluar no muta la entrada", JSON.stringify(entrada) === antes);
assert("arrNumTx tolera cache nula o series raras", S.arrNumTx(null) === 0 && S.arrNumTx({ transacciones: { x: null, y: [1, 2] } }) === 2);

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
