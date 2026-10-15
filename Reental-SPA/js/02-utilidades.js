/* =====================================================================
   REENTAL SPA · js/02-utilidades.js
   Utilidades de interfaz (toasts, log, progreso, chips) y funciones
   de sanitización de datos (fechas, direcciones, importes, CSV).
   El registro técnico vive plegado (#arrRegistro) y log() lo abre solo cuando
   escribe un error, para que quien llega nuevo no se abrume.
   ===================================================================== */

/* ----------------------------- Utilidades DOM ----------------------------- */
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const red6 = x => Math.round(x * 1e6) / 1e6;

function toast(msg, tipo = "info", accion = null, duracion = 6000) {
  const cont = $("toasts");
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  const texto = document.createElement("div");
  texto.textContent = msg;
  t.appendChild(texto);
  if (accion) {
    const b = document.createElement("button");
    b.className = "primary tacc";
    b.textContent = accion.texto;
    b.onclick = () => { accion.fn(); t.remove(); };
    t.appendChild(b);
  }
  cont.appendChild(t);
  if (duracion > 0) setTimeout(() => t.remove(), duracion);
}

function log(msg, tipo = "info") {
  const consola = $("consola");
  if (consola.dataset.vacio === "1") { consola.innerHTML = ""; consola.dataset.vacio = "0"; }
  const hora = new Date().toTimeString().slice(0, 8);
  const linea = document.createElement("div");
  if (tipo !== "info") linea.className = tipo;
  linea.textContent = hora + " " + msg;
  consola.appendChild(linea);
  consola.scrollTop = consola.scrollHeight;
  if (tipo === "error") {
    const plegable = $("arrRegistro");
    if (plegable) plegable.open = true;
  }
}

function setDot(paso, estado) { // '', 'run', 'ok', 'err'
  const el = $("dot-" + paso);
  if (!el) return;
  el.className = "dot " + (estado || "");
}
function setProgreso(pct, texto) {
  $("barraProgreso").style.width = pct + "%";
  $("textoProgreso").textContent = (texto || (pct >= 100 ? "Sincronización completa" : "Sincronizando...")) + " · " + pct + "%";
}
/* El único botón de arranque es «🔄 Actualizar» (js/19), que js/19
   bloquea mientras state.sync.running. Se conserva la función porque js/09 la llama en cada sincronización (y js/19 la envuelve
   para repintar): tolera que los botones ya no existan. */
function setBotonesSync(habilitados) {
  ["btnSyncTodo", "btnSyncEth", "btnSyncBce", "btnSyncRnt", "arrPreparar"].forEach(id => {
    const el = $(id);
    if (el) el.disabled = !habilitados;
  });
}

/* Nombre que se ENSEÑA de cada categoría (ver el glosario en
   docs/especificaciones/). El código REWARD se queda, pero a la vista es «recompensa»; las demás
   categorías se enseñan con su código. */
const ETIQUETA_CATEGORIA = { REWARD: "RECOMPENSA" };
function categoriaAMostrar(categoria) {
  // Solo las suyas: «constructor» o «toString» (un ajuste escrito a mano)
  // darían lo heredado de todo objeto, y el informe se pararía.
  return Object.prototype.hasOwnProperty.call(ETIQUETA_CATEGORIA, categoria)
    ? ETIQUETA_CATEGORIA[categoria] : categoria;
}

/* Códigos que cambiaron de nombre. Dentro de reental_cache.json los
   nombres no cambian, así que un ajuste del usuario puede traer el
   antiguo: se traduce al leerlo. */
const CODIGOS_ANTIGUOS = {
  DIVIDENDO: "RENDIMIENTO",
  RCM_DIVIDENDO: "RCM_RENDIMIENTO",
  RCM_VAULT: "RCM_REINVERTIDO",
  RCM_WALLET: "RCM_RECLAMADO",
  GPP_PROPIEDAD: "GPP_INMUEBLE",
};
/* Campos de un registro que cambiaron de nombre. Un ajuste del usuario guardado en la cache puede
   nombrarlos como antes. */
