/* =====================================================================
   REENTAL SPA · js/10-csv-descubrimiento.js
   Parser del archivo de rendimientos y descubrimiento dinámico de
   inmuebles (Vías A y B) y roles DISTRIBUIDOR / SETTLEMENT.
   Stablecoins conocidas (USDT/USDC) excluidas del catálogo y reconocidas
   como contraprestación en los roles.
   Cada fila lleva en `hashes` los de `reinvests` y los de `claims` (los
   reclamos).
   ===================================================================== */

/* Parser CSV robusto (comillas, comas dentro de campos, \r\n). Columnas
   esperadas: dividend, date, reinvested, claimed, distributed, retained,
   reinvests, claims, wallet.
   Importes: distributed es el integro repartido; retained, la retencion que
   practico Reental (0 si no la hay); reinvested, lo reinvertido; claimed,
   lo reclamado NETO (lo que llega a la wallet o al vault). Importe =
   reinvested + claimed: lo que se mueve on-chain, con lo que la regla 2
   casa la transferencia. Lo que falta hasta distributed esta pendiente.
   Columnas y casos: docs/especificaciones/archivo-rendimientos-reental.md. */
function parseCSV(texto) {
  const filas = [];
  let fila = [], campo = "", enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else {
      // Las comillas solo abren al principio del campo; en medio son
      // texto (como el csv estándar).
      if (c === '"' && campo === "") enComillas = true;
      else if (c === ",") { fila.push(campo); campo = ""; }
      else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
      else if (c === "\r") {
        if (texto[i + 1] !== "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
      }
      else campo += c;
    }
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(c => String(c).trim() !== ""));
}

/* Columnas sin las que el archivo no se usa (una columna que faltara se
   leería como 0). claims y wallet pueden faltar en archivos antiguos. */
const COLUMNAS_CSV_RENDIMIENTOS = ["dividend", "date", "distributed", "retained",
                                   "reinvested", "claimed", "reinvests"];
/* Devuelve {filas, indicePorHash} o {error}: el archivo está vacío, le faltan
   columnas (p. ej. separado por «;»), no está en UTF-8 o un importe, una
   fecha o una lista de hashes no se entienden (nunca 0 en silencio). */
function cargarCsvRendimientos(texto) {
  const filas = [], indicePorHash = {};
  // Un archivo guardado como ANSI llega con «�» en lugar de las tildes.
  if (String(texto).includes("�")) {
    return { error: "El archivo de rendimientos no está en UTF-8 (¿se guardó desde Excel?): vuelve a descargarlo de Reental sin abrirlo." };
  }
  const crudo = parseCSV(texto);
  if (!crudo.length) return { error: "El archivo de rendimientos está vacío." };
  const cabecera = crudo[0].map(h => String(h || "").trim().toLowerCase());
  const idx = {};
  cabecera.forEach((h, i) => { if (!(h in idx)) idx[h] = i; });
  const faltan = COLUMNAS_CSV_RENDIMIENTOS.filter(col => !(col in idx));
  if (faltan.length) {
    return { error: "Al archivo de rendimientos le faltan columnas: " + faltan.join(", ") +
      ". ¿Es el archivo de Reental, separado por comas?" };
  }
  const get = (celdas, col) => (idx[col] !== undefined ? (celdas[idx[col]] ?? "") : "");
  const malas = [];
  for (let n = 1; n < crudo.length; n++) {
    const celdas = crudo[n];
    const mala = col => malas.push("fila " + (n + 1) + ", " + col + " «" + String(get(celdas, col)).trim() + "»");
    const importe = col => {
      const v = comaADecimal(get(celdas, col));
      if (v === null) { mala(col); return 0; }
      return v;
    };
    const lista = col => {
      const v = parsearReinvests(get(celdas, col));
      if (v === null) { mala(col); return []; }
      return v;
    };
    const dividend = String(get(celdas, "dividend")).trim();
    const fecha = aUtcNaive(get(celdas, "date"));
    if (!fecha && String(get(celdas, "date")).trim()) mala("date");
    const reinvested = importe("reinvested");
    const claimed = importe("claimed");
    // Hashes on-chain de las reinversiones y de los reclamos, juntos.
    const hashes = lista("reinvests");
    for (const h of lista("claims")) {
      if (!hashes.includes(h)) hashes.push(h);
    }
    const fila = {
      linea_csv: n + 1,
      inmueble: extraerInmueble(dividend),
      periodo_fiscal: dividend,
      fecha_reparto: fecha,
      reinvested,
      claimed,
      distributed: importe("distributed"),
      retained: importe("retained"),
      importe: reinvested + claimed,
      hashes,
      wallet: normalizarDireccion(get(celdas, "wallet"))
    };
    filas.push(fila);
    for (const h of fila.hashes) (indicePorHash[h] = indicePorHash[h] || []).push(fila);
  }
  if (malas.length) {
    return { error: "El archivo de rendimientos tiene datos que no se pueden leer: " +
      malas.slice(0, 5).join("; ") + (malas.length > 5 ? " (y " + (malas.length - 5) + " más)" : "") + "." };
  }
  return { filas, indicePorHash };
}

