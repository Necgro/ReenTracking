/* Test unitario de 📒 Transacciones como la pestaña «Blockchain» de Reentax.
 *
 * Funciones bajo prueba (Reental-SPA/js/18-transacciones.js):
 * - txSentido: entrada, salida, entre tus direcciones o nada (sin
 *   inventar); la comisión de red siempre es una salida.
 * - txHtmlSentido: flecha con forma y color, burbuja y aria-label, fuera
 *   del texto de la operación.
 * - txNombresContratos / txContraparte / txDireccionCorta: la otra
 *   dirección del movimiento, acortada, o su nombre si la app la conoce.
 * - txHtmlFila: las 9 columnas en su orden.
 * - txHtmlFilaNota: la nota en su propia fila debajo, o el editor.
 * - Nada cambia por dentro (txHtmlFila no muta el registro; la
 *   clasificación no lee nada de esto).
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_tx1f.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const WALLET = "0x" + "aa".repeat(20), VAULT = "0x" + "bb".repeat(20);
const OTRA = "0x079ce1234567890abcdef1234567890abcd09a2b";
const DIST = "0x" + "d1".repeat(20), POOL = "0x" + "e0".repeat(20), INM = "0x" + "c3".repeat(20);
const PROPIAS = { wallet: WALLET.toUpperCase().replace("0X", "0x"), vault: VAULT };
function reg(clave, categoria, subcategoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-08-31 10:00:00", hash: "0x" + "ef".repeat(32), contrato: "0x" + "a1".repeat(20), token: null, simbolo: null,
    cantidad: 1, categoria, subcategoria, inmueble: null, importe_usdt: null, coste_eur: null,
    origen: "", destino: "", fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}
/* Celdas de una fila: [{ clase, title, html }]. */
function celdas(fila) {
  return [...fila.matchAll(/<td class="([^"]*)"(?: title="([^"]*)")?>([\s\S]*?)<\/td>/g)]
    .map(m => ({ clase: m[1], title: m[2], html: m[3] }));
}
const sinEtiquetas = t => t.replace(/<[^>]+>/g, "");

console.log("== 1. Sentido (D2) ==");
const entrada = reg("e", "RENDIMIENTO", "RCM_REINVERTIDO", { origen: DIST, destino: VAULT });
const salida = reg("s", "VENTA", "GPP_INMUEBLE", { origen: WALLET, destino: OTRA });
const propias = reg("p", "MOVIMIENTO", "NEUTRO", { origen: WALLET, destino: VAULT });
const gasPropio = reg("g", "COMISION", "NEUTRO", { origen: WALLET, destino: VAULT, simbolo: "POL" });
const sinDirs = reg("n", "COMPRA", "COSTE_BASE");
assert("entra en una dirección tuya -> entrada", S.txSentido(entrada, PROPIAS) === "entrada");
assert("sale de una dirección tuya -> salida", S.txSentido(salida, PROPIAS) === "salida");
assert("de una tuya a otra tuya -> entre tus direcciones", S.txSentido(propias, PROPIAS) === "propias");
assert("la comisión de red siempre es una salida (aunque vaya a otra tuya)", S.txSentido(gasPropio, PROPIAS) === "salida");
assert("sin origen ni destino tuyo -> nada (no se inventa)", S.txSentido(sinDirs, PROPIAS) === "" &&
  S.txSentido(reg("x", "VENTA", "GPP_SWAP", { origen: OTRA, destino: DIST }), PROPIAS) === "");
assert("sin vault en la config, el vault no es tuyo", S.txSentido(propias, { wallet: WALLET }) === "salida");
assert("sin config, nada es tuyo (ni la dirección vacía)", S.txSentido(entrada, {}) === "" && S.txSentido(entrada, null) === "" &&
  !S.txEsPropia("", { wallet: "", vault: "" }));

const hE = S.txHtmlSentido("entrada"), hS = S.txHtmlSentido("salida"), hP = S.txHtmlSentido("propias"), hN = S.txHtmlSentido("");
assert("entrada: ↓ con su clase de color, burbuja «Entrada» y aria-label",
  hE === '<span class="tx-sentido tx-s-entrada" role="img" tabindex="0" aria-label="Entrada: Entra en tus direcciones" data-flecha="↓" data-ayuda="Entrada"></span>', hE);
assert("salida: ↑ y «Salida»", hS.includes("tx-s-salida") && hS.includes('data-flecha="↑"') && hS.includes('data-ayuda="Salida"'));
assert("entre tus direcciones: ⇄ y «Entre tus direcciones»", hP.includes("tx-s-propias") && hP.includes('data-flecha="⇄"') && hP.includes('data-ayuda="Entre tus direcciones"'));
assert("se enfoca con el teclado (tabindex) y la flecha no es texto de la celda (la pone el CSS)",
  [hE, hS, hP].every(h => h.includes('tabindex="0"') && sinEtiquetas(h) === ""));