const CAMPOS_ANTIGUOS = { propiedad: "inmueble", bruto_usdt: "integro_usdt" };
function campoVigente(campo) {
  return Object.prototype.hasOwnProperty.call(CAMPOS_ANTIGUOS, campo) ? CAMPOS_ANTIGUOS[campo] : campo;
}

/* Textos que el descubrimiento guardó en la cache al aprender un
   contrato, con las palabras de antes. En la cache no se tocan: se
   traducen al enseñarlos. Los contratos nuevos ya se guardan con el texto
   de hoy. */
const TEXTOS_CACHE_ANTIGUOS = {
  "Distribuidor de dividendos (cruce CSV)": "Distribuidor de rendimientos (cruce con el archivo de Reental)",
  "Settlement (burn de propiedad + stablecoin al vault)": "Settlement (burn de tokens de un inmueble + stablecoin al vault)",
  "Settlement (burn de propiedad + USDT al vault)": "Settlement (burn de tokens de un inmueble + USDT al vault)",
};
function textoCacheVigente(texto) {
  return (typeof texto === "string" &&
          Object.prototype.hasOwnProperty.call(TEXTOS_CACHE_ANTIGUOS, texto))
    ? TEXTOS_CACHE_ANTIGUOS[texto] : texto;
}

function codigoVigente(codigo) {
  return (typeof codigo === "string" &&
          Object.prototype.hasOwnProperty.call(CODIGOS_ANTIGUOS, codigo))
    ? CODIGOS_ANTIGUOS[codigo] : codigo;
}

function actualizarChipEstado() {
  const chip = $("chipEstado");
  const partes = [];
  // La cache vacía de la primera vez no cuenta como «cargado».
  const n = state.cache ? Object.values(state.cache.transacciones).reduce((a, s) => a + s.length, 0) : 0;
  if (n) partes.push(n + " transacciones");
  if (state.csvCargado) partes.push("Rendimientos: " + state.filasCsv.length + " repartos");
  if (partes.length) { chip.textContent = partes.join(" · "); chip.className = "chip ok"; }
  else { chip.textContent = "Sin datos cargados"; chip.className = "chip"; }
}

/* ----------------------------- Sanitización ----------------------------- */
function normalizarDireccion(addr) {
  return typeof addr === "string" ? addr.trim().toLowerCase() : "";
}
/* La wallet y el vault de la config, con una sola regla para el paso 1 de
   🚀 Puesta en marcha (js/19) y para clasificar (js/14):
   la wallet, 0x y 40 hexadecimales; el vault es opcional, pero si está
   escrito también. Así no se descubren ni se guardan
   inmuebles de una dirección a medio escribir. */
const RE_DIRECCION = /^0x[0-9a-f]{40}$/i;
function direccionValida(x) {
  return typeof x === "string" && RE_DIRECCION.test(x.trim());
}
function vaultMalEscrito(cfg) {
  const v = (cfg || {}).vault;
  return typeof v === "string" && v.trim() !== "" && (!direccionValida(v) || vaultIgualWallet(cfg));
}
/* El vault no puede ser la misma dirección que la wallet (el gas saldría
   dos veces y los depósitos, a revisar). */
function vaultIgualWallet(cfg) {
  const c = cfg || {};
  return typeof c.vault === "string" && c.vault.trim() !== "" &&
    normalizarDireccion(c.vault) === normalizarDireccion(c.wallet);
}
function direccionesConfigOk(cfg) {
  return direccionValida((cfg || {}).wallet) && !vaultMalEscrito(cfg);
}
/* Fecha ISO que se acepta: AAAA-MM-DD, con hora opcional (T o espacio,
   segundos y fracción opcionales) y zona opcional (Z o +HH:MM). Sin zona
   se lee como UTC. No usar `new Date` a secas: la lee en la hora del
   navegador (el 01/01 a las 00:30 caería en el año anterior) y acepta
   dd/mm/aaaa o el 30 de febrero. */
