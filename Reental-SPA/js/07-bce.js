/* =====================================================================
   REENTAL SPA · js/07-bce.js
   Tipos de cambio EUR/USD del Banco Central Europeo: descarga,
   parseo del formato jsondata, forward-fill de festivos y cobertura
   incremental.
   ===================================================================== */

function parsearRespuestaBce(data) {
  const tipos = {};
  const fechas = data.structure.dimensions.observation[0].values;
  const series = data.dataSets[0].series;
  for (const clave of Object.keys(series)) {
    for (const [indice, obs] of Object.entries(series[clave].observations)) {
      tipos[fechas[parseInt(indice, 10)].id] = obs[0];
    }
  }
  return tipos;
}
/* Si el BCE falla, error (el paso sale en rojo y la sincronización no dice
   «completa»), no {} con solo una línea en el registro. Sin tipos en el tramo (un fin de semana, o hoy aún sin
   publicar) el BCE responde 200 sin nada: eso no es un error. */
async function descargarTiposBce(fechaInicio, fechaFin) {
  log("Descargando tipos BCE " + fechaEs(fechaInicio) + " → " + fechaEs(fechaFin) + "...");
  const url = BCE_URL + "?" + new URLSearchParams({ startPeriod: fechaInicio, endPeriod: fechaFin, format: "jsondata" });
  let r;
  try { r = await fetch(url); } catch (e) { throw new Error("el BCE no responde (" + e.message + ")"); }
  if (!r.ok) throw new Error("el BCE devolvió " + r.status);
  const texto = await r.text();
  if (!texto.trim()) { log("El BCE no tiene tipos nuevos en ese tramo.", "ok"); return {}; }
  let tipos;
  try { tipos = parsearRespuestaBce(JSON.parse(texto)); } catch (e) { throw new Error("respuesta del BCE ilegible (" + e.message + ")"); }
  log(Object.keys(tipos).length + " tipos de cambio descargados.", "ok");
  return tipos;
}
function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
// Como mucho estos dias sin tipo publicado toman el anterior.
const DIAS_MAX_SIN_TIPO_BCE = 4;
// Una fecha AAAA-MM-DD que existe (no «2025-02-30» ni «15/04/2026»).
function esFechaBce(f) {
  if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(f + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === f;
}
/* Un día después de lo cubierto (el de la sincronización: su tipo aún no
   se podía pedir, se pide hasta ayer) admite un día más; si no, el martes
   de Pascua por la mañana se quedaría sin tipo.
   Lo usan el motor (reindexarForwardFill) y el vault del informe (js/22). */
function diasMaxSinTipoBce(fecha, cache) {
  const fin = cache && cache.bce_cobertura ? cache.bce_cobertura.fin : null;
  return DIAS_MAX_SIN_TIPO_BCE + (esFechaBce(fin) && fecha > fin ? 1 : 0);
}
/* Rellena todas las fechas del rango: fines de semana y festivos toman el
   ultimo tipo publicado anterior, como mucho DIAS_MAX_SIN_TIPO_BCE dias
   despues de el. Las fechas anteriores al primer dato o mas alla de ese
   hueco (una descarga del BCE que fallo) quedan sin valor (REVISAR): no se
   inventa un tipo (un tipo viejo no vale para meses). Lo usa el motor
   fiscal (js/21). Con `cache`, los días después de lo cubierto admiten
   uno más (diasMaxSinTipoBce). */
function reindexarForwardFill(tipos, fechaInicio, fechaFin, cache) {
  const reindexado = {};
  // Pasado el ultimo tipo publicado y su hueco ya no se rellena nada; si
  // no, una fecha lejana (9999, escrita a mano) recorreria millones de dias
  // (5 s en cada calculo).
  const publicados = Object.keys(tipos).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f));
  if (!publicados.length) return reindexado;
  const ultimoPublicado = publicados.reduce((a, b) => (b > a ? b : a));
  let ultimo = null, diasSinTipo = 0, dia = fechaInicio;
  while (dia <= fechaFin) {
    if (Object.prototype.hasOwnProperty.call(tipos, dia)) { ultimo = tipos[dia]; diasSinTipo = 0; } else diasSinTipo += 1;
    const max = diasMaxSinTipoBce(dia, cache);
    if (ultimo !== null && diasSinTipo <= max) reindexado[dia] = ultimo;
    if (dia >= ultimoPublicado && diasSinTipo > DIAS_MAX_SIN_TIPO_BCE) break;
    const siguiente = sumarDias(dia, 1);
    // Despues del 31/12/9999 no hay dia siguiente (sale
    // «+010000-01», que como texto es menor y el bucle no acababa).
    if (siguiente.length !== 10 || siguiente <= dia) break;
    dia = siguiente;
  }
  return reindexado;
}
function fechasUnicasTransacciones(cache, filasCsv) {
  const fechas = new Set();
  for (const serie of Object.values(cache.transacciones)) {
    for (const tx of serie) { const f = fechaDeTx(tx); if (f) fechas.add(f); }
  }
  for (const fila of filasCsv) { if (fila.fecha_reparto) fechas.add(fmtFecha(enHoraEspanola(fila.fecha_reparto))); }
  return [...fechas];
}
/* Lo cubierto llega como mucho hasta ayer (UTC; hoy: fecha ISO para los
   tests): el tipo de hoy puede no estar publicado aún y, si se diera por
   descargado, el día se quedaría con el tipo del anterior.
   Lo cubierto solo vale con dos fechas que
   existen y llega como mucho a ayer y a 4 días después del último tipo
   guardado (el hueco más largo del BCE): un reloj adelantado, una fecha
   futura escrita a mano o tipos borrados no lo estiran; sin tipos dentro,
   no hay nada cubierto. */
