/* =====================================================================
   REENTAL SPA · js/06-etherscan.js
   Cliente Etherscan V2 (Polygon, chainid 137): reintentos, rate limit,
   paginación por bloques y actualización incremental de las 5 series.
   ===================================================================== */

/* Devuelve la lista, [] si no hay datos o null si falla (sin red, clave mala,
   límite tras 3 intentos): un fallo no es «nada nuevo». */
async function etherscanGet(params, apiKey, etiqueta = "") {
  const p = new URLSearchParams(Object.assign({}, params, { apikey: apiKey, chainid: String(ETHERSCAN_CHAINID) }));
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(ETHERSCAN_BASE + "?" + p.toString());
      const data = await r.json();
      if (data.status === "1") return data.result;
      if (String(data.result || "").toLowerCase().includes("rate limit")) {
        log("Rate limit de Etherscan (" + etiqueta + "), esperando 6s...", "warn");
        await sleep(6000); continue;
      }
      if (["No transactions found", "No records found", "No data found"].includes(data.message)) return [];
      log("Aviso Etherscan " + etiqueta + ": " + data.message + " - " + data.result, "warn");
      return null;
    } catch (e) {
      log("Error Etherscan " + etiqueta + " (intento " + intento + "/3): " + e.message, "warn");
      await sleep(3000);
    }
  }
  return null;
}
/* Dónde buscar tu vault: los contratos a los que llamó tu wallet, sin los que
   la app ya conoce (tokens, inmuebles, DeFi, contratos aprendidos) ni los
   que dijiste que no son tu vault. */
function vaultCandidatos(cache, wallet) {
  const fuera = new Set([normalizarDireccion(wallet), USDT, USDC, RNT, BURN, ...vaultsRechazados(cache)]);
  for (const bloque of [cache.catalogo_propiedades, ...Object.values(SEMILLAS_DEFI), ...Object.values(cache.contratos_aprendidos || {})]) {
    for (const a of Object.keys(bloque || {})) fuera.add(normalizarDireccion(a));
  }
  const candidatos = new Set();
  for (const tx of cache.transacciones.wallet_normales || []) {
    const a = normalizarDireccion(tx.to);
    if (direccionValida(a) && !fuera.has(a)) candidatos.add(a);
  }
  return [...candidatos];
}
/* De `direcciones`, las que tu wallet creó con la fábrica de Reental:
   [{ direccion, fecha }] (fecha null si no viene). Etherscan admite 5 por
   llamada y omite las que no son contratos. Si falla una llamada, lo hallado
   en las otras; null si falla y no se halló nada. */
async function vaultsCreadosPor(direcciones, wallet, apiKey, pausa = 600, consultar = etherscanGet) {
  const w = normalizarDireccion(wallet), hallados = [];
  let fallo = false;
  for (let i = 0; i < direcciones.length; i += 5) {
    if (i) await sleep(pausa);
    const filas = await consultar({ module: "contract", action: "getcontractcreation",
      contractaddresses: direcciones.slice(i, i + 5).join(",") }, apiKey, "vault");
    if (filas === null) { fallo = true; continue; }
    for (const f of Array.isArray(filas) ? filas : []) {
      if (normalizarDireccion(f.contractCreator) === w && normalizarDireccion(f.contractFactory) === FABRICA_VAULTS &&
          direccionValida(f.contractAddress)) {
        const ts = Number(f.timestamp);
        hallados.push({ direccion: normalizarDireccion(f.contractAddress), fecha: ts > 0 ? new Date(ts * 1000) : null });
      }
    }
  }
  return fallo && !hallados.length ? null : hallados;
}
/* null si falla alguna página: lo ya recibido se descarta, porque guardarlo
   haría avanzar el último bloque y lo que faltaba no se pediría nunca. */
