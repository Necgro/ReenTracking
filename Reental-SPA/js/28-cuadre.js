/* =====================================================================
   REENTAL SPA · js/28-cuadre.js
   El cuadre de la cartera con la blockchain, con las mismas cifras que
   las de referencia.

   Lo que el motor fiscal (js/21) cree que tienes de cada token, menos lo
   que él mismo sabe que está fuera de la wallet y del vault (pools,
   staking, farming, otras cuentas tuyas: «apartado» de motorFiscal),
   contra el saldo vivo de la wallet y el vault en la blockchain. Lo de los
   pools no se lee de la blockchain: su valor cambia con los precios y
   nunca cuadraría. Una diferencia es
   un movimiento que falta, sobra o está mal apuntado.

   Cuándo: al terminar «🔄 Actualizar» de 🚀 (arrFlujo, js/19), si la
   descarga de Etherscan llegó entera (con ella a medias saldría una
   diferencia falsa). Solo se guardan los saldos leídos,
   en memoria (state.cuadre, como la verificación del vault en
   state.sync.vault): la comparación se rehace en cada cálculo de 🧾
   Fiscal (fiCalcular, js/23), así que una decisión tomada después en
   🔍 Revisión se ve sin volver a leer. Valen solo para la cache y la
   wallet y el vault con que se leyeron.

   Dónde se ve: una línea en el resumen de 🚀, los avisos del informe del
   año de la lectura (🧾 Fiscal, el informe imprimible y las hojas «Fiscal
   AAAA» del Excel) y la hoja «Cuadre con la blockchain» del Excel (js/26).
   Los textos son de la app; con las de referencia solo se comparan cifras.
   Prueba: tests/test_cuadre_paso_cuadre3.js y paridad_cuadre_paso_cuadre3.
   ===================================================================== */

const CUADRE_TOLERANCIA = 0.01;
// Lo mínimo entre el principio de dos llamadas a Etherscan: su plan gratis
// admite unas 3 por segundo y, si se pasa, hace esperar 6 s (con 400 ms
// aún se pasaba: una veintena de tokens con vault tardaba 80 s).
const CUADRE_PAUSA_MS = 600;
// {activo: contrato}, en el orden del cuadre.
const CUADRE_ACTIVOS_BASE = [USDT, USDC, RNT, "pol"].map(c => [nombreActivoFifo(c), c]);
const CUADRE_ORDEN_BASE = CUADRE_ACTIVOS_BASE.map(([a]) => a);

// Objetos sin prototipo: una clave «__proto__» del catálogo es una más.
function cuadreObjeto() { return Object.create(null); }

/* {contrato: decimales} de los tokens de la cache: los que da Etherscan en
   sus transfers. Unos mal escritos no cuentan; si dos transfers no
   coinciden, null: no se sabe leer su saldo. */
function cuadreDecimalesPorContrato(cache) {
  const vistos = new Map();
  const transacciones = esObjetoCache(cache && cache.transacciones) ? cache.transacciones : {};
  for (const serie of ["wallet_tokens", "vault_tokens"]) {
    for (const tx of Array.isArray(transacciones[serie]) ? transacciones[serie] : []) {
      if (!esObjetoCache(tx)) continue;
      const d = enteroDeTexto(tx.tokenDecimal);
      if (d !== null && d >= 0n && d <= 255n) {
        const contrato = normalizarDireccion(String(tx.contractAddress ?? ""));
        if (!vistos.has(contrato)) vistos.set(contrato, new Set());
        vistos.get(contrato).add(Number(d));
      }
    }
  }
  const out = cuadreObjeto();
  for (const [c, d] of vistos) out[c] = d.size === 1 ? [...d][0] : null;
  return out;
}

/* {activo: contrato} de lo que se cuadra: USDT, USDC, RNT, POL, los
   inmuebles del catálogo y cualquier otro token que quede en la cartera
   del motor (colas: el Map de motorFiscal). */
function cuadreActivos(colas, cache) {
  const activos = cuadreObjeto();
  for (const [a, c] of CUADRE_ACTIVOS_BASE) activos[a] = c;
  for (const contrato of Object.keys(inmueblesConfirmadosCache(cache))) activos[contrato] = contrato;
  for (const activo of rentaComoMap(colas).keys()) {
    if (!(activo in activos) && direccionValida(String(activo))) activos[activo] = activo;
  }
  return activos;
}

