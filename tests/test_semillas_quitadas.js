/* Test de «quitar también las direcciones que trae la app»: las 6 semillas DeFi de 🔍 Revisión se
 * pueden quitar, con aviso, y no vuelven al abrir la cache.
 *
 * Bajo prueba:
 * - js/11 pnQuitarContrato: una semilla se quita solo si se acepta el aviso
 *   (que dice que viene con la app) y queda apuntada en «semillas_quitadas»;
 *   lo añadido a mano, con su pregunta de siempre y sin apuntarse.
 * - js/05 asegurarEstructuraCache / sembrarContratosDefi: una quitada no se
 *   vuelve a sembrar, y si la cache la vuelve a traer, se quita otra vez;
 *   una cache nueva no lleva la lista; una lista mal escrita no se usa, se
 *   avisa y no se borra.
 * - js/11 pnAñadirContrato: volver a añadirla con su tipo la olvida (y la
 *   lista vacía desaparece); con otro tipo, sigue sin sembrarse en el suyo.
 * - Lo de Reental (distribuidores, liquidación) sigue sin ✕.
 * Además:
 * - js/14: lo que pasa en un hash con una semilla quitada queda a
 *   revisar, con su nota; sin lista, nada cambia; añadida con otro tipo, no.
 * - js/11: las quitadas se enseñan con «↩ Volver a poner», que la
 *   devuelve con su tipo y su nombre de serie.
 * - js/10: el token de una semilla quitada no entra en el catálogo y
 *   la dirección no se aprende como distribuidor de Reental.
 * - js/11: al añadirla, el aviso cuenta las decisiones que siguen.
 * - js/11: el aviso de quitar usa el nombre de serie.
 * - js/05: también se quita con la clave escrita en mayúsculas.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_semillas_quitadas.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA");
const campos = { inpContratoDir: { value: "" }, inpContratoNombre: { value: "" }, selContratoTipo: { value: "" } };
const registro = [];
const S = { console, document: { getElementById: id => campos[id] || null } };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "08-coingecko.js", "10-csv-descubrimiento.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js", "11-panel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, "js", f), "utf8"), S, { filename: f });
}
// Sin pantalla: ni guardar en disco, ni avisos flotantes, ni clasificar.
let guardados = 0, respuesta = true, preguntas = [], avisos = [];
S.pnGuardarYClasificar = async () => { guardados++; };
S.toast = msg => avisos.push(msg);
S.log = (msg, tipo) => registro.push([tipo, msg]);
S.confirm = msg => { preguntas.push(msg); return respuesta; };
const W = "0x" + "1".repeat(40), V = "0x" + "2".repeat(40);
S.walletConfig = () => W;
S.vaultConfig = () => V;

const SEMILLAS = vm.runInContext("SEMILLAS_DEFI", S);
const STATE = vm.runInContext("state", S);
let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const POOL = Object.keys(SEMILLAS.DEFI_POOL)[0], NOMBRE_POOL = SEMILLAS.DEFI_POOL[POOL];
const STAKING = Object.keys(SEMILLAS.DEFI_STAKING)[0];
const totalSemillas = c => Object.entries(SEMILLAS).reduce((n, [rol, dirs]) =>
  n + Object.keys(dirs).filter(a => a in (c.contratos_aprendidos[rol] || {})).length, 0);
const ida = c => JSON.parse(JSON.stringify(c));   // como guardar y volver a abrir

(async () => {
  console.log("== 1. Cache nueva ==");
  const nueva = S.cacheVacia();
  assert("trae las 6 semillas y no la lista de quitadas", totalSemillas(nueva) === 6 && !("semillas_quitadas" in nueva));

  console.log("== 2. Quitar una semilla ==");
  STATE.cache = S.asegurarEstructuraCache(ida(nueva));
  STATE.cache.contratos_aprendidos.DISTRIBUIDOR["0x" + "2".repeat(40)] = "Distribuidor";
  const html = S.pnHtmlContratos(S.pnFilasContratos(STATE.cache));
  assert("las 6 semillas con ✕; el distribuidor, sin él", (html.match(/data-rol=/g) || []).length === 6 && !/data-rol="DISTRIBUIDOR"/.test(html));
  respuesta = false;
  await S.pnQuitarContrato("DEFI_POOL", POOL);
  assert("si no acepta el aviso, nada cambia",
    POOL in STATE.cache.contratos_aprendidos.DEFI_POOL && !("semillas_quitadas" in STATE.cache) && guardados === 0);
  assert("el aviso dice que viene con la app", preguntas[0] === "«" + NOMBRE_POOL + "» viene con la app. ¿Seguro que quieres quitarla?", preguntas);
  respuesta = true;
  await S.pnQuitarContrato("DEFI_POOL", POOL);
  assert("aceptado: sale, queda apuntada y se guarda",
    !(POOL in STATE.cache.contratos_aprendidos.DEFI_POOL) && JSON.stringify(STATE.cache.semillas_quitadas) === JSON.stringify([POOL]) && guardados === 1);
  await S.pnQuitarContrato("DEFI_POOL", POOL);
  assert("quitarla otra vez no hace nada", guardados === 1 && STATE.cache.semillas_quitadas.length === 1);
  await S.pnQuitarContrato("DISTRIBUIDOR", "0x" + "2".repeat(40));
  assert("lo de Reental no se quita aunque se llame a mano", "0x" + "2".repeat(40) in STATE.cache.contratos_aprendidos.DISTRIBUIDOR && guardados === 1);

  console.log("== 3. Al volver a abrir la cache ==");
  let abierta = S.asegurarEstructuraCache(ida(STATE.cache));
  assert("no se vuelve a sembrar; las otras 5, sí", !(POOL in abierta.contratos_aprendidos.DEFI_POOL) && totalSemillas(abierta) === 5);
  const dePython = ida(STATE.cache);
  dePython.contratos_aprendidos.DEFI_POOL[POOL] = NOMBRE_POOL;   // una cache que la trae sembrada
  abierta = S.asegurarEstructuraCache(dePython);
  assert("si una cache vieja la trae, se quita otra vez", !(POOL in abierta.contratos_aprendidos.DEFI_POOL));
  const mayusculas = ida(STATE.cache);
  mayusculas.semillas_quitadas = [POOL.toUpperCase().replace("0X", "0x"), 7, null];
  abierta = S.asegurarEstructuraCache(mayusculas);
  assert("la lista vale con mayúsculas y cosas raras dentro", !(POOL in abierta.contratos_aprendidos.DEFI_POOL) && totalSemillas(abierta) === 5);

  console.log("== 4. Lista mal escrita ==");
  for (const malo of [{ [POOL]: true }, "texto", 3]) {
    registro.length = 0;
    const c = ida(STATE.cache);
    c.semillas_quitadas = malo;
    const r = S.asegurarEstructuraCache(c);
    assert("«" + JSON.stringify(malo) + "»: se usan todas, se avisa y no se borra",
      totalSemillas(r) === 6 && JSON.stringify(r.semillas_quitadas) === JSON.stringify(malo) &&
      registro.some(([t, m]) => t === "warn" && /semillas_quitadas/.test(m)), registro);
  }
  const conNull = ida(STATE.cache); conNull.semillas_quitadas = null;
  registro.length = 0;
  assert("null: como si no hubiera lista, sin aviso", totalSemillas(S.asegurarEstructuraCache(conNull)) === 6 && registro.length === 0);
  STATE.cache = ida(STATE.cache); STATE.cache.semillas_quitadas = "roto";
  await S.pnQuitarContrato("DEFI_STAKING", STAKING);
  assert("al quitar otra, la mal escrita se cambia por una buena",
    JSON.stringify(STATE.cache.semillas_quitadas) === JSON.stringify([STAKING]));
  STATE.cache.semillas_quitadas.push(POOL);
  STATE.cache.contratos_aprendidos.DEFI_POOL = {};   // como quedó en el apartado 2

  console.log("== 5. Volver a añadirla ==");
  Object.assign(campos, { inpContratoDir: { value: POOL }, inpContratoNombre: { value: "Mi pool" }, selContratoTipo: { value: "INFRAESTRUCTURA" } });
  await S.pnAñadirContrato();
  abierta = S.asegurarEstructuraCache(ida(STATE.cache));
  assert("con otro tipo: queda con ese tipo y no vuelve al suyo",
    abierta.contratos_aprendidos.INFRAESTRUCTURA[POOL] === "Mi pool" && !(POOL in abierta.contratos_aprendidos.DEFI_POOL) &&
    STATE.cache.semillas_quitadas.includes(POOL));
  delete STATE.cache.contratos_aprendidos.INFRAESTRUCTURA[POOL];
  Object.assign(campos, { inpContratoDir: { value: STAKING }, inpContratoNombre: { value: "Staking" }, selContratoTipo: { value: "DEFI_STAKING" } });
  await S.pnAñadirContrato();
  assert("con su tipo: se olvida de la lista", JSON.stringify(STATE.cache.semillas_quitadas) === JSON.stringify([POOL]));
  Object.assign(campos, { inpContratoDir: { value: POOL }, inpContratoNombre: { value: "Pool" }, selContratoTipo: { value: "DEFI_POOL" } });
  await S.pnAñadirContrato();
  abierta = S.asegurarEstructuraCache(ida(STATE.cache));
  assert("la última: la lista desaparece y la cache vuelve a tener las 6",
    !("semillas_quitadas" in STATE.cache) && totalSemillas(abierta) === 6 && abierta.contratos_aprendidos.DEFI_POOL[POOL] === "Pool");

  console.log("== 6. Lo añadido a mano ==");
  preguntas = [];
  const MIO = "0x" + "e".repeat(40);
  STATE.cache.contratos_aprendidos.DEFI_FARMING[MIO] = "Mi farm";
  await S.pnQuitarContrato("DEFI_FARMING", MIO);
  assert("su pregunta de siempre y no se apunta", preguntas[0] === "¿Quitar «Mi farm»?" && !(MIO in STATE.cache.contratos_aprendidos.DEFI_FARMING) && !("semillas_quitadas" in STATE.cache));

  console.log("== 7. Arreglos de la auditoría ==");
  const USDT = vm.runInContext("USDT", S), RNTc = vm.runInContext("RNT", S);
  const SUSHI = Object.keys(SEMILLAS.DEFI_POOL)[1];
  const REWARDS = Object.keys(SEMILLAS.DEFI_REWARDS)[0], NOMBRE_REWARDS = SEMILLAS.DEFI_REWARDS[REWARDS];
  let blk = 1000;
  const tx = (hash, contrato, from, to, valor, simbolo, dec) => ({ blockNumber: String(blk++), timeStamp: String(1720000000 + blk), hash,
    contractAddress: contrato, from, to, value: valor, tokenName: simbolo, tokenSymbol: simbolo, tokenDecimal: String(dec) });
  const H = n => "0x" + String(n).padStart(64, "0");
  const montar = () => {
    const c = S.cacheVacia();
    c.transacciones.wallet_tokens.push(
      tx(H(1), USDT, W, POOL, "10000000", "USDT", 6), tx(H(1), RNTc, POOL, W, "100000000000000000000", "RNT", 18),   // swap en el pool
      tx(H(2), USDT, REWARDS, W, "1000000", "USDT", 6),                                                                // recompensa
      tx(H(3), RNTc, W, POOL, "5000000000000000000", "RNT", 18), tx(H(3), SUSHI, SUSHI, W, "1000000000000000000", "SLP", 18)); // aportación con recibo
    c.transacciones.vault_tokens.push(tx(H(4), USDT, REWARDS, V, "2000000", "USDT", 6));                            // al vault en un hash del archivo
    return c;
  };
  const csv = S.cargarCsvRendimientos("dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet\n" +
    "\"Prueba#1\",2024-07-10,2,0,2,0,\"['" + H(4) + "']\",\"[]\"," + W);
  STATE.config = { wallet: W, vault: V };
  const clasificar = c => S.clasificarTransacciones(c, csv.filas, csv.indicePorHash, STATE.config);
  const huella = regs => JSON.stringify(regs.map(r => [r.clave, r.categoria, r.subcategoria, r.revisar, r.nota]));
  const base = clasificar(S.asegurarEstructuraCache(montar()));
  assert("A1 -> sin semillas quitadas, nada a revisar", base.every(r => !r.revisar), base.filter(r => r.revisar));
  const sinListaVacia = montar(); sinListaVacia.semillas_quitadas = [];
  assert("A1 -> con la lista vacía, lo mismo", huella(clasificar(S.asegurarEstructuraCache(sinListaVacia))) === huella(base));
  for (const [rol, addr, hashes] of [["DEFI_POOL", POOL, [H(1), H(3)]], ["DEFI_REWARDS", REWARDS, [H(2), H(4)]], ["DEFI_POOL", SUSHI, [H(3)]]]) {
    const c = montar(); c.semillas_quitadas = [addr];
    const regs = clasificar(S.asegurarEstructuraCache(c));
    const tocados = regs.filter(r => hashes.includes(r.hash));
    const otros = regs.filter(r => !hashes.includes(r.hash));
    assert("A1 -> quitada " + SEMILLAS[rol][addr] + ": lo de sus hashes, a revisar y con la nota; lo demás, igual",
      tocados.length > 0 && tocados.every(r => r.revisar && /dirección de la app que quitaste: comprobar/.test(r.nota)) &&
      huella(otros) === huella(base.filter(r => !hashes.includes(r.hash))), tocados);
  }
  const conLista = montar(); conLista.semillas_quitadas = [REWARDS];
  conLista.contratos_aprendidos.INFRAESTRUCTURA[REWARDS] = "Mía";
  const regsOtro = clasificar(S.asegurarEstructuraCache(conLista));
  assert("A1 -> añadida con otro tipo: manda ese tipo y no se marca",
    !(REWARDS in conLista.contratos_aprendidos.DEFI_REWARDS) && regsOtro.some(r => r.hash === H(2)) &&
    regsOtro.every(r => !/dirección de la app que quitaste/.test(r.nota)), regsOtro.filter(r => r.hash === H(2)));

  const conSushi = S.asegurarEstructuraCache(montar());
  S.descubrimientoDinamico(conSushi, csv.filas, csv.indicePorHash, W, V);
  const sinSushi = montar(); sinSushi.semillas_quitadas = [SUSHI, REWARDS];
  S.asegurarEstructuraCache(sinSushi);
  S.descubrimientoDinamico(sinSushi, csv.filas, csv.indicePorHash, W, V);
  assert("A4 -> el recibo de un pool quitado no entra en el catálogo",
    !(SUSHI in sinSushi.catalogo_propiedades) && JSON.stringify(sinSushi.catalogo_propiedades) === JSON.stringify(conSushi.catalogo_propiedades),
    Object.keys(sinSushi.catalogo_propiedades));
  assert("A8 -> la quitada no se aprende como distribuidor de Reental",
    !(REWARDS in sinSushi.contratos_aprendidos.DISTRIBUIDOR) && !(REWARDS in sinSushi.contratos_aprendidos.SETTLEMENT));

  STATE.cache = sinSushi;
  const filasQ = S.pnFilasSemillasQuitadas(STATE.cache);
  const htmlQ = S.pnHtmlSemillasQuitadas(filasQ);
  assert("A3 -> las quitadas, con su nombre de serie, su tipo y «↩ Volver a poner»",
    filasQ.length === 2 && filasQ.some(f => f.addr === REWARDS && f.nombre === NOMBRE_REWARDS && f.rol === "DEFI_REWARDS") &&
    (htmlQ.match(/data-volver=/g) || []).length === 2 && htmlQ.includes(NOMBRE_REWARDS), filasQ);
  STATE.cache.ajustes_usuario[H(2) + "::" + USDT] = { categoria: "MOVIMIENTO", subcategoria: "NEUTRO", revisar: false, nota: "mía" };
  avisos = []; guardados = 0;
  await S.pnVolverAPonerSemilla(REWARDS);
  assert("A3 -> «↩ Volver a poner»: con su tipo y su nombre, fuera de la lista, se guarda",
    STATE.cache.contratos_aprendidos.DEFI_REWARDS[REWARDS] === NOMBRE_REWARDS && JSON.stringify(STATE.cache.semillas_quitadas) === JSON.stringify([SUSHI]) &&
    guardados === 1 && S.pnFilasSemillasQuitadas(STATE.cache).length === 1);
  assert("A5 -> el aviso dice que sigue la decisión tomada en sus movimientos",
    avisos[0] === "Dirección añadida: " + NOMBRE_REWARDS + " · sigue 1 decisión tuya en sus movimientos", avisos);
  STATE.cache.contratos_aprendidos.INFRAESTRUCTURA[SUSHI] = "Mía";
  assert("A3 -> añadida con otro tipo: no sale en las quitadas", S.pnFilasSemillasQuitadas(STATE.cache).length === 0);
  avisos = [];
  await S.pnVolverAPonerSemilla(SUSHI);
  assert("A3 -> volver a ponerla si ya tiene otro tipo: lo dice y no cambia nada",
    /ya está como «Infraestructura»/.test(avisos[0]) && !(SUSHI in STATE.cache.contratos_aprendidos.DEFI_POOL), avisos);
  Object.assign(campos, { inpContratoDir: { value: "0x" + "9".repeat(40) }, inpContratoNombre: { value: "Nada" }, selContratoTipo: { value: "DEFI_POOL" } });
  avisos = [];
  await S.pnAñadirContrato();
  assert("A5 -> sin decisiones en sus movimientos, el aviso de siempre", avisos[0] === "Dirección añadida: Nada", avisos);

  preguntas = [];
  STATE.cache.contratos_aprendidos.DEFI_REWARDS[REWARDS] = "Mi nombre";
  await S.pnQuitarContrato("DEFI_REWARDS", REWARDS);
  assert("A6 -> el aviso usa el nombre de serie aunque le cambiaras el nombre",
    preguntas[0] === "«" + NOMBRE_REWARDS + "» viene con la app. ¿Seguro que quieres quitarla?", preguntas);

  const mayus = S.cacheVacia();
  mayus.semillas_quitadas = [POOL];
  mayus.contratos_aprendidos.DEFI_POOL = { [POOL.toUpperCase().replace("0X", "0x")]: NOMBRE_POOL };
  S.asegurarEstructuraCache(mayus);
  assert("A7 -> con la clave en mayúsculas también se quita", Object.keys(mayus.contratos_aprendidos.DEFI_POOL).every(k => k.toLowerCase() !== POOL));

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})();
