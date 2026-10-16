/* Test unitario de 🚫 con «Este movimiento», «Toda la dirección» y
 * «Todo el token» en 📒 Transacciones.
 *
 * Bajo prueba:
 * - js/14 (clasificarIndividual): con el bloque spam_usuario de la cache, lo
 *   que llega de una dirección apartada y todo lo de un token apartado es
 *   spam; nunca una dirección o un token conocidos; lo que le envías a la
 *   dirección, no.
 * - js/18: txOpcionesApartar (qué opciones salen en cada fila),
 *   txSpamUsuarioCon / txSpamUsuarioSin (el bloque que se guarda y que
 *   deshacer lo deja como estaba, sin bloque vacío), txReglaSpam y
 *   txEstadoSpam (↩ «Quitar del spam» de lo apartado), txMotivoSpam (los
 *   motivos nuevos y «Dirección que intenta imitar la tuya»), txHtmlFilaApartar y
 *   txHtmlFila.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz):
 *     node tests/test_transacciones_paso_apartar2.js
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
const MOTOR = ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"];

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const WALLET = "0x" + "e1".repeat(20), VAULT = "0x" + "e2".repeat(20);
const DESCONOCIDO = "0x" + "e9".repeat(20), OTRA = "0x" + "a8".repeat(20);
const DISTRIBUIDOR = "0x" + "d7".repeat(20), FALSO = "0x" + "f5".repeat(20);
const IMITA = "0x" + "e1e" + "0".repeat(34) + "1e1";
const sb0 = nuevoSandbox(MOTOR);
const USDT = vm.runInContext("USDT", sb0);
const h = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
const ts = (a, m, d) => String(Math.floor(Date.UTC(a, m - 1, d, 12) / 1000));
const tx = (hash, origen, destino, unidades, marca, contrato = USDT, simbolo = "USDT0") => ({
  hash, contractAddress: contrato, from: origen, to: destino,
  value: String(Math.round(unidades * 1e6)), tokenDecimal: "6",
  tokenName: simbolo, tokenSymbol: simbolo, timeStamp: marca,
});
const CABECERA = "id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date";

function clasificar(transfers, spamUsuario) {
  const sb = nuevoSandbox(MOTOR);
  const cache = sb.cacheVacia();
  cache.contratos_aprendidos.DISTRIBUIDOR[DISTRIBUIDOR] = "Distribuidor";
  cache.transacciones.wallet_tokens = transfers.filter(t => [t.from, t.to].includes(WALLET));
  cache.transacciones.vault_tokens = transfers.filter(t => [t.from, t.to].includes(VAULT));
  if (spamUsuario !== undefined) cache.spam_usuario = spamUsuario;
  /* js/01 declara su propio `state`: se pone desde dentro de la VM. */
  Object.assign(sb, { __cache: cache, __config: { wallet: WALLET, vault: VAULT, compra_bancaria_coste_eur_por_token: 100 } });
  vm.runInContext(`state.config = __config; __r = cargarCsvRendimientos("${CABECERA}");
    __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});`, sb);
  return sb.__regs;
}
const delHash = (regs, hash) => regs.filter(r => r.hash === hash);
const uno = (regs, hash) => delHash(regs, hash)[0] || {};

console.log("== 1. Motor (js/14): «Toda la dirección» ==");
{
  const transfers = [
    tx(h(1), DESCONOCIDO, WALLET, 0.0001, ts(2026, 6, 19)),
    tx(h(2), DESCONOCIDO, VAULT, 5, ts(2026, 6, 20)),
    tx(h(3), OTRA, WALLET, 0.0001, ts(2026, 6, 21)),
    tx(h(4), WALLET, DESCONOCIDO, 1, ts(2026, 6, 22)),
  ];
  const base = clasificar(transfers);
  assert("sin bloque, el depósito sigue siendo depósito", uno(base, h(1)).categoria === "DEPOSITO");
  const regs = clasificar(transfers, { direcciones: { [DESCONOCIDO]: { fecha: "2026-10-01" } } });
  const notaDir = vm.runInContext("NOTA_SPAM_DIRECCION", sb0);
  assert("lo que llega de ella (a la wallet y al vault) es spam con su nota",
    [h(1), h(2)].every(x => uno(regs, x).categoria === "SPAM" && uno(regs, x).subcategoria === "NEUTRO" &&
      uno(regs, x).revisar === false && uno(regs, x).nota === notaDir), [uno(regs, h(1)), uno(regs, h(2))]);
  assert("lo de otra dirección no cambia", uno(regs, h(3)).categoria === "DEPOSITO");
  assert("lo que le envías no es spam", uno(regs, h(4)).categoria === "RETIRADA", uno(regs, h(4)).categoria);
  const mayus = clasificar(transfers, { direcciones: { ["0x" + DESCONOCIDO.slice(2).toUpperCase()]: {} } });
  assert("la clave se normaliza", uno(mayus, h(1)).categoria === "SPAM");
  const conocida = clasificar([tx(h(5), DISTRIBUIDOR, WALLET, 7, ts(2026, 6, 23)), tx(h(6), VAULT, WALLET, 3, ts(2026, 6, 24))],
    { direcciones: { [DISTRIBUIDOR]: {}, [VAULT]: {} } });
  const cats = conocida.filter(r => r.hash === h(5) || r.hash === h(6)).map(r => r.categoria);
  assert("nunca una dirección conocida (Reental o tu vault)", cats.length >= 2 && !cats.includes("SPAM"), cats);
}