function indexarPorHash(serie) {
  const indice = {};
  for (const tx of serie) {
    const h = normalizarDireccion(tx.hash);
    (indice[h] = indice[h] || []).push(tx);
  }
  return indice;
}
function primerasApariciones(cache) {
  const primeras = {};
  for (const nombreSerie of ["wallet_tokens", "vault_tokens"]) {
    for (const tx of (cache.transacciones[nombreSerie] || [])) {
      const ca = normalizarDireccion(tx.contractAddress);
      const fecha = fechaDeTx(tx);
      if (!ca || !fecha) continue;
      if (!(ca in primeras) || fecha < primeras[ca]) primeras[ca] = fecha;
    }
  }
  return primeras;
}
/* El prefijo «Reental-» lo puede copiar cualquiera que te mande un token,
   así que no confirma un inmueble (se anota, pero el token queda «con
   dudas»). Confirman el cruce con el archivo de Reental y el nombre del
   archivo, este solo si ningún otro token tiene ya ese nombre. */
const REFUERZOS_QUE_CONFIRMAN = ["cruce_csv", "nombre_csv"];
const confirmaAlguno = refuerzos => (refuerzos || []).some(r => REFUERZOS_QUE_CONFIRMAN.includes(r));
function registrarInmueble(catalogo, addr, nombreEtherscan, simbolo, via, primeraAparicion, nombreReental, refuerzos) {
  refuerzos = [...refuerzos];
  const entrada = catalogo[addr];
  if (!entrada) {
    catalogo[addr] = {
      nombre_reental: nombreReental,
      nombre_etherscan: nombreEtherscan,
      simbolo,
      via,
      primera_aparicion: primeraAparicion ?? null,
      refuerzos,
      estado: confirmaAlguno(refuerzos) ? "CONFIRMADA" : "CANDIDATA"
    };
    return "nueva";
  }
  let resultado = null;
  if (nombreReental && !entrada.nombre_reental) entrada.nombre_reental = nombreReental;
  if (!entrada.nombre_etherscan) entrada.nombre_etherscan = nombreEtherscan;
  if (!(entrada.via || "").includes(via)) entrada.via = "A+B";
  const nuevos = refuerzos.filter(r => !(entrada.refuerzos || []).includes(r));
  if (nuevos.length) entrada.refuerzos = [...(entrada.refuerzos || []), ...nuevos];
  if (confirmaAlguno(entrada.refuerzos) && entrada.estado === "CANDIDATA") {
    entrada.estado = "CONFIRMADA";
    resultado = "confirmada";
  }
  if (primeraAparicion && (!entrada.primera_aparicion || primeraAparicion < entrada.primera_aparicion))
    entrada.primera_aparicion = primeraAparicion;
  return resultado;
}

/* Las direcciones de un bloque de la cache escritas a mano con mayúsculas o
   espacios pasan a minúsculas (si ya estaba en minúsculas, se queda esa). */