async function descargarTransacciones(direccion, action, apiKey, startblock = 0) {
  const etiqueta = action + " " + direccion.slice(0, 10) + "...";
  const registros = [], vistos = new Set();
  let bloqueActual = startblock;
  while (true) {
    const lote = await etherscanGet({
      module: "account", action, address: direccion,
      startblock: bloqueActual, endblock: 99999999, sort: "asc"
    }, apiKey, etiqueta);
    if (lote === null) return null;
    if (!lote.length) break;
    for (const tx of lote) {
      const huella = JSON.stringify(tx, Object.keys(tx).sort());
      if (!vistos.has(huella)) { vistos.add(huella); registros.push(tx); }
    }
    if (lote.length < ETHERSCAN_MAX_REGISTROS) break;
    bloqueActual = parseInt(lote[lote.length - 1].blockNumber, 10);
  }
  return registros;
}
async function actualizarTransacciones(cache, apiKey, wallet, vault) {
  const series = [
    ["wallet_normales", wallet, "txlist", "wallet"],
    ["wallet_tokens", wallet, "tokentx", "wallet"],
    ["wallet_internas", wallet, "txlistinternal", "wallet_internas"],
    ["vault_normales", vault, "txlist", "vault"],
    ["vault_tokens", vault, "tokentx", "vault"]
  ];
  // Lo descargado para otra dirección se vacía y se pide todo otra vez
  // desde el principio (si no, se clasificaría con lo viejo y la nueva solo
  // se pediría desde el último bloque de la vieja).
  for (const grupo of direccionesCambiadas(cache, wallet, vault)) {
    log("AVISO: las transacciones de tu " + grupo + " en la cache eran de otra dirección: se descargan otra vez desde el principio.", "warn");
    const [nombres, bloques] = GRUPOS_DIRECCION[grupo];
    for (const n of nombres) cache.transacciones[n] = [];
    for (const b of bloques) cache.ultimo_bloque[b] = 0;
  }
  const nuevas = {}, descargado = {};
  for (const [nombreSerie, direccion, action, claveBloque] of series) {
    // El vault es opcional. Sin direccion no hay nada que
    // pedir: se salta la serie en vez de preguntar a Etherscan por "".
    if (!normalizarDireccion(direccion)) { nuevas[nombreSerie] = 0; continue; }
    const desde = cache.ultimo_bloque[claveBloque] || 0;
    const startblock = desde > 0 ? desde + 1 : 0;
    descargado[nombreSerie] = await descargarTransacciones(direccion, action, apiKey, startblock);
  }
  // Las series que comparten último bloque se guardan juntas o ninguna; si
  // una falla, el bloque no avanza y la próxima vez se pide todo otra vez
  // (si avanzara con la que llegó, lo de la que falló no se pediría nunca).
  const fallidas = new Set(series.filter(([n]) => descargado[n] === null).map(s => s[3]));
  for (const [nombreSerie, , , claveBloque] of series) {
    if (!(nombreSerie in descargado)) continue;
    if (fallidas.has(claveBloque)) {
      nuevas[nombreSerie] = null;
      log(nombreSerie + ": NO SE PUDO DESCARGAR (" + cache.transacciones[nombreSerie].length + " en total; se pedirá otra vez la próxima vez).", "warn");
      continue;
    }
    const registros = descargado[nombreSerie];
    cache.transacciones[nombreSerie].push(...registros);
    nuevas[nombreSerie] = registros.length;
    log(nombreSerie + ": " + registros.length + " transacciones nuevas (" + cache.transacciones[nombreSerie].length + " en total).");
  }
  const grupos = [
    ["wallet", ["wallet_normales", "wallet_tokens"]],
    ["wallet_internas", ["wallet_internas"]],
    ["vault", ["vault_normales", "vault_tokens"]]
  ];
  for (const [claveBloque, nombres] of grupos) {
    let maximo = cache.ultimo_bloque[claveBloque] || 0;
    for (const nombre of nombres) {
      for (const tx of cache.transacciones[nombre]) {
        const b = parseInt(tx.blockNumber, 10);
        if (!isNaN(b) && b > maximo) maximo = b;
      }
    }
    cache.ultimo_bloque[claveBloque] = maximo;
  }
  // Para qué dirección se descargó cada grupo (solo si
  // llegó entero).
  const guardadas = esObjetoCache(cache.direcciones_descargadas) ? Object.assign({}, cache.direcciones_descargadas) : {};
  for (const [grupo, direccion] of [["wallet", wallet], ["vault", vault]]) {
    const d = normalizarDireccion(direccion || "");
    if (d && GRUPOS_DIRECCION[grupo][0].every(n => nuevas[n] !== null && nuevas[n] !== undefined)) guardadas[grupo] = d;
  }
  if (Object.keys(guardadas).length) cache.direcciones_descargadas = guardadas;
  // El paso de sincronización sale con error (no «completa»): lo bueno ya
  // está guardado arriba.
  const sinDescargar = Object.keys(nuevas).filter(n => nuevas[n] === null);
  if (sinDescargar.length) throw new Error("no se pudo descargar de Etherscan: " + sinDescargar.join(", ") + "; vuelve a sincronizar");
  return nuevas;
}
/* Con contratoToken "pol", el saldo de POL, la moneda de la red
   (account/balance). */
async function saldoTokenOnchain(direccion, contratoToken, apiKey, decimales) {
  const params = contratoToken === "pol" ? { module: "account", action: "balance", address: direccion, tag: "latest" }
    : { module: "account", action: "tokenbalance", contractaddress: contratoToken, address: direccion, tag: "latest" };
  const result = await etherscanGet(params, apiKey, params.action + " " + direccion.slice(0, 10) + "...");
  return (typeof result === "string") ? enteroAUnidades(result, decimales) : null;
}