/* Saldo vivo de cada activo en la wallet y, si hay, en el vault:
   {activo: {wallet, vault}} (null donde la API no respondió, el saldo no
   tiene sentido o no se saben los decimales). Tras CUADRE_SIN_RESPUESTA
   respuestas seguidas sin saldo (sin red o con el límite de Etherscan) no
   se pregunta más y lo que queda sale sin leer (cada pregunta sin red
   tarda ~9 s y, con una veintena de tokens y vault, la app se quedaría
   6 minutos «Trabajando»). Una respuesta mala de un solo token son 2 (wallet y
   vault): no corta. */
const CUADRE_SIN_RESPUESTA = 3;
async function cuadreLeerSaldos(activos, cache, apiKey, wallet, vault, pausa = CUADRE_PAUSA_MS) {
  const direcciones = [["wallet", wallet]].concat(vault ? [["vault", vault]] : []);
  const porContrato = cuadreDecimalesPorContrato(cache);
  const saldos = cuadreObjeto();
  let anterior = null, seguidas = 0;
  for (const [activo, contrato] of Object.entries(activos)) {
    const decimales = contrato === "pol" ? 18
      : contrato in porContrato ? porContrato[contrato]
      : fiscTiene(DECIMALES, contrato) ? DECIMALES[contrato] : DECIMALES_DEFECTO;
    saldos[activo] = {};
    for (const [donde, direccion] of direcciones) {
      if (decimales === null || seguidas >= CUADRE_SIN_RESPUESTA) { saldos[activo][donde] = null; continue; }
      if (pausa && anterior !== null) await sleep(Math.max(0, pausa - (Date.now() - anterior)));
      anterior = Date.now();
      const n = await saldoTokenOnchain(direccion, contrato, apiKey, decimales);
      seguidas = n === null ? seguidas + 1 : 0;
      // Un saldo negativo no existe: no se afirma.
      saldos[activo][donde] = n === null || n >= 0 ? n : null;
    }
  }
  return saldos;
}

/* Compara, token a token, lo que el motor cree que tienes en la wallet y
   el vault (su cartera menos lo apartado) con lo leído de la blockchain.
   Devuelve {filas, diferencias, sin_leer}: una fila por token con algo
   (los que no tienen nada en ningún lado no salen). */
function cuadreCartera(colas, apartado, saldos, cache, tolerancia = CUADRE_TOLERANCIA) {
  const r6 = v => (v === null ? null : pyRedondeo(v, 6));
  colas = rentaComoMap(colas);
  const posicion = posicionAbierta(colas);
  const filas = [];
  for (const [activo, leido] of Object.entries(saldos)) {
    const motor = activo in posicion ? posicion[activo][0] : 0;
    const aparte = apartado && fiscTiene(apartado, activo) ? apartado[activo] || {} : {};
    const pools = pyGet(aparte, "pools", 0), defi = pyGet(aparte, "defi", 0);
    const otras = pyGet(aparte, "otras_cuentas", 0);
    const esperado = motor - pools - defi - otras;
    const valores = Object.values(leido || {});
    const blockchain = !valores.length || valores.some(v => v === null || v === undefined) ? null : pySuma(valores);
    // Sin nada en ningún lado no sale; si hay algo apartado, sí. Sin
    // leer, tampoco sale si el motor no tiene nada.
    if (Math.abs(blockchain ?? 0) <= tolerancia && Math.abs(motor) <= tolerancia &&
        Math.abs(esperado) <= tolerancia) continue;
    const diferencia = blockchain === null ? null : blockchain - esperado;
    filas.push({
      activo, nombre: excelEtiquetaActivo(activo, cache),
      motor: r6(motor), en_pools: r6(pools), en_defi: r6(defi), en_otras_cuentas: r6(otras),
      esperado: r6(esperado), wallet: r6(pyGet(leido, "wallet", null)), vault: r6(pyGet(leido, "vault", null)),
      blockchain: r6(blockchain), diferencia: r6(diferencia),
      coincide: diferencia === null ? null : Math.abs(diferencia) <= tolerancia,
    });
  }
  const orden = f => (CUADRE_ORDEN_BASE.includes(f.activo) ? CUADRE_ORDEN_BASE.indexOf(f.activo) : CUADRE_ORDEN_BASE.length);
  filas.sort((a, b) => orden(a) - orden(b) || cmpTexto(String(a.nombre).toLowerCase(), String(b.nombre).toLowerCase()));
  return { filas, diferencias: filas.filter(f => f.coincide === false), sin_leer: filas.filter(f => f.coincide === null) };
}