function normalizarClaves(bloque) {
  if (!bloque || typeof bloque !== "object" || Array.isArray(bloque)) return;
  for (const clave of Object.keys(bloque)) {
    const nueva = normalizarDireccion(clave);
    if (nueva === clave) continue;
    const valor = bloque[clave];
    delete bloque[clave];
    if (!Object.prototype.hasOwnProperty.call(bloque, nueva)) bloque[nueva] = valor;
  }
}
function descubrirInmuebles(cache, filasCsv, indicePorHash, wallet, vault) {
  saneaCatalogoYRoles(cache);
  const catalogo = cache.catalogo_propiedades;
  normalizarClaves(catalogo);
  for (const bloque of Object.values(cache.contratos_aprendidos || {})) normalizarClaves(bloque);
  // Las stablecoins conocidas NO son inmuebles.
  const noInmueble = new Set([wallet, vault, USDT, RNT, BURN, ...STABLECOINS].filter(Boolean).map(normalizarDireccion));
  for (const bloque of Object.values(cache.contratos_aprendidos || {})) {
    Object.keys(bloque).forEach(a => noInmueble.add(normalizarDireccion(a)));
  }
  // Una dirección que trae la app y el usuario quitó sigue sin
  // ser un inmueble (p. ej. el recibo del pool de SushiSwap).
  if (typeof semillasQuitadas === "function") semillasQuitadas(cache).forEach(a => noInmueble.add(a));
  // Ni un token que mandaste al spam (también «Descartar» del catálogo):
  // no se confirma solo ni cuenta como dueño de un nombre.
  const spamTokens = apartadosCache(cache, "tokens");
  spamTokens.forEach(a => noInmueble.add(a));
  const nombresCsv = new Map();
  for (const fila of filasCsv) {
    const clave = normalizarNombreInmueble(fila.inmueble);
    if (clave) nombresCsv.set(clave, fila.inmueble);
  }
  const primeras = primerasApariciones(cache);
  const resumen = { nuevas: [], confirmadas: [], candidatas: [], avisos: [] };
  const spamDirecciones = apartadosCache(cache, "direcciones");

  function registrar(tx, via, nombreReental, refuerzos) {
    const ca = normalizarDireccion(tx.contractAddress);
    const nombre = (tx.tokenName || "").trim();
    const simbolo = (tx.tokenSymbol || "").trim();
    if (tienePrefijoReental(nombre, simbolo) && !refuerzos.includes("prefijo_reental"))
      refuerzos = [...refuerzos, "prefijo_reental"];
    const resultado = registrarInmueble(catalogo, ca, nombre, simbolo, via, primeras[ca], nombreReental, refuerzos);
    if (resultado === "nueva") resumen.nuevas.push(ca);
    else if (resultado === "confirmada") resumen.confirmadas.push(ca);
  }

  // Vía A: cruce de los hashes del CSV con los token transfers del vault.
  const vaultPorHash = indexarPorHash(cache.transacciones.vault_tokens || []);
  for (const [h, filas] of Object.entries(indicePorHash)) {
    for (const tx of (vaultPorHash[h] || [])) {
      const ca = normalizarDireccion(tx.contractAddress);
      if (noInmueble.has(ca) || normalizarDireccion(tx.to) !== vault) continue;
      if (normalizarDireccion(tx.from) === BURN) continue;
      // Un Map (un token «constructor» casaría con lo que hereda un objeto
      // normal).
      const nombresHash = new Map();
      for (const f of filas) {
        const k = normalizarNombreInmueble(f.inmueble);
        if (k) nombresHash.set(k, f.inmueble);
      }
      let nombreReental = nombresHash.get(normalizarNombreInmueble(tx.tokenName || ""));
      if (nombreReental === undefined && nombresHash.size === 1)
        nombreReental = [...nombresHash.values()][0];
      if (nombreReental === undefined)
        resumen.avisos.push("Vía A: contrato " + ca + " en hash " + h.slice(0, 18) + "... sin nombre inequívoco en el archivo de rendimientos (inmuebles del hash: " + [...nombresHash.values()].sort().join(", ") + ")");
      registrar(tx, "A", nombreReental ?? null, ["cruce_csv"]);
    }
  }

  // Vía B: tokens recibidos por la wallet (los del vault los cubre la Vía A).
  // Un token falso con el nombre de un inmueble tuyo no debe confirmarse
  // solo (saldría una compra bancaria inventada). Quién tiene ya cada
  // nombre: los del catálogo (menos los descartados) y los que van
  // apareciendo; y los tokens que se queman en cada hash (canje de un
  // inmueble redesplegado). Lo que llega de una dirección que imita la tuya o que mandaste
  // al spam, o un token que mandaste al spam, no entra en el catálogo.
  const duenos = new Map();
  const anotarDueno = (clave, addr) => {
    if (!duenos.has(clave)) duenos.set(clave, new Set());
    duenos.get(clave).add(addr);
  };
  for (const [addr, entrada] of Object.entries(catalogo)) {
    if (!entrada || typeof entrada !== "object" || estadoCatalogo(entrada) === "DESCARTADA" || spamTokens.has(normalizarDireccion(addr))) continue;
    for (const campo of ["nombre_reental", "nombre_etherscan"]) {
      const clave = normalizarNombreInmueble(entrada[campo]);
      if (clave) anotarDueno(clave, normalizarDireccion(addr));
    }
  }
  const quemados = new Set();
  for (const nombreSerie of ["wallet_tokens", "vault_tokens"]) {
    for (const tx of (cache.transacciones[nombreSerie] || [])) {
      if (normalizarDireccion(tx.to) === BURN)
        quemados.add(normalizarDireccion(tx.hash) + "|" + normalizarDireccion(tx.contractAddress));
    }
  }
  for (const tx of (cache.transacciones.wallet_tokens || [])) {
    const ca = normalizarDireccion(tx.contractAddress);
    if (!ca || noInmueble.has(ca)) continue;
    if (normalizarDireccion(tx.to) !== wallet) continue;
    const origen = normalizarDireccion(tx.from);
    if (spamDirecciones.has(origen) || imitaDireccionPropia(origen)) continue;
    const nombre = (tx.tokenName || "").trim();
    const simbolo = (tx.tokenSymbol || "").trim();
    if (nombreTokenSospechoso(nombre, simbolo)) continue;
    const refuerzos = [];
    const clave = normalizarNombreInmueble(nombre);
    let nombreReental = nombresCsv.get(clave);
    const otros = [...(duenos.get(clave) || [])].filter(o => o !== ca);
    const h = normalizarDireccion(tx.hash);
    const canje = otros.some(o => quemados.has(h + "|" + o));
    if (origen === BURN) {
      // Lo acuñado (llega desde 0x0). Cualquiera puede acuñarte un token, así que solo entra con
      // el prefijo o el nombre del archivo, y con dudas salvo en un canje
      // (el redespliegue de un inmueble).
      if (!(canje || nombreReental || tienePrefijoReental(nombre, simbolo))) continue;
      if (!canje) nombreReental = undefined;
    }
    if (nombreReental && (!otros.length || canje)) {
      refuerzos.push("nombre_csv");
    } else {
      nombreReental = null;
    }
    registrar(tx, "B", nombreReental, refuerzos);
    if (clave) anotarDueno(clave, ca);
  }

  // Limpieza automática de candidatas stablecoin. Si una
  // entrada del catálogo tiene estado CANDIDATA y su dirección o símbolo
  // corresponde a una stablecoin conocida, se retira del catálogo y se
  // avisa en el log. Las CONFIRMADAS o DESCARTADAS por el usuario no se
  // tocan (principio de no destruir decisiones manuales).
  const retiradas = [];
  for (const [addr, entrada] of Object.entries(catalogo)) {
    if (!entrada || typeof entrada !== "object") continue;
    if (entrada.estado !== "CANDIDATA") continue;
    const simbolo = (entrada.simbolo || "").toUpperCase().trim();
    if (STABLECOINS.has(addr) || simbolo === "USDT" || simbolo === "USDC") {
      retiradas.push({ addr, simbolo: entrada.simbolo, nombre: entrada.nombre_etherscan });
      delete catalogo[addr];
    }
  }
  if (retiradas.length) {
    // Lo retirado deja de contar como nuevo o confirmado: el resumen solo
    // habla de lo que sigue en el catálogo.
    resumen.nuevas = resumen.nuevas.filter(a => a in catalogo);
    resumen.confirmadas = resumen.confirmadas.filter(a => a in catalogo);
    resumen.avisos.push("Limpieza automática Subfase USDC: " + retiradas.length +
      " entrada(s) CANDIDATA de stablecoin conocida retirada(s) del catálogo: " +
      retiradas.map(r => (r.simbolo || "?") + " " + r.addr).join(", "));
  }

  // Sin las mandadas al spam: ya están decididas (no salen en el catálogo).
  resumen.candidatas = Object.entries(catalogo)
    .filter(([a, e]) => estadoCatalogo(e) === "CANDIDATA" && !spamTokens.has(normalizarDireccion(a)))
    .map(([a]) => a);
  return resumen;
}

