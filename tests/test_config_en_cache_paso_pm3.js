/* Test de tus datos dentro de la cache: se guardan en ella. Con la casilla marcada (de entrada), también las API keys; desmarcada, ni
 * las claves ni el nombre y el NIF, que se quedan en el navegador.
 *
 * Bajo prueba (Reental-SPA/js/04-config.js):
 * - guardarConfigLocalSilencioso (se llama al escribir en los campos):
 *   además del navegador, wallet, vault, nombre y NIF van a la cache abierta,
 *   que se marca y se guarda; si no cambian, no se guarda otra vez; sin
 *   cache, solo el navegador.
 * - configDesdeCache: al abrir el archivo mandan sus datos y van al
 *   formulario; uno vacío en el archivo no borra lo que tenías; las API keys
 *   del archivo pasan al navegador (vacías o mal escritas no borran la tuya);
 *   un bloque que falta o está mal no cambia nada.
 * - La casilla: su estado se recuerda; marcar y desmarcar con tu archivo
 *   abierto lo guarda al momento.
 * - Archivo con otra wallet que la de lo descargado: el aviso que ya existe
 *   (direccionesCambiadas) la ve.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_config_en_cache_paso_pm3.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const elementos = {};
const elemento = id => (elementos[id] = elementos[id] || { id, value: "", innerHTML: "", textContent: "", disabled: false,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
const almacen = {};
let escrituras = 0;
const S = { console, document: { getElementById: elemento },
  localStorage: { setItem: (k, v) => { almacen[k] = String(v); }, getItem: k => almacen[k] ?? null, removeItem: k => { delete almacen[k]; } } };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "14-clasificador.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
S.log = () => {};
S.toast = () => {};
S.escribirArchivoNavegador = async () => { escrituras++; };   // lo único que escribe (js/05)
const STATE = vm.runInContext("state", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const W = "0x" + "ab".repeat(20), V = "0x" + "cd".repeat(20), W2 = "0x" + "ef".repeat(20);
const CLAVE = "CLAVE_SINTETICA_123";
const escribir = (campos) => { for (const [id, v] of Object.entries(campos)) elemento(id).value = v; S.leerConfigDesdeFormulario(); S.guardarConfigLocalSilencioso(); };
const esperar = () => new Promise(r => setTimeout(r, 0));

(async () => {
  console.log("== 1. Escribir tus datos ==");
  STATE.config = {}; STATE.cache = null;
  escribir({ cfgWallet: W, cfgVault: "", cfgEthKey: CLAVE, cfgNombre: "Ana", cfgNif: "00000000T" });
  assert("sin cache: solo el navegador (con la API key)", JSON.parse(almacen.reental_config).etherscan_api_key === CLAVE && escrituras === 0);
  STATE.cache = S.cacheVacia(); STATE.cacheHandle = { h: 1 }; STATE.cacheDirty = false;
  escribir({ cfgVault: V });
  await esperar();
  assert("con cache y la casilla marcada (de entrada): tus datos y las API keys entran en ella y se guarda",
    JSON.stringify(STATE.cache.configuracion) === JSON.stringify({ wallet: W, vault: V, inversor: { nombre: "Ana", nif: "00000000T" },
      etherscan_api_key: CLAVE, coingecko_api_key: "" }) && escrituras === 1, STATE.cache.configuracion);
  escribir({ cfgEthKey: CLAVE + "X" });
  await esperar();
  assert("cambiar solo la API key también guarda", escrituras === 2 && STATE.cache.configuracion.etherscan_api_key === CLAVE + "X");
  const casilla = elemento("cfgDatosEnArchivo");
  casilla.checked = false; S.alCambiarDatosEnArchivo(casilla);
  await esperar();
  assert("desmarcar con tu archivo abierto: sin API keys, nombre ni NIF, y se guarda al momento",
    JSON.stringify(STATE.cache.configuracion) === JSON.stringify({ wallet: W, vault: V, inversor: { nombre: "", nif: "" } }) &&
    !JSON.stringify(STATE.cache).includes(CLAVE) && escrituras === 3, STATE.cache.configuracion);
  assert("…se quedan en el navegador y se recuerda desmarcada", JSON.parse(almacen.reental_config).etherscan_api_key === CLAVE + "X" &&
    JSON.parse(almacen.reental_config).inversor.nif === "00000000T" && almacen.reental_datos_en_archivo === "no" && S.datosEnArchivo() === false);
  casilla.checked = true; S.volcarConfigAFormulario();
  assert("al volver a pintar el formulario, la casilla sale como se recordó", casilla.checked === false);
  escribir({ cfgNombre: "Ana" });
  await esperar();
  assert("desmarcada, escribir tu nombre no lo mete en el archivo ni lo guarda", escrituras === 3 && STATE.cache.configuracion.inversor.nombre === "");
  casilla.checked = true; S.alCambiarDatosEnArchivo(casilla);
  await esperar();
  assert("volver a marcarla: vuelven y se guarda", STATE.cache.configuracion.etherscan_api_key === CLAVE + "X" &&
    STATE.cache.configuracion.inversor.nif === "00000000T" && escrituras === 4 && S.datosEnArchivo() === true);
  delete almacen.reental_datos_en_archivo;
  assert("sin nada recordado: marcada", S.datosEnArchivo() === true);
  STATE.cacheHandle = null; STATE.cacheDirty = false;
  escribir({ cfgNombre: "Ana B" });
  assert("sin archivo detrás: la cache queda por guardar", STATE.cacheDirty && STATE.cache.configuracion.inversor.nombre === "Ana B");

  console.log("== 2. Abrir el archivo ==");
  STATE.config = { wallet: W, vault: V, etherscan_api_key: CLAVE, inversor: { nombre: "Ana", nif: "00000000T" } };
  const otra = S.cacheVacia();
  S.ponerConfiguracionCache(otra, { wallet: W, vault: "", inversor: { nombre: "", nif: "11111111H" } });
  assert("configDesdeCache dice que cambió", S.configDesdeCache(otra) === true);
  assert("mandan los del archivo; vacío no borra; la API key, la del navegador",
    STATE.config.wallet === W && STATE.config.vault === V && STATE.config.inversor.nombre === "Ana" &&
    STATE.config.inversor.nif === "11111111H" && STATE.config.etherscan_api_key === CLAVE, STATE.config);
  assert("y van al formulario", elemento("cfgVault").value === V && elemento("cfgNif").value === "11111111H" && elemento("cfgEthKey").value === CLAVE);
  assert("las reglas fijas siguen (100 €/token)", STATE.config.compra_bancaria_coste_eur_por_token === 100);
  assert("abrirlo otra vez: no cambia nada", S.configDesdeCache(otra) === false);
  // Con otra wallet en el archivo, lo del navegador es de otra persona.
  const deOtra = S.cacheVacia();
  S.ponerConfiguracionCache(deOtra, { wallet: W2, vault: "", inversor: { nombre: "", nif: "22222222J" } });
  const conOtro = JSON.parse(JSON.stringify(STATE.config));
  S.configDesdeCache(deOtra);
  assert("A2: otra wallet: ni el vault, ni el nombre, ni la API key del navegador; el NIF, el del archivo",
    STATE.config.wallet === W2 && STATE.config.vault === "" && !STATE.config.inversor.nombre && STATE.config.inversor.nif === "22222222J" &&
    STATE.config.etherscan_api_key === "" && elemento("cfgNombre").value === "" && elemento("cfgEthKey").value === "", STATE.config);
  STATE.config = Object.assign(conOtro, { wallet: " " + W.toUpperCase().replace("0X", "0x") + " " });   // escrita a mano
  S.ponerConfiguracionCache(deOtra, { wallet: W });
  S.configDesdeCache(deOtra);
  assert("A2: la misma wallet escrita con mayúsculas o espacios no cuenta como otra", STATE.config.inversor.nombre === "Ana" &&
    STATE.config.etherscan_api_key === CLAVE, STATE.config);
  const antes = JSON.stringify(STATE.config);
  for (const mal of [undefined, null, [], "x", { wallet: 7 }, { wallet: W, inversor: "Ana" }]) {
    const c = S.cacheVacia(); if (mal !== undefined) c.configuracion = mal;
    assert("bloque " + JSON.stringify(mal) + ": no cambia nada", S.configDesdeCache(c) === false && JSON.stringify(STATE.config) === antes);
  }
  const conInversorRaro = S.cacheVacia();
  S.ponerConfiguracionCache(conInversorRaro, { wallet: W, inversor: { nombre: "Ana" } });
  STATE.config.inversor = ["roto"];
  S.configDesdeCache(conInversorRaro);
  assert("un «inversor» roto en la config se arregla (Fase 6 A9)", STATE.config.inversor.nombre === "Ana" && !Array.isArray(STATE.config.inversor));
  // Las API keys del archivo pasan al navegador; vacías o mal escritas no borran la tuya.
  STATE.config = { wallet: W, etherscan_api_key: CLAVE, coingecko_api_key: "MI_CG", inversor: {} };
  const conClaves = S.cacheVacia();
  S.ponerConfiguracionCache(conClaves, { wallet: W, etherscan_api_key: " DEL_ARCHIVO ", coingecko_api_key: "" }, true);
  S.configDesdeCache(conClaves);
  assert("las API keys del archivo mandan; una vacía no borra la tuya", STATE.config.etherscan_api_key === "DEL_ARCHIVO" &&
    STATE.config.coingecko_api_key === "MI_CG" && elemento("cfgEthKey").value === "DEL_ARCHIVO", STATE.config);
  conClaves.configuracion.etherscan_api_key = 12345;
  STATE.config.etherscan_api_key = CLAVE;
  S.configDesdeCache(conClaves);
  assert("una API key mal escrita (un número) no borra la tuya", STATE.config.etherscan_api_key === CLAVE);

  console.log("== 3. Otra wallet que la de lo descargado ==");
  const descargada = S.cacheVacia();
  descargada.direcciones_descargadas = { wallet: W, vault: "" };
  S.ponerConfiguracionCache(descargada, { wallet: W2 });
  STATE.config = { wallet: W };
  S.configDesdeCache(descargada);
  assert("el aviso que ya existe la ve", JSON.stringify(S.direccionesCambiadas(descargada, STATE.config.wallet, STATE.config.vault)) === JSON.stringify(["wallet"]));

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})();