function coberturaBce(cache, ayer) {
  const c = cache.bce_cobertura || {};
  if (!esFechaBce(c.inicio) || !esFechaBce(c.fin)) return null;
  const tope = c.fin < ayer ? c.fin : ayer;
  const ultimo = Object.keys(cache.tipos_bce || {}).filter(f => f >= c.inicio && f <= tope && esFechaBce(f))
    .reduce((a, b) => (b > a ? b : a), "");
  if (!ultimo) return null;
  const fin = sumarDias(ultimo, DIAS_MAX_SIN_TIPO_BCE);
  return { inicio: c.inicio, fin: fin < tope ? fin : tope };
}
async function actualizarTiposBce(cache, fechasNecesarias, hoy) {
  if (!fechasNecesarias.length) return 0;
  const necesarioInicio = sumarDias(fechasNecesarias.reduce((a, b) => a < b ? a : b), -7);
  const necesarioFin = fechasNecesarias.reduce((a, b) => a > b ? a : b);
  const ayer = sumarDias(hoy || hoyEspana(), -1);  // el «hoy» de las fechas (hora española)
  const cob = coberturaBce(cache, ayer);
  if (cob && cob.inicio <= necesarioInicio && necesarioFin <= cob.fin) {
    log("Tipos BCE ya cubiertos para el rango necesario: sin llamadas de red.", "ok");
    return 0;
  }
  // Si lo de antes ya está, solo se pide lo que falta por el final (no
  // toda la serie cada día), con 7 días de antes: un día que el BCE
  // publicó tarde entra en la siguiente.
  const soloElFinal = !!cob && cob.inicio <= necesarioInicio;
  const pedirInicio = soloElFinal ? sumarDias(cob.fin, -7) : necesarioInicio;
  const inicioNuevo = soloElFinal ? cob.inicio : necesarioInicio;
  const pedirFin = cob && cob.fin > necesarioFin ? cob.fin : necesarioFin;
  const nuevos = await descargarTiposBce(pedirInicio, pedirFin);
  if (!Object.keys(nuevos).length) {
    // Cinco días seguidos ya pasados tienen siempre algún tipo (el hueco
    // más largo del BCE, Pascua, es de cuatro): vacío ahí es un fallo suyo.
    const hasta = pedirFin < ayer ? pedirFin : ayer;
    if (Date.parse(hasta) - Date.parse(pedirInicio) >= 4 * 86400000) {
      throw new Error("el BCE no devolvió ningún tipo del " + fechaEs(pedirInicio) + " al " + fechaEs(hasta));
    }
    return 0;
  }
  const antes = Object.keys(cache.tipos_bce).length;
  Object.assign(cache.tipos_bce, nuevos);
  cache.bce_cobertura = { inicio: inicioNuevo, fin: pedirFin < ayer ? pedirFin : ayer };
  return Object.keys(cache.tipos_bce).length - antes;
}