/* Test de la tanda P, P4 y P8 (🔍 Revisión).
 *
 * Bajo prueba:
 * - P8 (js/05, saneaCatalogoYRoles): una DESCARTADA de una copia vieja pasa
 *   al spam de todo el token (spam_usuario.tokens) y queda con dudas; no
 *   pisa lo que ya estaba en el spam; un bloque de spam (o sus tokens) mal
 *   escrito se aparta en spam_usuario_no_leido y se migra igual (A3); dos
 *   veces da lo mismo.
 * - P4 (js/15, ccOpcionesDecision + ccContextoCandidatos): «🏠 Es un
 *   inmueble» solo en un token con dudas del catálogo (no en uno mandado al
 *   spam, ni en un inmueble, ni en lo sacado del archivo de Reental, ni sin
 *   dirección, A7). Un token del spam que la app reconoce sigue con dudas (A6).
 * - Auditoría (js/11 pnDescartarToken, js/18 txQuitarRegla), con la app
 *   clasificando en Node: descartar un confirmado a mano y deshacerlo con ↩
 *   lo deja confirmado (A2); no se descarta si ningún movimiento pasaría a
 *   spam (A1) ni sin el archivo de Reental, y lo dice (A5); el registro no
 *   cuenta como candidatas las descartadas (A4).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_revision_paso_p4p8.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "08-coingecko.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js", "11-panel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
vm.runInContext("log = function () {};", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const json = x => JSON.stringify(x);
const dir = c => "0x" + c.repeat(40);
const A = dir("a"), B = dir("b"), C = dir("c"), D = dir("d");

console.log("== P8 · DESCARTADA de una copia vieja ==");
const vieja = () => ({
  catalogo_propiedades: {
    [A]: { nombre_reental: "Cáceres 8", simbolo: "RCAC8", estado: "CONFIRMADA" },
    [B.toUpperCase().replace("0X", "0x")]: { nombre_etherscan: "Basura", simbolo: "BAS", estado: " descartada " },
    [C]: { nombre_etherscan: "Otra", estado: "DESCARTADA" },
  },
});
let c = vieja();
S.saneaCatalogoYRoles(c);
assert("pasa al spam de todo el token (normalizada, con su símbolo; sin símbolo, solo la fecha)",
  json(c.spam_usuario) === json({ tokens: { [B]: { fecha: "", simbolo: "BAS" }, [C]: { fecha: "" } } }), c.spam_usuario);
assert("queda con dudas; el inmueble no se toca",
  c.catalogo_propiedades[C].estado === "CANDIDATA" && c.catalogo_propiedades[A].estado === "CONFIRMADA");
assert("en el catálogo ya sale como spam (fuera de la lista)",
  json(S.pnFilasVisibles(S.pnFilasCatalogo(c)).map(f => f.addr)) === json([A]));
const antes = json(c);
S.saneaCatalogoYRoles(c);
assert("dos veces, lo mismo", json(c) === antes);

c = vieja();
c.spam_usuario = { direcciones: { [D]: { fecha: "2026-01-01" } }, tokens: { [C]: { fecha: "2026-02-02", simbolo: "OTR" } } };
S.saneaCatalogoYRoles(c);
assert("no pisa lo que ya estaba en el spam y conserva las direcciones",
  json(c.spam_usuario) === json({ direcciones: { [D]: { fecha: "2026-01-01" } }, tokens: { [C]: { fecha: "2026-02-02", simbolo: "OTR" }, [B]: { fecha: "", simbolo: "BAS" } } }), c.spam_usuario);

for (const [malo, apartado, queda] of [["texto", "texto", undefined], [[], [], undefined],
  [{ tokens: "texto", direcciones: { [D]: {} } }, { tokens: "texto" }, { direcciones: { [D]: {} } }], [{ tokens: null }, undefined, {}]]) {
  c = vieja();
  c.spam_usuario = malo;
  S.saneaCatalogoYRoles(c);
  const tokens = c.spam_usuario && c.spam_usuario.tokens;
  delete (c.spam_usuario || {}).tokens;
  assert("A3: spam mal escrito (" + json(malo) + "): se aparta lo roto, se conserva lo bueno y se migra",
    json(c.spam_usuario_no_leido) === json(apartado) && json(c.spam_usuario) === json(queda || {}) &&
    json(Object.keys(tokens)) === json([B, C]) && c.catalogo_propiedades[C].estado === "CANDIDATA", c);
}
c = { catalogo_propiedades: {}, spam_usuario: "otra vez", spam_usuario_no_leido: "antes" };
S.saneaCatalogoYRoles(c);
assert("A3: lo apartado antes no se pierde", json(c.spam_usuario_no_leido) === json(["antes", "otra vez"]) && !("spam_usuario" in c));

console.log("== P4 · «🏠 Es un inmueble» en la tarjeta ==");
const cache = {
  catalogo_propiedades: {
    [A]: { estado: "CONFIRMADA", nombre_reental: "Cáceres 8" },
    [B]: { estado: "CANDIDATA", nombre_etherscan: "Rentas 3" },
    [C]: { estado: "CANDIDATA", nombre_etherscan: "Spam" },
  },
  spam_usuario: { tokens: { [C]: { fecha: "" } } },
};
const W = dir("1"), T = dir("7");
const ctx = S.ccContextoCandidatos(cache, { wallet: W }, []);
assert("el contexto lleva los tokens con dudas, sin los del spam", json([...ctx.dudas]) === json([B]), [...ctx.dudas]);
const reg = (contrato, extra) => Object.assign({ clave: "k", hash: "0x" + "ab".repeat(32), categoria: "REVISAR", contrato,
  origen: T, destino: W, cantidad: 3, simbolo: "X" }, extra);
const ids = r => S.ccOpcionesDecision(r, ctx).map(o => o.id);
const opsB = S.ccOpcionesDecision(reg(B), ctx);
assert("token con dudas: «🏠 Es un inmueble» primero, con su burbuja",
  opsB[0].id === "inmueble" && opsB[0].etiqueta === "🏠 Es un inmueble" && !opsB[0].pide && /catálogo/.test(opsB[0].ayuda), opsB);
assert("y siguen neutro y spam", json(ids(reg(B))) === json(["inmueble", "neutro", "spam"]), ids(reg(B)));
assert("también en lo que sale", ids(reg(B, { origen: W, destino: T }))[0] === "inmueble");
assert("no en un token mandado al spam", !ids(reg(C)).includes("inmueble"));
assert("no en un inmueble confirmado", !ids(reg(A)).includes("inmueble"));
assert("no en lo sacado del archivo de Reental", !ids(reg(B, { fuente: "CSV_REENTAL" })).includes("inmueble"));
assert("sin contexto de dudas (otro llamador), nada", !S.ccOpcionesDecision(reg(B), {}).some(o => o.id === "inmueble"));
assert("A7: sin dirección (POL), nada aunque el catálogo traiga una clave vacía",
  !S.ccOpcionesDecision(reg(""), Object.assign({}, ctx, { dudas: new Set([""]) })).some(o => o.id === "inmueble"));
const conocido = { catalogo_propiedades: { [C]: { estado: "CANDIDATA" } }, spam_usuario: { tokens: { [C]: {} } },
  contratos_aprendidos: { DEFI_POOL: { [C]: "Pool" } } };
assert("A6: un token del spam que la app reconoce sigue con dudas, a la vista",
  S.dudasCatalogoCache(conocido).has(C) && S.pnFilasCatalogo(conocido)[0].estado === "CANDIDATA");

console.log("== Auditoría · descartar y deshacer, con la app clasificando ==");
const sb = { console: Object.assign({}, console, { error: () => {} }), document: { getElementById: () => null } };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "08-coingecko.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "18-transacciones.js", "11-panel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
vm.runInContext(`
  var __toasts = [];
  log = function () {};
  toast = function (m, t) { __toasts.push(String(m)); };
  marcarCacheDirty = function () { state.cacheDirty = true; };
  autoGuardarCache = async function () { state.cacheDirty = false; };
  renderPanel = function () {}; pnPintarPreciosPol = function () {};
`, sb);
const V = dir("2"), P1 = dir("e"), MAN = dir("f"), NEU = dir("9");
const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
const leg = (h, contrato, nombre, simbolo, t) => ({ blockNumber: "1" + t, timeStamp: String(Date.UTC(2026, 2, t) / 1000), hash: h,
  from: T, to: W, contractAddress: contrato, value: "3000000000000000000", tokenName: nombre, tokenSymbol: simbolo, tokenDecimal: "18" });
vm.runInContext("state.config = " + json({ wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100, etherscan_api_key: "TEST" }), sb);
const cc = sb.cacheVacia();
cc.transacciones.wallet_tokens.push(leg(Hh(1), P1, "Prueba Alcazaba 1", "RALC1", 1), leg(Hh(2), MAN, "Mystery Asset", "MYS", 2),
  leg(Hh(3), NEU, "Otra Cosa", "OTR", 3));
sb.__c = cc;
vm.runInContext("state.cache = __c; state.cacheDirty = false;", sb);
const csv = sb.cargarCsvRendimientos("dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet\n" +
  "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,4,0,4,0,\"['0x" + "99".repeat(32) + "']\"," + W);
sb.__csv = csv;
vm.runInContext("state.filasCsv = __csv.filas; state.indicePorHash = __csv.indicePorHash; state.csvCargado = true; ejecutarClasificacion();", sb);
const g = e => vm.runInContext(e, sb);
const regDe = a => g("state.registros").find(r => r.contrato === a);
const ultimo = () => g("__toasts").slice(-1)[0] || "";
assert("parte: MYS y OTR con dudas", cc.catalogo_propiedades[MAN].estado === "CANDIDATA" && cc.catalogo_propiedades[NEU].estado === "CANDIDATA");
// OTR: su único movimiento lo decides neutro en 🔍.
cc.ajustes_usuario = sb.ccAjustesConDecision(cc.ajustes_usuario, regDe(NEU), "neutro", null, "2026-10-14T10:00:00");
g("ejecutarClasificacion({ avisos: false })");
assert("A4: el registro no cuenta las descartadas (parte con 2 candidatas)", g("state.ultimaClasificacion.candidatas") === 2);

(async () => {
  await g("pnCambiarEstadoCatalogo(" + json(MAN) + ", 'CONFIRMADA')");
  await g("pnCambiarEstadoCatalogo(" + json(MAN) + ", 'DESCARTADA')");
  assert("A2: descartar un confirmado a mano: a spam, con su estado de antes",
    cc.catalogo_propiedades[MAN].estado === "CANDIDATA" && cc.spam_usuario.tokens[MAN].estado_antes === "CONFIRMADA" &&
    regDe(MAN).categoria === "SPAM" && /^Token mandado al spam: 1 movimiento/.test(ultimo()), [cc.spam_usuario, ultimo()]);
  assert("A4: y el registro ya no lo cuenta como candidata", g("state.ultimaClasificacion.candidatas") === 1);
  await g("txQuitarRegla(" + json(regDe(MAN).clave) + ")");
  assert("A2: su ↩ de 📒 lo devuelve confirmado (inmueble)",
    cc.catalogo_propiedades[MAN].estado === "CONFIRMADA" && !cc.spam_usuario && !!regDe(MAN).inmueble, [cc.catalogo_propiedades[MAN], ultimo()]);

  const antesNeu = json(cc);
  await g("pnCambiarEstadoCatalogo(" + json(NEU) + ", 'DESCARTADA')");
  assert("A1: con su único movimiento ya decidido, no se descarta y lo dice",
    json(cc) === antesNeu && /^No se ha descartado: ningún movimiento suyo pasaría a spam/.test(ultimo()), ultimo());

  g("state.csvCargado = false");
  await g("pnCambiarEstadoCatalogo(" + json(MAN) + ", 'DESCARTADA')");
  const t = g("__toasts").slice(-2);
  assert("A5: sin el archivo de Reental no se descarta y lo dice (y qué falta)",
    cc.catalogo_propiedades[MAN].estado === "CONFIRMADA" && !cc.spam_usuario &&
    t[0] === "No se ha descartado." && /Falta el archivo de rendimientos/.test(t[1]), t);

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})();