const RE_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))?$/;
function fechaIso(texto) {
  const m = RE_FECHA_ISO.exec(texto);
  if (!m) return null;
  const n = x => parseInt(x || "0", 10);
  const [anio, mes, dia, hora, minuto, segundo] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(n);
  if (anio < 1 || mes < 1 || mes > 12 || hora > 23 || minuto > 59 || segundo > 59) return null;
  const d = new Date(0);
  d.setUTCFullYear(anio, mes - 1, dia);
  d.setUTCHours(hora, minuto, segundo, n((m[7] || "").slice(0, 3).padEnd(3, "0")));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  if (m[9]) d.setTime(d.getTime() - (m[9] === "+" ? 1 : -1) * (n(m[10]) * 60 + n(m[11])) * 60000);
  return fechaEnRango(d);
}
// Del año 1 al 9999 (un timestamp en milisegundos daría el año 58634).
function fechaEnRango(d) {
  return (d && !isNaN(d.getTime()) && d.getUTCFullYear() >= 1 && d.getUTCFullYear() <= 9999) ? d : null;
}
function aUtcNaive(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date) return fechaEnRango(valor);
  if (typeof valor === "number") return fechaEnRango(new Date(valor * 1000));
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return fechaEnRango(new Date(parseInt(t, 10) * 1000));
  return fechaIso(t);
}
const fmtFecha = d => d ? d.toISOString().slice(0, 10) : null;
const fmtFechaHora = d => d ? d.toISOString().slice(0, 19).replace("T", " ") : null;
/* Las fechas de la blockchain y del archivo de Reental son un instante en UTC; la app las
   pasa a la hora peninsular española, la que decide el año de la Renta y el
   tipo del BCE del día. enHoraEspanola da un Date cuyos campos UTC son la
   hora de Madrid (la app guarda las fechas sin zona). Las pruebas con
   cifras de referencia grabadas en UTC ponen ZONA_FECHAS = "UTC". */