assert("sin sentido: un hueco del mismo ancho, oculto y sin foco", hN === '<span class="tx-sentido tx-s-ninguno" aria-hidden="true"></span>', hN);

console.log("== 2. Contraparte (D7) ==");
const cache = {
  catalogo_propiedades: {
    [INM]: { nombre_etherscan: "Cáceres 8", estado: "CONFIRMADA" },
    ["0x" + "c4".repeat(20)]: { nombre_etherscan: "Candidata 1", estado: "CANDIDATA" },
  },
  contratos_aprendidos: {
    DISTRIBUIDOR: { [DIST.toUpperCase().replace("0X", "0x")]: "Distribuidor de dividendos (cruce CSV)" },
    DEFI_POOL: { [POOL]: "Pool RNT/USDT" },
  },
};
const nombres = S.txNombresContratos(cache);
assert("nombres: distribuidor de Reental con nombre corto y el aprendido (palabras de hoy) en la ayuda",
  nombres[DIST].corto === "Reental · repartos" && nombres[DIST].largo === "Distribuidor de rendimientos (cruce con el archivo de Reental)", nombres[DIST]);
assert("nombres: el pool con su nombre aprendido", nombres[POOL].corto === "Pool RNT/USDT");
assert("nombres: el token de un inmueble confirmado; el candidato no", nombres[INM].corto === "Token Cáceres 8" && !nombres["0x" + "c4".repeat(20)]);
assert("nombres: USDT, USDC y RNT", nombres[S.USDT || vm.runInContext("USDT", S)].corto === "Contrato USDT" &&
  nombres[vm.runInContext("RNT", S)].corto === "Contrato RNT");
assert("nombres: sin cache, solo los fijos", Object.keys(S.txNombresContratos(null)).length === 3);
const ctx = { propias: PROPIAS, nombres };
const cE = S.txContraparte(entrada, ctx), cS = S.txContraparte(salida, ctx), cP = S.txContraparte(propias, ctx);
assert("entrada: la contraparte es el origen, con su nombre y la dirección en la ayuda",
  cE.texto === "Reental · repartos" && cE.ayuda === DIST + " · Distribuidor de rendimientos (cruce con el archivo de Reental)" && cE.conocida, cE);
assert("salida a una desconocida: el destino acortado (0x079ce…09a2b), el completo en la ayuda",
  cS.texto === "0x079ce…09a2b" && cS.ayuda === OTRA && !cS.conocida, cS);
assert("entre tus direcciones: «Tu vault»", cP.texto === "Tu vault" && cP.ayuda === VAULT + " · Tu vault", cP);
assert("de vuelta al wallet: «Tu wallet»", S.txContraparte(reg("w", "MOVIMIENTO", "NEUTRO", { origen: VAULT, destino: WALLET }), ctx).texto === "Tu wallet");
const cBurn = S.txContraparte(reg("b", "COMPRA", "COSTE_BASE", { origen: vm.runInContext("BURN", S), destino: WALLET }), ctx);
assert("la dirección cero, con su nombre y qué es", cBurn.texto === "Dirección cero" && /emisión/.test(cBurn.ayuda), cBurn);
assert("sin sentido no hay contraparte (no se inventa)", S.txContraparte(sinDirs, ctx) === null);
assert("direcciones cortas tal cual", S.txDireccionCorta("0x1234") === "0x1234");

console.log("== 3. La fila: 9 columnas en el orden de D1 ==");
const venta = reg("v", "VENTA", "GPP_INMUEBLE", { origen: WALLET, destino: POOL, inmueble: "Cáceres 8", cantidad: 2, importe_usdt: 120 });
const copia = JSON.stringify(venta);
const fila = S.txHtmlFila(venta, { estadoRevisar: "libre", direcciones: ctx });
const c = celdas(fila);
assert("9 celdas = TX_N_COLUMNAS", c.length === 9 && vm.runInContext("TX_N_COLUMNAS", S) === 9, c.length);
assert("orden: fecha, categoría, token, operación, cantidad, importe, contraparte, tx y acciones",
  JSON.stringify(c.map(x => x.clase)) === JSON.stringify(["tx-fecha", "tx-celcat", "tx-token", "tx-op", "num tx-cant", "num tx-importe", "tx-contraparte", "tx-hash", "tx-acciones"]),
  c.map(x => x.clase));