console.log("== 2. Motor (js/14): «Todo el token» ==");
{
  const transfers = [
    tx(h(7), OTRA, WALLET, 100, ts(2026, 7, 1), FALSO, "USDT"),
    tx(h(8), WALLET, OTRA, 40, ts(2026, 7, 2), FALSO, "USDT"),
    tx(h(9), OTRA, WALLET, 3, ts(2026, 7, 3)),
  ];
  assert("sin bloque, un «USDT» falso con nombre limpio no es spam", uno(clasificar(transfers), h(7)).categoria !== "SPAM");
  const regs = clasificar(transfers, { tokens: { [FALSO]: { fecha: "2026-10-01", simbolo: "USDT" } } });
  const notaTok = vm.runInContext("NOTA_SPAM_TOKEN", sb0);
  assert("entradas y salidas del token, spam con su nota",
    [h(7), h(8)].every(x => uno(regs, x).categoria === "SPAM" && uno(regs, x).nota === notaTok), [uno(regs, h(7)), uno(regs, h(8))]);
  assert("lo demás no cambia", uno(regs, h(9)).categoria === "DEPOSITO");
  assert("nunca un token conocido (USDT)", uno(clasificar(transfers, { tokens: { [USDT]: {} } }), h(9)).categoria === "DEPOSITO");
  for (const malo of [[], "x", { direcciones: [] }, { direcciones: null, tokens: 3 }]) {
    assert("bloque mal formado (" + JSON.stringify(malo) + "): se ignora",
      uno(clasificar(transfers, malo), h(9)).categoria === "DEPOSITO");
  }
}

console.log("== 3. Qué opciones salen en cada fila (js/18) ==");
const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"]);
S.__config = { wallet: WALLET, vault: VAULT };
vm.runInContext("state.config = __config;", S);
const ctx = S.construirContexto(Object.assign(S.cacheVacia(), {
  contratos_aprendidos: Object.assign(S.cacheVacia().contratos_aprendidos, { DISTRIBUIDOR: { [DISTRIBUIDOR]: "Distribuidor" } }),
}));
function reg(clave, categoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-08-31 10:00:00", hash: "0x" + "ef".repeat(32), contrato: USDT, token: "USDT0", simbolo: "USDT0",
    cantidad: 0.00001, categoria, subcategoria: "X", importe_usdt: null, origen: DESCONOCIDO, destino: WALLET,
    fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}
const op = r => JSON.stringify(S.txOpcionesApartar(r, ctx));
assert("depósito de una dirección desconocida: la dirección (USDT es conocido: sin token)",
  op(reg("k", "DEPOSITO")) === JSON.stringify({ direccion: DESCONOCIDO, token: "" }), op(reg("k", "DEPOSITO")));
assert("a revisar de una dirección desconocida: la dirección", JSON.parse(op(reg("k", "REVISAR"))).direccion === DESCONOCIDO);
assert("token desconocido: dirección y token",
  op(reg("k", "DEPOSITO", { contrato: FALSO })) === JSON.stringify({ direccion: DESCONOCIDO, token: FALSO }));
assert("salida de un token desconocido: solo el token (lo que envías no se aparta por dirección)",
  op(reg("k", "RETIRADA", { contrato: FALSO, origen: WALLET, destino: DESCONOCIDO })) === JSON.stringify({ direccion: "", token: FALSO }));
assert("traspaso entre tus direcciones: nada", op(reg("k", "MOVIMIENTO", { origen: VAULT })) === JSON.stringify({ direccion: "", token: "" }));
assert("de una dirección de Reental: nada", JSON.parse(op(reg("k", "DEPOSITO", { origen: DISTRIBUIDOR }))).direccion === "");
assert("POL (sin contrato): nada",
  op(reg("k", "DEPOSITO", { contrato: "pol", simbolo: "POL" })) === JSON.stringify({ direccion: "", token: "" }));