let ZONA_FECHAS = "Europe/Madrid";
let formatoZona = null;
function enHoraEspanola(d) {
  if (!d || ZONA_FECHAS === "UTC") return d;
  if (!formatoZona || formatoZona.zona !== ZONA_FECHAS) {
    formatoZona = new Intl.DateTimeFormat("en-US", { timeZone: ZONA_FECHAS, hourCycle: "h23", year: "numeric",
      month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatoZona.zona = ZONA_FECHAS;
  }
  const p = {};
  for (const x of formatoZona.formatToParts(d)) p[x.type] = parseInt(x.value, 10);
  const local = new Date(0);
  local.setUTCFullYear(p.year, p.month - 1, p.day);
  local.setUTCHours(p.hour, p.minute, p.second, d.getUTCMilliseconds());
  return fechaEnRango(local);
}
// El día de hoy en España («AAAA-MM-DD»).
const hoyEspana = (ahora = new Date()) => fmtFecha(enHoraEspanola(ahora));
/* Ahora en hora local, ISO sin zona («2026-01-15T00:30:00»): la fecha de
   lo que escribe el usuario (notas, decisiones, anulados). No usar
   toISOString: va en UTC y a las 00:30 pondría el día anterior. */
function ahoraLocalISO(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
/* Las fechas se ENSEÑAN como
   dd/mm/aaaa (01/03/2026) en toda la app. Solo cómo se enseñan: los
   registros, la cache y las comparaciones siguen con "AAAA-MM-DD".
   Acepta "AAAA-MM-DD", "AAAA-MM-DD HH:MM[:SS]" o un Date; `conHora` añade
   « HH:MM» si la hay. Lo que no es una fecha se devuelve tal cual ("" si
   no hay nada), para no esconder un dato raro. */
function fechaEs(valor, conHora = false) {
  if (valor === null || valor === undefined || valor === "") return "";
  const esDate = Object.prototype.toString.call(valor) === "[object Date]";
  const s = esDate ? (isNaN(valor.getTime()) ? "" : fmtFechaHora(valor)) : String(valor);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
  if (!m) return s;
  return m[3] + "/" + m[2] + "/" + m[1] + (conHora && m[4] ? " " + m[4] + ":" + m[5] : "");
}
/* Al pasar el ratón por una fecha con hora,
   las dos horas: la española (la de la app) y la UTC (la de Polygonscan).
   «01/01/2026 00:30, hora española · 31/12/2025 23:30 UTC». La UTC se saca
   restando la diferencia de Madrid en ese momento o, mejor, del instante
   del registro si lo lleva (en la hora repetida de octubre,
   sin él sale la de después del cambio). Sin hora, solo la fecha. */
function fechaDosHoras(valor, instante = null) {
  const d = typeof valor === "string" && /\d{2}:\d{2}/.test(valor) ? fechaIso(valor.trim()) : null;
  if (!d) return fechaEs(valor, true);
  const utc = instanteValido(valor, instante) || utcDeHoraEspanola(d);
  return fechaEs(valor, true) + ", hora española · " + fechaEs(utc, true) + " UTC";
}
/* El día UTC de una fecha en hora española («AAAA-MM-DD HH:MM:SS») si
   es otro (de las 00:00 a la 01:00 o las 02:00); si no, o sin hora, null.
   Los precios de RNT y POL guardados antes de pasar las fechas a la hora
   española van por el día UTC: valen para esos movimientos (js/08, js/11
   y js/21). */
function diaUtcSiOtro(fecha) {
  const d = typeof fecha === "string" && /\d{2}:\d{2}/.test(fecha) && ZONA_FECHAS !== "UTC" ? fechaIso(fecha.trim()) : null;
  const dia = d ? fmtFecha(utcDeHoraEspanola(d)) : null;
  return dia && dia !== fecha.slice(0, 10) ? dia : null;
}
/* El instante UTC de una hora española sin zona (Date con los campos en
   Madrid -> Date en UTC). En la hora repetida de octubre, la de después. */
function utcDeHoraEspanola(d) {
  const desfase = x => { const e = enHoraEspanola(x); return e ? e.getTime() - x.getTime() : 0; };
  return new Date(d.getTime() - desfase(new Date(d.getTime() - desfase(d))));
}
/* El 'instante' de un registro de la blockchain (UTC, «AAAA-MM-DD
   HH:MM:SS», lo pone js/14) como Date, solo si sigue siendo su fecha (un
   ajuste puede haberla cambiado). */
function instanteValido(fecha, instante) {
  const d = instante ? fechaIso(String(instante)) : null;
  return d && fmtFechaHora(enHoraEspanola(d)) === fecha ? d : null;
}
/* La fecha con la que se ordenan los movimientos, en UTC. En hora
   española, la hora repetida de octubre (de 02:00 a 03:00 dos veces)
   pondría una venta antes que su compra. Con ZONA_FECHAS = "UTC", la
   fecha tal cual. Se guarda por registro: ordenar la pide
   muchas veces. */
const ordenFechaGuardado = new WeakMap();
function fechaParaOrdenar(r) {
  const fecha = r && r.fecha;
  if (!fecha || ZONA_FECHAS === "UTC" || !/\d{2}:\d{2}/.test(fecha)) return fecha || "";
  const visto = ordenFechaGuardado.get(r);
  if (visto && visto.fecha === fecha && visto.instante === r.instante) return visto.clave;
  const d = instanteValido(fecha, r.instante) || (fechaIso(String(fecha).trim()) && utcDeHoraEspanola(fechaIso(String(fecha).trim())));
  const clave = d ? fmtFechaHora(d) : fecha;
  ordenFechaGuardado.set(r, { fecha, instante: r.instante, clave });
  return clave;
}
// Ordena una lista de registros por su fecha (fechaParaOrdenar) y, a igual
// fecha, por 'desempate'. Ordena la misma lista y la devuelve.
function ordenarPorFecha(lista, desempate = () => 0) {
  return lista.sort((a, b) => cmpTexto(fechaParaOrdenar(a), fechaParaOrdenar(b)) || desempate(a, b));
}
/* Las fechas AAAA-MM-DD que lleve un texto guardado (la nota del motor),
   como dd/mm/aaaa al enseñarlo. */
function fechasEnTextoEs(texto) {
  return String(texto || "").replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "$3/$2/$1");
}
/* Mes "AAAA-MM" como mm/aaaa (07/2026); lo demás, tal cual. */
function mesEs(valor) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(valor || ""));
  return m ? m[2] + "/" + m[1] : String(valor || "");
}

/* Entero de la blockchain: un texto de cifras (con un signo y espacios
   alrededor) o un número entero; null si no (queda a revisar). No usar
   BigInt a secas: BigInt("") da 0 y la transferencia acabaría en el spam,
   y el gas «0x…» se leería en hexadecimal. */