function descubrirRolesCsv(cache, indicePorHash, vault, wallet) {
  const aprendidos = cache.contratos_aprendidos;
  // Las stablecoins conocidas no pueden tener rol aprendido.
  const yaConRol = new Set([wallet, vault, USDT, RNT, BURN, ...STABLECOINS].filter(Boolean).map(normalizarDireccion));
  for (const bloque of Object.values(aprendidos)) {
    Object.keys(bloque).forEach(a => yaConRol.add(normalizarDireccion(a)));
  }
  // Ni distribuidor ni liquidación de Reental (no tienen ✕).
  if (typeof semillasQuitadas === "function") semillasQuitadas(cache).forEach(a => yaConRol.add(a));
  const vaultPorHash = indexarPorHash(cache.transacciones.vault_tokens || []);
  // Cualquier stablecoin conocida entrando al vault en un
  // hash de rendimiento identifica a un distribuidor.
  function* stableAlVault(h) {
    for (const tx of (vaultPorHash[h] || [])) {
      if (STABLECOINS.has(normalizarDireccion(tx.contractAddress)) && normalizarDireccion(tx.to) === vault)
        yield normalizarDireccion(tx.from);
    }
  }
  const walletPorHash = indexarPorHash(cache.transacciones.wallet_tokens || []);
  /* También quien manda a la wallet lo reclamado de una fila del archivo
     (el importe de su claimed, en el hash de su reclamo). Mirando solo el
     vault, sin vault nunca se aprendería, y un reclamo que el archivo aún
     no trae saldría como «ingreso de dinero». */
  function* stableReclamadoAWallet(h) {
    const reclamados = new Set(indicePorHash[h].filter(f => f.claimed > 0).map(f => pdRedondear6(f.claimed)));
    for (const tx of (walletPorHash[h] || [])) {
      if (STABLECOINS.has(normalizarDireccion(tx.contractAddress)) && normalizarDireccion(tx.to) === normalizarDireccion(wallet) &&
          reclamados.has(pdRedondear6(cantidadTx(tx) || -1)))
        yield normalizarDireccion(tx.from);
    }
  }
  const nuevosDist = [];
  for (const h of Object.keys(indicePorHash)) {
    for (const origen of [...stableAlVault(h), ...stableReclamadoAWallet(h)]) {
      if (origen && !yaConRol.has(origen)) {
        aprendidos.DISTRIBUIDOR[origen] = "Distribuidor de rendimientos (cruce con el archivo de Reental)";
        yaConRol.add(origen);
        nuevosDist.push(origen);
      }
    }
  }
  const confirmadas = inmueblesConfirmados(cache);
  const hashesBurn = new Set();
  for (const nombreSerie of ["wallet_tokens", "vault_tokens"]) {
    for (const tx of (cache.transacciones[nombreSerie] || [])) {
      if (normalizarDireccion(tx.to) === BURN && confirmadas[normalizarDireccion(tx.contractAddress)])
        hashesBurn.add(normalizarDireccion(tx.hash));
    }
  }
  /* También la stablecoin que entra a la wallet en el hash del burn, no
     solo al vault (sin vault, o cobrada en la wallet, la venta saldría sin
     precio y el cobro como depósito, y al resolverla la cartera tendría el
     doble). */
  function* stableAWallet(h) {
    for (const tx of (walletPorHash[h] || [])) {
      if (STABLECOINS.has(normalizarDireccion(tx.contractAddress)) && normalizarDireccion(tx.to) === normalizarDireccion(wallet))
        yield normalizarDireccion(tx.from);
    }
  }
  const nuevosSettle = [];
  for (const h of [...hashesBurn].sort()) {
    for (const origen of [...stableAlVault(h), ...stableAWallet(h)]) {
      if (origen && !yaConRol.has(origen)) {
        aprendidos.SETTLEMENT[origen] = "Settlement (burn de tokens de un inmueble + stablecoin al vault)";
        yaConRol.add(origen);
        nuevosSettle.push(origen);
      }
    }
  }
  return { nuevosDist, nuevosSettle };
}