assert("un spam: nada", op(reg("k", "SPAM", { contrato: FALSO })) === JSON.stringify({ direccion: "", token: "" }));
assert("ya apartada: no se ofrece otra vez",
  JSON.parse(JSON.stringify(S.txOpcionesApartar(reg("k", "DEPOSITO"), Object.assign({}, ctx, { spamDirecciones: new Set([DESCONOCIDO]) })))).direccion === "");

console.log("== 4. El bloque que se guarda y deshacer ==");
const F = "2026-10-01T10:00:00.000Z";
const b1 = S.txSpamUsuarioCon(undefined, "direcciones", DESCONOCIDO.toUpperCase().replace("0X", "0x"), F);
assert("dirección: clave normalizada y la fecha", JSON.stringify(b1) === JSON.stringify({ direcciones: { [DESCONOCIDO]: { fecha: "2026-10-01" } } }), b1);
const b2 = S.txSpamUsuarioCon(b1, "tokens", FALSO, F, "USDT");
assert("token: con su símbolo, sin tocar lo anterior",
  JSON.stringify(b2) === JSON.stringify({ direcciones: { [DESCONOCIDO]: { fecha: "2026-10-01" } }, tokens: { [FALSO]: { fecha: "2026-10-01", simbolo: "USDT" } } }), b2);
assert("no muta el bloque recibido", !b1.tokens);
let lanza = false;
try { S.txSpamUsuarioCon(b1, "direcciones", "", F); } catch (e) { lanza = true; }
assert("sin dirección, lanza", lanza);
const b3 = S.txSpamUsuarioSin(b2, "tokens", FALSO);
assert("quitar el token deja solo la dirección", JSON.stringify(b3) === JSON.stringify(b1), b3);
assert("quitar lo último deja SIN bloque (la cache, como antes)", S.txSpamUsuarioSin(b3, "direcciones", DESCONOCIDO) === null);
assert("quitar algo que no está, lanza", (() => { try { S.txSpamUsuarioSin(b1, "tokens", FALSO); } catch (e) { return true; } return false; })());

console.log("== 5. Filas apartadas: ↩ y su marca ==");
const ctxB2 = Object.assign({}, ctx, { spamDirecciones: new Set([DESCONOCIDO]), spamTokens: new Set([FALSO]) });
const notaDir = vm.runInContext("NOTA_SPAM_DIRECCION", S), notaTok = vm.runInContext("NOTA_SPAM_TOKEN", S);
const apartadaDir = reg("d", "SPAM", { nota: notaDir });
const apartadaTok = reg("t", "SPAM", { nota: notaTok, contrato: FALSO });
assert("txReglaSpam: la dirección de un spam apartado por dirección",
  JSON.stringify(S.txReglaSpam(apartadaDir, ctxB2)) === JSON.stringify({ tipo: "direcciones", valor: DESCONOCIDO }));
assert("txReglaSpam: el token de un spam apartado por token",
  JSON.stringify(S.txReglaSpam(apartadaTok, ctxB2)) === JSON.stringify({ tipo: "tokens", valor: FALSO }));
assert("txReglaSpam: nada si ya no está apartada", S.txReglaSpam(apartadaDir, ctx) === null);
assert("txReglaSpam: nada en un spam de la app", S.txReglaSpam(reg("x", "SPAM", { nota: "senales de spam en el nombre del token" }), ctxB2) === null);
const regla = S.txReglaSpam(apartadaDir, ctxB2);
assert("txEstadoSpam: «regla» (↩ quita la regla)", S.txEstadoSpam(apartadaDir, {}, { regla }) === "regla");
assert("txEstadoSpam: un ajuste tuyo manda sobre la regla",
  S.txEstadoSpam(apartadaDir, { d: { categoria: "SPAM", subcategoria: "NEUTRO", revisar: false, nota: "Mandado al spam por ti (2026-10-01)" } }, { regla }) === "quitar");
const htmlDir = S.txHtmlFila(apartadaDir, { estadoSpam: "regla", regla, motivoSpam: "Dirección marcada como spam" });
assert("fila: ↩ «Quitar del spam» con «Toda la dirección.» y sin 🔍",
  /data-accion="quitar-regla-spam"/.test(htmlDir) && /<b>Quitar del spam<\/b> Toda la dirección\./.test(htmlDir) &&
  !/mandar-revisar/.test(htmlDir), htmlDir);
assert("fila: marca 🚫 «Dirección marcada como spam»",
  /tx-marca-spam[^>]*>🚫<span class="tx-burbuja" aria-hidden="true">Dirección marcada como spam</.test(htmlDir));
const htmlTok = S.txHtmlFila(apartadaTok, { estadoSpam: "regla", regla: S.txReglaSpam(apartadaTok, ctxB2) });
assert("fila de token: «Todo el token.» y su marca",
  /<b>Quitar del spam<\/b> Todo el token\./.test(htmlTok) && /Token marcado como spam/.test(htmlTok));