function enteroDeTexto(valor) {
  if (typeof valor === "bigint") return valor;
  if (typeof valor === "number") return Number.isInteger(valor) ? BigInt(valor) : null;
  if (typeof valor !== "string" || !/^\s*[+-]?[0-9]+\s*$/.test(valor)) return null;
  return BigInt(valor.trim().replace(/^\+/, ""));
}
/* v / 10^d con un solo redondeo (Number(BigInt) / 10^d redondea dos veces
   y la última cifra de una cantidad de 18 decimales sale distinta en uno
   de cada cuatro casos).
   El texto decimal exacto se convierte a número con un solo redondeo. */
function dividirPotencia10(v, d) {
  const negativo = v < 0n;
  let s = (negativo ? -v : v).toString();
  if (d > 0) {
    s = s.padStart(d + 1, "0");
    s = s.slice(0, -d) + "." + s.slice(-d);
  }
  const x = Number(s);
  if (!Number.isFinite(x)) return null;
  return negativo ? -x : x;
}
function enteroAUnidades(valor, decimales) {
  const v = enteroDeTexto(valor);
  const d = enteroDeTexto(decimales);
  // Unos decimales absurdos (-400, «abc»; los de un token van de 0 a 255)
  // no se pueden leer (darían Infinity o NaN); un valor de más de 308
  // cifras, tampoco.
  if (v === null || d === null || d < 0n || d > 255n) return null;
  return dividirPotencia10(v, Number(d));
}
/* Importe del archivo de Reental («9,5», «1.234,56» o «9»). Una celda vacía
   es 0. Lo que no es un importe positivo («10 USDT», «NaN», «1 000,5»,
   «-3») da null: el archivo no se usa (mejor que leer otra cifra, 1,234 o
   10, sin avisar). Con coma, el punto es de miles; sin coma, decimal
   («1.8»). */
function comaADecimal(texto) {
  if (typeof texto === "number") return Number.isFinite(texto) && texto >= 0 ? texto : null;
  if (typeof texto !== "string") return null;
  let t = texto.trim();
  if (!t) return 0.0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(/,/g, ".");
  return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
}
/* v.toFixed(dec) con redondeo al par (v >= 0), el de las cifras de
   referencia. Solo cambia un empate exacto (el número guardado acaba justo
   en un 5 detrás del último decimal, p. ej. 100,125): toFixed sube y aquí
   se va al par, 100,12. toFixed con 30 cifras más da los decimales
   exactos del número. */
function toFixedPython(v, dec) {
  const s = v.toFixed(dec);
  if (dec > 70) return s;
  const largo = v.toFixed(dec + 30);
  const punto = largo.indexOf(".");
  if (!/^50*$/.test(largo.slice(punto + 1 + dec))) return s;
  const truncado = largo.slice(0, dec ? punto + 1 + dec : punto);
  return Number(truncado.slice(-1)) % 2 === 0 ? truncado : s;
}
/* Número a la española (punto para los miles y coma para los decimales:
   1.234,56), con formato fijo: igual en todos los navegadores y en Node, sin
   toLocaleString. `recortar` quita los ceros de relleno (para cantidades:
   10, no 10,000000). Un cero nunca sale con el signo menos. "?" si no es un
   número. */
function numEs(x, dec = 2, signo = false, recortar = false) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "?";
  const partes = toFixedPython(Math.abs(x), dec).split(".");
  const cero = !/[1-9]/.test(partes.join(""));
  const fra = recortar ? (partes[1] || "").replace(/0+$/, "") : (partes[1] || "");
  return (x < 0 && !cero ? "-" : signo ? "+" : "") +
    partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (fra ? "," + fra : "");
}
/* Cantidad de tokens o monedas: hasta 6 decimales, sin ceros de relleno
   (1.000000 parecería un millón). */
function cantidadEs(x) { return numEs(x, 6, false, true); }
function extraerInmueble(dividend) {
  return typeof dividend === "string" ? dividend.split("#")[0].trim() : "";
}
/* Hashes on-chain de una celda del archivo de Reental con lista serializada
   (reinvests o claims), p. ej. ["0x…", "0x…"]: a minúsculas, con 0x y sin
   repetir; [] si está vacía o es []. Si trae algo que no son hashes (una
   lista mal escrita, un hash cortado) da null: el archivo no se usa
   (si no, el rendimiento podría contar dos veces). */