function descubrimientoDinamico(cache, filasCsv, indicePorHash, wallet, vault) {
  const resumen = descubrirInmuebles(cache, filasCsv, indicePorHash, wallet, vault);
  const { nuevosDist, nuevosSettle } = descubrirRolesCsv(cache, indicePorHash, vault, wallet);
  const catalogo = cache.catalogo_propiedades;
  for (const addr of resumen.nuevas) {
    const e = catalogo[addr];
    const nombre = e.nombre_reental || e.nombre_etherscan || "(sin nombre)";
    log("  Inmueble " + e.estado + ": " + nombre + " [" + (e.simbolo || "") + "] " + addr + " (vía " + e.via + ", primera aparición " + (e.primera_aparicion || "?") + ")");
  }
  for (const addr of resumen.confirmadas) {
    const e = catalogo[addr];
    log("  Candidata confirmada por refuerzo: " + (e.nombre_reental || e.nombre_etherscan) + " " + addr, "ok");
  }
  for (const aviso of resumen.avisos) log("  AVISO: " + aviso, "warn");
  for (const addr of nuevosDist) log("  Rol DISTRIBUIDOR aprendido: " + addr);
  for (const addr of nuevosSettle) log("  Rol SETTLEMENT aprendido: " + addr);
  if (resumen.candidatas.length) {
    log("  ATENCIÓN: " + resumen.candidatas.length + " candidata(s) sin refuerzo, NO se tratarán como inmueble:", "warn");
    for (const addr of resumen.candidatas) {
      const e = catalogo[addr];
      log("    - " + (e.nombre_etherscan || "(sin nombre)") + " [" + (e.simbolo || "") + "] " + addr);
    }
    log("    Confirma o descarta cada una en 🔍 Revisión → Catálogo de inmuebles.");
  }
  const nConf = Object.keys(inmueblesConfirmados(cache)).length;
  log("Catálogo de inmuebles: " + nConf + " confirmadas, " + resumen.candidatas.length + " candidatas. " +
    "Distribuidores: " + Object.keys(cache.contratos_aprendidos.DISTRIBUIDOR).length + ". " +
    "Settlements: " + Object.keys(cache.contratos_aprendidos.SETTLEMENT).length + ".", "ok");
  return resumen;
}