console.log("== 6. Motivos del spam ==");
const ctxSpam = S.txContextoSpam({});
assert("«Dirección marcada como spam»", S.txEtiquetaMotivoSpam(S.txMotivoSpam(apartadaDir, ctxSpam)) === "Dirección marcada como spam");
assert("«Token marcado como spam»", S.txEtiquetaMotivoSpam(S.txMotivoSpam(apartadaTok, ctxSpam)) === "Token marcado como spam");
const imita = reg("i", "SPAM", { nota: vm.runInContext("NOTA_IMITA_DIRECCION", S), origen: IMITA });
assert("«Dirección que intenta imitar la tuya» (antes, «Otro motivo»)", S.txEtiquetaMotivoSpam(S.txMotivoSpam(imita, ctxSpam)) === "Dirección que intenta imitar la tuya");
const imitaMotor = uno(clasificar([tx(h(10), IMITA, WALLET, 0.0001, ts(2026, 6, 19))]), h(10));
assert("la nota del motor es la que reconoce la tabla", imitaMotor.nota === vm.runInContext("NOTA_IMITA_DIRECCION", S), imitaMotor.nota);

console.log("== 7. Opciones debajo de la fila ==");
const dep = reg("k", "DEPOSITO", { contrato: FALSO, simbolo: "USDT" });
const fa = S.txHtmlFilaApartar(dep, { direccion: DESCONOCIDO, token: FALSO });
assert("una fila debajo, con las 9 columnas", /^<tr class="tx-fila-apartar[^"]*" data-clave="k"><td colspan="9">/.test(fa), fa.slice(0, 120));
const etiquetas = [...fa.matchAll(/<button[^>]*data-accion="([^"]+)"[^>]*>([^<]*)</g)].map(m => m[1] + ":" + m[2]);
assert("Este movimiento · Toda la dirección (corta) · Todo el token (símbolo) · Cancelar",
  JSON.stringify(etiquetas) === JSON.stringify(["spam-movimiento:Este movimiento", "spam-direccion:Toda la dirección 0xe9e9e…9e9e9",
    "spam-token:Todo el token USDT", "spam-cancelar:Cancelar"]), etiquetas);
assert("la dirección completa en la ayuda", fa.includes('title="' + DESCONOCIDO + '"'));
const soloDir = S.txHtmlFilaApartar(reg("k", "DEPOSITO"), { direccion: DESCONOCIDO, token: "" });
assert("sin token, no sale «Todo el token»", !/spam-token/.test(soloDir) && /spam-direccion/.test(soloDir));

console.log("== 8. Solo las opciones que alcanzan al movimiento (arreglo tras la revisión) ==");
{
  /* La regla solo actúa en lo que no casan antes las reglas por hash: al
     pulsar 🚫 se clasifica con ella puesta y se quita la opción que no
     mandaría ESTE movimiento al spam. */
  const cache = S.cacheVacia();
  cache.transacciones.wallet_tokens = [tx(h(20), DESCONOCIDO, WALLET, 0.0001, ts(2026, 6, 19))];
  Object.assign(S, { __cache: cache, __cfg: { wallet: WALLET, vault: VAULT, compra_bancaria_coste_eur_por_token: 100 } });
  /* Un reparto cualquiera: sin filas, la app no deja clasificar. */
  S.__csv = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet\n" +
    "\"Prueba ES#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + WALLET;
  vm.runInContext(`state.config = __cfg; state.cache = __cache; __r = cargarCsvRendimientos(__csv);
    state.filasCsv = __r.filas; state.indicePorHash = __r.indicePorHash; state.csvCargado = true;
    __regs = clasificarTransacciones(state.cache, __r.filas, __r.indicePorHash, state.config, {});`, S);
  const dep = S.__regs.find(r => r.hash === h(20));
  const ofrecidas = S.txOpcionesApartar(dep, S.construirContexto(cache));
  assert("la dirección alcanza al depósito: se queda",
    S.txOpcionesQueAlcanzan(dep, ofrecidas).direccion === DESCONOCIDO, ofrecidas);
  assert("simular no toca la cache", !("spam_usuario" in cache));
  vm.runInContext(`__original = clasificarTransacciones;
    clasificarTransacciones = (...a) => __original(...a).map(r => Object.assign({}, r, { categoria: "DEPOSITO" }));`, S);
  assert("si con la regla no acabaría en el spam, la opción se quita",
    S.txOpcionesQueAlcanzan(dep, ofrecidas).direccion === "");
  vm.runInContext(`clasificarTransacciones = __original; state.csvCargado = false;`, S);
  assert("si ahora no se puede clasificar, se deja como está", S.txOpcionesQueAlcanzan(dep, ofrecidas).direccion === DESCONOCIDO);
}

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