const RE_HASH_TX = /(?<![0-9a-z])(?:0x)?[0-9a-f]{64}(?![0-9a-z])/g;
function parsearReinvests(texto) {
  if (typeof texto !== "string") return [];
  const t = texto.trim().toLowerCase();
  const hashes = [];
  for (let h of (t.match(RE_HASH_TX) || [])) {
    if (!h.startsWith("0x")) h = "0x" + h;
    if (!hashes.includes(h)) hashes.push(h);
  }
  if (t.replace(RE_HASH_TX, "").replace(/[\[\]"'\s,]/g, "")) return null;
  return hashes;
}
/* Comparación de textos letra a letra (por código), el orden de las
   cifras de referencia. No usar localeCompare: ordena las tildes y las
   mayúsculas de otra manera. */
function cmpTexto(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function claveCompuesta(txHash, contractAddress) {
  return normalizarDireccion(txHash) + "::" + normalizarDireccion(contractAddress);
}
/* Estado de una entrada del catálogo. Sin «estado» (formato antiguo o
   añadida a mano), CONFIRMADA. Se lee sin mayúsculas ni espacios
   («Descartada» es DESCARTADA) y uno que no se entiende («DESCARTADO») o
   una entrada que no es un objeto quedan CANDIDATA (con dudas: no cuentan
   como inmueble y salen en el catálogo para decidir). */
const ESTADOS_CATALOGO = ["CONFIRMADA", "CANDIDATA", "DESCARTADA"];
function estadoCatalogo(entrada) {
  if (entrada === null || typeof entrada !== "object" || Array.isArray(entrada)) return "CANDIDATA";
  const estado = entrada.estado;
  if (estado === undefined || estado === null) return "CONFIRMADA";
  const e = typeof estado === "string" ? estado.trim().toUpperCase() : "";
  return ESTADOS_CATALOGO.includes(e) ? e : "CANDIDATA";
}
function normalizarNombreInmueble(nombre) {
  if (typeof nombre !== "string") return "";
  // Quita todas las marcas (categoría M).
  const sinAcentos = nombre.normalize("NFKD").replace(/\p{M}/gu, "");
  return sinAcentos.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}
const RE_IMITADORES = /[\u0370-\u03FF\u0400-\u052F\u0530-\u058F\u13A0-\u13FF\u1C80-\u1C8F\u1F00-\u1FFF\u2DE0-\u2DFF\uA640-\uA69F\uAB70-\uABBF]/;
function nombreTokenSospechoso(nombre, simbolo = "") {
  nombre = typeof nombre === "string" ? nombre : "";
  simbolo = typeof simbolo === "string" ? simbolo : "";
  if (!nombre.trim()) return true;
  for (const texto of [nombre, simbolo]) {
    if ([...texto].some(c => CARACTERES_SPAM.includes(c))) return true;
    if (/\p{Sc}|\p{So}|\p{Sm}|\p{Nl}|\p{Cf}/u.test(texto)) return true;
    // Letras griegas, cirílicas, armenias o cherokis (imitan «USDT»: la T
    // cirílica), por tramos de código.
    if (RE_IMITADORES.test(texto)) return true;
    const min = texto.toLowerCase();
    if (RE_URL.test(min) || RE_PALABRA_SPAM.test(min)) return true;
  }
  return false;
}
function tienePrefijoReental(nombre, simbolo) {
  return (nombre + " " + simbolo).toLowerCase().includes(PREFIJO_REENTAL);
}
function fechaDeTx(tx) { return fmtFecha(enHoraEspanola(aUtcNaive(tx.timeStamp))); }
function cantidadTx(tx) {
  const contract = normalizarDireccion(tx.contractAddress);
  let dec = tx.tokenDecimal;
  if (dec === undefined || dec === null || dec === "") dec = (contract in DECIMALES) ? DECIMALES[contract] : DECIMALES_DEFECTO;
  return enteroAUnidades(tx.value, dec);
}