async function ejecutarDescubrimiento() {
  if (!state.cache) return toast("Sin datos todavía: completa 🚀 Puesta en marcha.", "error");
  if (!state.csvCargado) return toast("Primero carga tu archivo de rendimientos en 🚀 Puesta en marcha.", "error");
  leerConfigDesdeFormulario();
  const wallet = normalizarDireccion(state.config.wallet);
  const vault = normalizarDireccion(state.config.vault);
  if (!wallet || !vault) return toast("Falta tu dirección de wallet o la del vault en tus datos de 🚀 Puesta en marcha.", "error");
  log("--- Descubrimiento de tus inmuebles y de los contratos de Reental ---", "ok");
  const resumen = descubrimientoDinamico(state.cache, state.filasCsv, state.indicePorHash, wallet, vault);
  marcarCacheDirty();
  await autoGuardarCache();
  renderPanel();
  actualizarChipEstado();
  toast("Descubrimiento completado: " + resumen.nuevas.length + " nuevas, " +
    resumen.confirmadas.length + " confirmadas, " + resumen.candidatas.length + " candidatas por decidir.",
    resumen.candidatas.length ? "warn" : "ok",
    resumen.candidatas.length ? { texto: "Revisar candidatas en 🔍 Revisión", fn: () => { location.hash = "#revision"; } } : null, 9000);
}