/* Una diferencia del cuadre, en llano, para los avisos. */
function cuadreTextoDiferencia(f) {
  const aparte = [["en_pools", "en pools"], ["en_defi", "en staking o farming"], ["en_otras_cuentas", "en otras cuentas tuyas"]]
    .filter(([c]) => f[c]).map(([c, t]) => cantidadEs(f[c]) + " " + t);
  const inicio = f.esperado < 0
    // Lo apartado pasa de lo que el motor cree que tienes.
    ? f.nombre + ": lo que la app da por apartado (" + aparte.join(", ") + ") pasa en " +
      cantidadEs(-f.esperado) + " de lo que cree que tienes"
    : f.nombre + ": según la app tendrías " + cantidadEs(f.esperado) + (f.vault === null ? " en la wallet" : " en la wallet y el vault") +
      (aparte.length ? " (aparte, " + aparte.join(", ") + ")" : "");
  return inicio + " y la blockchain dice " + cantidadEs(f.blockchain) + " (diferencia " + numEs(f.diferencia, 6, true, true) + ")";
}

/* El año del informe al que va el aviso: el de la lectura o, si no lo
   hay, el último hasta él (un año posterior es una fecha mal
   escrita); si todos son posteriores, el primero. null sin informes. */
function cuadreAnioAviso(informes, fecha) {
  const anios = Object.keys(informes || {}).map(Number);
  if (!anios.length) return null;
  const anio = fecha ? Number(fecha.slice(0, 4)) : Math.max(...anios);
  const hastaHoy = anios.filter(a => a <= anio);
  return hastaHoy.length ? Math.max(...hastaHoy) : Math.min(...anios);
}

/* Pone las diferencias del cuadre (y los tokens que no se pudieron leer)
   en los avisos del informe de cuadreAnioAviso, con la fecha de la
   lectura. nRevisar: los movimientos a revisar (la diferencia puede venir
   de ahí). */
function cuadreAvisar(informes, cuadre, fecha, nRevisar = 0) {
  if (!cuadre || !(cuadre.diferencias.length || cuadre.sin_leer.length)) return;
  const anio = cuadreAnioAviso(informes, fecha);
  if (anio === null) return;
  const avisos = informes[anio].avisos;
  const queHacer = "Si acabas de recibir o mandar algo, pulsa otra vez «🔄 Actualizar»; si sigue, falta, sobra o " +
    "está mal apuntado un movimiento de este token" +
    // Los que marca el motor, que 🔍 no siempre enseña: se dice cuántos
    // hay, no que se decidan allí. En singular, uno.
    (nRevisar ? " (hay " + (nRevisar === 1 ? "1 movimiento" : numEs(nRevisar, 0) + " movimientos") +
      " a revisar: puede venir de ahí)" : "");
  for (const f of cuadre.diferencias) {
    avisos.push({ fecha: fecha || null, tipo: "revisar", concepto: "Cuadre con la blockchain",
      detalle: cuadreTextoDiferencia(f) + ". " + queHacer + "." });
  }
  if (cuadre.sin_leer.length) {
    avisos.push({ fecha: fecha || null, tipo: "nota", concepto: "Cuadre con la blockchain",
      detalle: "No se pudo leer en la blockchain el saldo de " + cuadre.sin_leer.map(f => f.nombre).join(", ") +
        ": su cuadre no se hizo; pulsa otra vez «🔄 Actualizar»." });
  }
}

/* ----------------------------- En la app ----------------------------- */