assert("token: el inmueble, con su número final pegado (espacio que no se parte) y entero en el title",
  sinEtiquetas(c[2].html) === "Cáceres 8" && c[2].title === "Cáceres 8", c[2]);
assert("operación: la flecha delante y el texto aparte",
  c[3].html === S.txHtmlSentido("salida") + '<span class="tx-op-texto">Venta de tokens</span>', c[3].html);
assert("contraparte con nombre: sin letra de máquina", c[6].clase === "tx-contraparte" && c[6].html === "Pool RNT/USDT" && c[6].title === POOL + " · Pool RNT/USDT");
const cDesc = celdas(S.txHtmlFila(salida, { estadoRevisar: "libre", direcciones: ctx }))[6];
assert("contraparte desconocida: acortada y en letra de máquina", cDesc.clase === "tx-contraparte mono" && cDesc.html === "0x079ce…09a2b");
const cSin = celdas(S.txHtmlFila(sinDirs, { estadoRevisar: "libre", direcciones: ctx }))[6];
assert("sin contraparte: «—» con su ayuda", cSin.html === "—" && /Sin dirección/.test(cSin.title));
assert("sin direcciones (opts sin contexto) no rompe: sin flecha ni contraparte",
  celdas(S.txHtmlFila(salida, { estadoRevisar: "libre" }))[6].html === "—");
assert("D8: pintar la fila no cambia el registro", JSON.stringify(venta) === copia);
assert("el ✏️ dice si su nota está abierta (aria-expanded)",
  fila.includes('data-accion="nota" data-clave="v" aria-expanded="false"') &&
  S.txHtmlFila(venta, { estadoRevisar: "libre", direcciones: ctx, editandoNota: true }).includes('aria-expanded="true"'));

console.log("== 4. La nota, en su propia fila debajo (D6) ==");
assert("sin nota y sin editar: no hay fila", S.txHtmlFilaNota(venta, "", false) === "");
const fN = S.txHtmlFilaNota(venta, "Gas de la compra <de> mayo", false);
assert("con nota: una fila de 9 columnas, con la clase de su categoría y la nota en cursiva (escapada)",
  fN.startsWith('<tr class="tx-fila-nota tx-c-VENTA" data-clave="v"><td colspan="9"><div class="tx-nota-caja">') &&
  fN.includes('<span class="tx-notap-texto">Gas de la compra &lt;de&gt; mayo</span>') && !fN.includes("<de>"), fN);
assert("la fila de la nota NO es una tx-fila (los recuentos y arneses no la cuentan)", !/class="tx-fila /.test(fN));
assert("la fila con nota se marca para quitarle la línea de abajo",
  S.txHtmlFila(venta, { estadoRevisar: "libre", notaPersonal: "x" }).startsWith('<tr class="tx-fila tx-c-VENTA tx-con-notap"'));
const fEd = S.txHtmlFilaNota(venta, "Antigua", true, null);
assert("editando: textarea con la nota, su límite y aria-label; Intro guarda · Esc cancela",
  /<textarea class="tx-nota-texto" rows="2" maxlength="500" data-clave="v" aria-label="Tu nota para Cáceres 8 del 31\/08\/2026\. Intro guarda, Escape cancela\."/.test(fEd) &&
  fEd.includes(">Antigua</textarea>") && fEd.includes("Intro guarda · Esc cancela"), fEd);
assert("editando una nota que existe: guardar, borrar y cancelar",
  ['data-accion="nota-guardar"', 'data-accion="nota-borrar"', 'data-accion="nota-cancelar"'].every(a => fEd.includes(a)));
const fNueva = S.txHtmlFilaNota(venta, "", true, null);
assert("editando sin nota: sin «Borrar»", fNueva.includes('data-accion="nota-guardar"') && !fNueva.includes("nota-borrar"));
assert("el borrador manda sobre la nota guardada (sobrevive al repintado)",
  S.txHtmlFilaNota(venta, "Antigua", true, "Nueva <b>").includes(">Nueva &lt;b&gt;</textarea>"));

console.log("== 5. D8: nada cambia por dentro ==");
const motor = fs.readFileSync(path.join(BASE, "14-clasificador.js"), "utf8");
assert("el motor no usa nada de esto", !/txSentido|txContraparte|tx-sentido/.test(motor));
const src = fs.readFileSync(path.join(BASE, "18-transacciones.js"), "utf8");
assert("guardar la nota sigue sin reclasificar",
  /function txEditorNota[\s\S]*?\n}/.exec(src)[0].indexOf("ejecutarClasificacion") === -1);
assert("ya no hay diálogo de la nota (se escribe debajo de la fila)", !/txDlgNota/.test(src));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