/* Los saldos leídos en esta sesión, si valen para lo abierto (la misma
   cache y la misma wallet y vault); si no, null. */
function cuadreVigente() {
  const c = state.cuadre;
  return c && c.cache === state.cache && c.huella === arrHuellaConfig(state.config) ? c : null;
}

/* El cuadre de una pasada del motor (colas y apartado de fiCalcular) con
   la lectura c (la de cuadreVigente), con su fecha: de los tokens que se
   cuadran ahora. Uno que no se leyó (p.
   ej. un inmueble confirmado después en 🔍 Revisión) sale sin leer, no se
   salta; uno leído que ya no se cuadra (descartado o mandado al spam
   después) no sale (no es un «no cuadra»). */
function cuadreDeLaPasada(colas, apartado, cache, c) {
  const saldos = cuadreObjeto();
  for (const activo of Object.keys(cuadreActivos(colas, cache))) saldos[activo] = activo in c.saldos ? c.saldos[activo] : {};
  return Object.assign(cuadreCartera(colas, apartado, saldos, cache), { fecha: c.fecha });
}

/* Lee los saldos (al terminar «🔄 Actualizar», js/19) con la pasada del
   motor de 🧾 Fiscal (fiResultado, js/23) recién clasificado. Un fallo no
   para nada: el cuadre es una comprobación. */
async function cuadreLeer() {
  state.cuadre = null;
  try {
    const cfg = state.config || {};
    const wallet = normalizarDireccion(cfg.wallet || ""), vault = normalizarDireccion(cfg.vault || "");
    const cache = state.cache, huella = arrHuellaConfig(cfg);
    const activos = cuadreActivos(fiResultado().colas, cache);
    log("Cuadre de la cartera con la blockchain (wallet" + (vault ? " y vault" : "") + "): " +
      Object.keys(activos).length + " tokens...");
    const saldos = await cuadreLeerSaldos(activos, cache, (cfg.etherscan_api_key || "").trim(), wallet, vault);
    state.cuadre = { cache, huella, saldos, fecha: hoyEspana() };  // el día en España
    // La pasada con los avisos del cuadre: la misma que pintarán 🚀 y 🧾.
    const cu = fiResultado().cuadre;
    if (!cu) return;
    const leidos = cu.filas.length - cu.sin_leer.length;
    if (cu.sin_leer.length) log("No se pudo leer en la blockchain el saldo de " + cu.sin_leer.map(f => f.nombre).join(", ") + ".", "warn");
    for (const f of cu.diferencias) log("DIFERENCIA: " + cuadreTextoDiferencia(f) + ".", "warn");
    if (!cu.diferencias.length && leidos) {
      log("OK: cuadra" + (leidos === 1 ? " el token leído." : "n los " + leidos + " tokens leídos."), "ok");
    }
  } catch (e) {
    log("No se pudo hacer el cuadre con la blockchain (" + e.message + "): se sigue sin él.", "warn");
  }
}

/* Línea del resumen de 🚀 (arrResumen, js/19): del cálculo de 🧾 Fiscal,
   solo con 🚀 a la vista (el motor tarda: así una decisión en 🔍 no lo
   pasa otra vez) y si se puede hacer ahora; null si no hay cuadre que
   contar. Al volver a 🚀, js/19 la repinta. */
function cuadreParaResumen() {
  if (location.hash !== "#inicio" || !cuadreVigente() || fiMotivoSinCalculo()) return null;
  try { return fiResultado().cuadre || null; } catch (e) { return null; }
}

/* «ver los avisos» del resumen de 🚀: 🧾 Fiscal en el año del aviso. */
function cuadreIrAAvisos() {
  try {
    const r = fiResultado();
    const anio = r.cuadre ? cuadreAnioAviso(r.informes, r.cuadre.fecha) : null;
    // Con la cache apuntada: si no, 🧾 vuelve al último año terminado.
    if (anio !== null) fiElegirAnio(anio);
  } catch (e) { /* sin cálculo, 🧾 dice por qué */ }
  location.hash = "#fiscal";
  setTimeout(() => { const s = $("fiAvisos"); if (s) s.scrollIntoView({ behavior: "smooth" }); }, 150);
}
