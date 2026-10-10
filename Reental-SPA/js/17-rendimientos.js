/* =====================================================================
   REENTAL SPA · js/17-rendimientos.js
   La pestaña «💰 Rendimientos» (#view-rendimientos): una fila por reparto del archivo de Reental, como la pestaña «Movimientos»
   de Reentax. 📒 Transacciones dice qué ha pasado en tu wallet; esta dice
   cuánto te ha repartido Reental y qué te falta por reclamar (también los
   pendientes, que no son movimientos en la blockchain).

   - Columnas: Reparto (fecha) · Cobro (la de la transferencia casada) ·
     Inmueble · Periodo · Íntegro · Retención · Reclamado (neto) ·
     Reinvertido · Pendiente · Estado · Tx · ✏️. En cada fila, íntegro =
     retención + reclamado + reinvertido + pendiente. Cifras con 2
     decimales y la exacta en la ayuda; un 0 sale «–».
   - Las cifras son las del archivo con tus decisiones de 🔍 Revisión,
     con las mismas reglas que el 📊 Dashboard (dashRendimientosResumen de
     js/16): una fila cuyo registro ya no es un rendimiento no sale (se
     cuenta en el recuento) y, si un ajuste cambió el íntegro, la
     retención, la fecha o el inmueble, mandan los del registro.
   - Estado: Reinvertido, Reclamado, Pendiente (ni reclamado ni
     reinvertido), Parcial (reclamado o reinvertido en parte: el resto
     sigue pendiente) y Mixto (parte reinvertida y parte reclamada).
   - Arriba, el total de lo que se ve en una tarjeta (también en la fila
     de abajo) y lo pendiente de reclamar de todo el archivo (para no
     olvidar la parte pendiente de un reclamo parcial).
   - Filtros por ejercicio (año del reparto), estado e inmueble, y
     búsqueda por inmueble, periodo, hash o nota.
   - «✏️ Nota»: la misma nota personal que en 📒 Transacciones (bloque
     notas_personales de la cache, por la clave del rendimiento), escrita
     en una fila justo debajo (Intro guarda, Esc cancela). Nunca cambia la
     clasificación.
   - Las mismas reglas visuales que 📒 Transacciones: sin líneas
     verticales, todo centrado en vertical, cifras a la derecha, texto a
     la izquierda y centrado lo que mide igual (fechas, estado, botones).

   No modifica ningún otro módulo: usa, sin tocarlas, funciones de js/02,
   js/14 (clavesRendimientosCsv), js/15 (cc*), js/16
   (dashFaltanDecisiones) y js/18 (tx*: cifras, burbujas y notas), y el
   guardado de js/05 (marcarCacheDirty + autoGuardarCache). Carga después
   de js/18. Solo repinta si la vista está visible, y siempre al entrar
   en #rendimientos. Las funciones puras (sin DOM ni state) van primero y
   se prueban en Node.
   ===================================================================== */

/* ----------------------------- Cálculo (puro) ----------------------------- */

const RD_N_COLUMNAS = 12;
/* Estados, en el orden del selector. */
const RD_ESTADOS = ["Reinvertido", "Reclamado", "Parcial", "Mixto", "Pendiente"];

/* Periodo de la fila: lo que va detrás de «#» en la columna dividend
   («Madrid #3/2025» → «3/2025»); vacío si no lo hay. */
function rdPeriodo(dividend) {
  const s = typeof dividend === "string" ? dividend : "";
  const i = s.indexOf("#");
  return i < 0 ? "" : s.slice(i + 1).trim();
}

/* Estado de un reparto por sus partes (r = reinvertido, c = reclamado
   neto, pendiente ya calculado), como la subcategoría del motor (js/14
   emitirRendimientoCsv): con las dos partes, Mixto; sin ninguna,
   Pendiente (también si todo es retención). Reclamado o
   reinvertido solo en parte, Parcial. */
function rdEstado(r, c, pendiente) {
  if (r > 0 && c > 0) return "Mixto";
  if (!(r > 0) && !(c > 0)) return "Pendiente";
  if (pendiente > 0) return "Parcial";
  return c > 0 ? "Reclamado" : "Reinvertido";
}

/* Fecha («AAAA-MM-DD») en que llegó el cobro de un pendiente, si el motor
   lo sabe (nota «ya cobrado el …» de pendientesYaCobrados, js/14); null
   si no. */
function rdYaCobrado(reg) {
  const m = reg && typeof reg.nota === "string" ? /ya cobrado el (\d{4}-\d{2}-\d{2})/.exec(reg.nota) : null;
  return m ? m[1] : null;
}

/* Una fila por reparto del archivo (filasCsv) con tus decisiones
   (registros, o null si aún no se ha clasificado), con las reglas del
   Dashboard (dashRepartos de js/16: las mismas cifras siempre); una
   fila con todo a 0 no es un reparto y no sale. Devuelve { filas,
   sinContar, fueraArchivo }. */
function rdRepartos(filasCsv, registros) {
  const { repartos, sinContar, claves } = dashRepartos(filasCsv, registros);
  const filas = repartos.filter(x => x.reparto).map(x => Object.assign({}, x, {
    linea: x.fila.linea_csv,
    cobro: x.reg && dashFechaValida(x.reg.fecha_cobro) ? String(x.reg.fecha_cobro) : null,
    periodo: rdPeriodo(x.fila.periodo_fiscal), dividend: String(x.fila.periodo_fiscal || ""),
    estado: rdEstado(x.reinvertido, x.reclamado, x.pendiente),
    hashes: Array.isArray(x.fila.hashes) ? x.fila.hashes.filter(h => typeof h === "string" && h) : [],
    revisar: !!(x.reg && x.reg.revisar),
    // Un pendiente cuyo cobro ya llegó (la nota que le pone
    // pendientesYaCobrados de js/14): no queda nada por reclamar.
    yaCobrado: rdYaCobrado(x.reg),
  }));
  // Los rendimientos del libro que no vienen de una fila del
  // archivo no salen aquí; el aviso, con la regla del Dashboard.
  return { filas: rdOrdenar(filas), sinContar, fueraArchivo: dashFueraArchivo(registros, claves) };
}

/* Los más recientes primero (como 📒 Transacciones); en el mismo día, por
   inmueble; los que no tienen fecha, al final. */
function rdOrdenar(filas) {
  const nombre = new Map(filas.map(f => [f, normalizarNombreInmueble(f.inmueble)]));
  return filas.slice().sort((a, b) =>
    (a.fecha ? 0 : 1) - (b.fecha ? 0 : 1) ||
    cmpTexto(b.fecha || "", a.fecha || "") ||
    cmpTexto(nombre.get(a), nombre.get(b)) ||
    a.linea - b.linea);
}

/* Lo que se ve en los selectores: ejercicios (de más reciente a más
   antiguo), estados (en su orden, con su número) e inmuebles (un mismo inmueble escrito
   de varias formas, una vez). */
function rdOpciones(filas) {
  const ejercicios = [...new Set(filas.map(txEjercicio).filter(Boolean))].sort((a, b) => cmpTexto(b, a));
  const n = {};
  for (const f of filas) n[f.estado] = (n[f.estado] || 0) + 1;
  const estados = RD_ESTADOS.filter(e => n[e]).map(e => ({ e, n: n[e] }));
  const inmuebles = new Map();
  for (const f of filas) {
    const k = normalizarNombreInmueble(f.inmueble);
    if (k && !inmuebles.has(k)) inmuebles.set(k, f.inmueble);
  }
  return { ejercicios, estados,
    inmuebles: [...inmuebles.entries()].sort((a, b) => cmpTexto(a[0], b[0])).map(([k, nombre]) => ({ k, nombre })) };
}

/* ¿Pasa la fila los filtros? f = { ejercicio, estado, inmueble (nombre
   normalizado), q, notas }. */
function rdPasaFiltros(fila, f) {
  if (f.ejercicio && txEjercicio(fila) !== f.ejercicio) return false;
  if (f.estado && fila.estado !== f.estado) return false;
  if (f.inmueble && normalizarNombreInmueble(fila.inmueble) !== f.inmueble) return false;
  // Sin distinguir mayúsculas ni tildes («caceres» encuentra «Cáceres»).
  const q = normalizarNombreInmueble(String(f.q || ""));
  if (q) {
    const texto = normalizarNombreInmueble([fila.inmueble, fila.dividend, ...fila.hashes, txTextoNota(f.notas, fila.clave)].join(" "));
    if (!texto.includes(q)) return false;
  }
  return true;
}

/* Sumas de unas filas (las que se ven), redondeadas como el Dashboard. */
const RD_IMPORTES = ["integro", "retencion", "reclamado", "reinvertido", "pendiente"];
const RD_CLASE_IMPORTE = { integro: "rd-integro", retencion: "rd-ret", reclamado: "rd-recl",
                           reinvertido: "rd-reinv", pendiente: "rd-pend" };
const rdCeldasImportes = x => RD_IMPORTES.map(k => rdCeldaImporte(x[k], RD_CLASE_IMPORTE[k])).join("");
function rdSumas(filas) {
  const s = Object.fromEntries(RD_IMPORTES.map(k => [k, 0]));
  for (const f of filas) for (const k of RD_IMPORTES) s[k] += f[k];
  for (const k of RD_IMPORTES) s[k] = red6(s[k]);
  return s;
}

/* Lo que queda por reclamar: { n repartos, total }. */
function rdPendiente(filas) {
  const con = filas.filter(f => f.pendiente > 0 && !f.yaCobrado); // sin los ya cobrados
  return { n: con.length, total: red6(con.reduce((t, f) => t + f.pendiente, 0)) };
}

/* «40 repartos» / «12 de 40 repartos». */
function rdTextoRecuento(visibles, total, filtrado) {
  const n = x => numEs(x, 0);
  return (filtrado ? n(visibles) + " de " : "") + n(total) + " " + (total === 1 ? "reparto" : "repartos");
}

/* ----------------------------- HTML (puro) ----------------------------- */

/* Cifra de un importe: 2 decimales y la exacta en la ayuda; un 0, «–». */
function rdCeldaImporte(v, clase) {
  if (!v) return '<td class="num ' + clase + ' rd-cero" title="0">–</td>';
  return '<td class="num ' + clase + '" title="' + ccEsc(txCifraExacta(v) + " USD") + '">' + ccEsc(txCifra(v)) + "</td>";
}

const RD_CLASE_ESTADO = { Reinvertido: "rd-e-reinv", Reclamado: "rd-e-recl", Pendiente: "rd-e-pend",
                          Parcial: "rd-e-pend", Mixto: "rd-e-mixto" };

/* Fila de un reparto. opts = { notaPersonal, editandoNota }. */
function rdHtmlFila(fila, opts = {}) {
  const clave = ccEsc(fila.clave);
  const notaP = String(opts.notaPersonal || "");
  let h = '<tr class="rd-fila' + (fila.revisar ? " rd-revisar" : "") + (notaP || opts.editandoNota ? " rd-con-notap" : "") +
    '" data-clave="' + clave + '">';
  h += '<td class="rd-fecha" title="' + ccEsc(fechaDosHoras(fila.fechaHora || fila.fecha)) + '">' + ccEsc(txFechaCorta(fila.fecha)) + "</td>";
  h += fila.cobro
    ? '<td class="rd-fecha" title="' + ccEsc(fechaDosHoras(fila.cobro)) + '">' + ccEsc(txFechaCorta(fila.cobro)) + "</td>"
    : '<td class="rd-fecha rd-cero">–</td>';
  h += '<td class="rd-inmueble">' + ccEsc(fila.inmueble ? fila.inmueble.replace(/\s+(\d+)$/, " $1") : "—") + "</td>";
  h += '<td class="rd-periodo">' + ccEsc(fila.periodo || "—") + "</td>";
  h += rdCeldasImportes(fila);
  h += '<td class="rd-celestado">' + (fila.estado
    ? '<span class="rd-estado ' + (RD_CLASE_ESTADO[fila.estado]) + '">' + ccEsc(fila.estado) + "</span>" : "—") +
    (fila.revisar ? ' <span class="tx-marca-rev" title="A revisar">🔍</span>' : "") +
    (fila.yaCobrado ? ' <span class="rd-aviso" title="' + ccEsc("Ya cobrado el " + fechaEs(fila.yaCobrado) +
      ": carga un archivo de Reental más nuevo") + '">⚠</span>' : "") +
    (fila.excedida ? ' <span class="rd-aviso" title="Suma más que su íntegro">⚠</span>' : "") + "</td>";
  h += '<td class="rd-hash">' + (fila.hashes.length
    ? fila.hashes.map((x, i) => '<a class="mono' + (i ? " rd-hash-mas" : "") + '" href="' + ccUrlTx(x) +
        '" target="_blank" rel="noopener" title="' + ccEsc(x + " · ver en Polygonscan") + '">' + ccEsc(txHashCorto(x)) + " ↗</a>").join("")
    : '<span class="rd-cero">–</span>') + "</td>";
  const expandida = ' aria-expanded="' + (opts.editandoNota ? "true" : "false") + '"';
  const datos = ' data-accion="nota" data-clave="' + clave + '"' + expandida;
  h += '<td class="rd-acciones">' + (notaP
    ? txBotonIcono("✏️", "Tu nota", notaP, datos, "tx-con-nota")
    : txBotonIcono("✏️", "Añadir una nota", "", datos)) + "</td>";
  return h + "</tr>";
}

/* Fila de la nota, justo debajo de la suya (como en 📒 Transacciones): la
   nota en cursiva o, si se está escribiendo, el editor. Vacío si no hay
   nota ni se está editando. */
function rdHtmlFilaNota(fila, notaP, editando, borrador) {
  const nota = String(notaP || "");
  if (!nota && !editando) return "";
  const clave = ccEsc(fila.clave);
  const inicio = '<tr class="rd-fila-nota" data-clave="' + clave + '"><td colspan="' + RD_N_COLUMNAS +
    '"><div class="tx-nota-caja">';
  if (!editando) {
    return inicio + '<span class="tx-notap" title="' + ccEsc("Tu nota: " + nota) + '"><span aria-hidden="true">📝 </span>' +
      '<span class="tx-notap-texto">' + ccEsc(nota) + "</span></span></div></td></tr>";
  }
  const valor = String(borrador ?? nota);
  return inicio + '<div class="tx-nota-editor">' +
    '<textarea class="rd-nota-texto" rows="2" maxlength="' + TX_NOTA_MAX + '" data-clave="' + clave +
      '" aria-label="' + ccEsc("Tu nota para " + (fila.inmueble || "el reparto") + " " + (fila.periodo || "") +
      ". Intro guarda, Escape cancela.") + '">' + ccEsc(valor) + "</textarea>" +
    '<div class="tx-nota-pie"><span class="help">Intro guarda · Esc cancela</span>' +
      '<button type="button" class="tx-accion primary" data-accion="nota-guardar" data-clave="' + clave + '">💾 Guardar</button>' +
      (nota ? '<button type="button" class="tx-accion" data-accion="nota-borrar" data-clave="' + clave + '">✕ Borrar</button>' : "") +
      '<button type="button" class="tx-accion" data-accion="nota-cancelar" data-clave="' + clave + '">Cancelar</button>' +
    "</div></div></div></td></tr>";
}

/* Tarjeta del total de lo que se ve, encima de la tabla: las mismas
   cifras que la fila del total, en casillas iguales que llenan el ancho,
   como las de 🧾 Fiscal. */
const RD_NOMBRE_IMPORTE = { integro: "Íntegro", retencion: "Retención", reclamado: "Reclamado (neto)",
                            reinvertido: "Reinvertido", pendiente: "Pendiente" };
function rdHtmlTarjetaTotal(sumas) {
  return RD_IMPORTES.map(k => '<div class="rd-tt-dato" title="' + ccEsc(txCifraExacta(sumas[k]) + " USD") + '"><div class="rd-tt-k">' + ccEsc(RD_NOMBRE_IMPORTE[k]) +
    '</div><div class="rd-tt-v">' + ccEsc(txCifra(sumas[k])) + "&nbsp;USD</div></div>").join("");
}

/* Fila del total de lo que se ve. */
function rdHtmlTotal(sumas) {
  return '<tr class="rd-total"><td colspan="4">Total</td>' +
    rdCeldasImportes(sumas) + '<td colspan="3"></td></tr>';
}

/* Avisos bajo el recuento (los mismos que la tarjeta del Dashboard). */
function rdHtmlAvisos(datos, faltanDecisiones) {
  const avisos = [];
  if (faltanDecisiones) avisos.push("Aún sin tus decisiones de Revisión: completa 🚀 Puesta en marcha.");
  const fuera = datos.fueraArchivo;
  if (fuera.n) {
    avisos.push((fuera.n === 1 ? "1 rendimiento que no está" : fuera.n + " rendimientos que no están") +
      " en el archivo de Reental (" + numEs(fuera.total) + " USD) no " + (fuera.n === 1 ? "sale" : "salen") + " aquí.");
  }
  const excedidas = datos.filas.filter(f => f.excedida).length;
  if (excedidas) avisos.push(excedidas === 1 ? "1 reparto suma más que su íntegro." : excedidas + " repartos suman más que su íntegro.");
  return avisos.map(a => '<p class="rd-nota-aviso">⚠ ' + ccEsc(a) + "</p>").join("");
}

/* ----------------------------- Estado de la vista (DOM) ----------------------------- */

const RD_IDS_SELECTS = ["rdFiltroEjercicio", "rdFiltroEstado", "rdFiltroInmueble"];
let rdFilasVistas = []; // las del último repintado (para la nota)
/* Los repartos con tus decisiones, calculados en cada repintado entero
   (cambio de datos o al entrar en la pestaña): los filtros, la búsqueda y
   la nota pintan desde ellos, sin rehacerlos. */
let rdDatosVistos = null;

function rdVistaVisible() {
  const v = document.getElementById("view-rendimientos");
  return !!(v && v.classList.contains("active"));
}

/* La clasificación de la sesión, o null si aún no la hay. */
function rdRegistros() {
  return Array.isArray(state.registros) && state.registros.length ? state.registros : null;
}

function rdDatos() {
  const csvOk = !!(state.csvCargado && Array.isArray(state.filasCsv) && state.filasCsv.length);
  return csvOk ? rdRepartos(state.filasCsv, rdRegistros()) : null;
}

function rdLeerFiltros() {
  const val = id => { const el = $(id); return el ? el.value : ""; };
  return {
    ejercicio: val("rdFiltroEjercicio"),
    estado: val("rdFiltroEstado"),
    inmueble: val("rdFiltroInmueble"),
    q: val("rdBuscar"),
    notas: (state.cache && state.cache.notas_personales) || null,
  };
}

function rdVaciarFiltros() {
  for (const id of RD_IDS_SELECTS.concat(["rdBuscar"])) { const el = $(id); if (el) el.value = ""; }
}

function rdHtmlFilaVacia(texto) {
  return '<tr><td colspan="' + RD_N_COLUMNAS + '" class="tx-vacio">' + texto + "</td></tr>";
}

/* Pinta lo que depende de los filtros (tabla, total, recuento y avisos):
   la búsqueda repinta sin rehacer los selectores ni perder el foco. */
function rdPintarCuerpo(datos) {
  const cuerpo = $("rdCuerpo"), pie = $("rdTotal"), rec = $("rdRecuento"), pend = $("rdPendiente"), av = $("rdAvisos");
  const tarjeta = $("rdTarjetaTotal");
  if (!cuerpo) return;
  const pintarTotal = sumas => {
    if (pie) pie.innerHTML = sumas ? rdHtmlTotal(sumas) : "";
    if (tarjeta) { tarjeta.innerHTML = sumas ? rdHtmlTarjetaTotal(sumas) : ""; tarjeta.hidden = !sumas; }
  };
  const limpiar = () => {
    pintarTotal(null);
    if (rec) rec.textContent = "";
    if (av) av.innerHTML = "";
    if (pend) { pend.textContent = ""; pend.hidden = true; }
    rdFilasVistas = [];
  };
  if (!datos) {
    limpiar();
    cuerpo.innerHTML = rdHtmlFilaVacia('Sin archivo de rendimientos: cárgalo en <a href="#inicio">🚀 Puesta en marcha</a>.');
    return;
  }
  const faltan = dashFaltanDecisiones(state.cache || null, rdRegistros());
  if (!datos.filas.length) {
    limpiar();
    if (av) av.innerHTML = rdHtmlAvisos(datos, faltan);
    cuerpo.innerHTML = rdHtmlFilaVacia(ccEsc(datos.sinContar
      ? (datos.sinContar === 1 ? "El reparto queda fuera por tus decisiones." : "Los " + datos.sinContar + " repartos quedan fuera por tus decisiones.")
      : "El archivo no trae nada repartido."));
    return;
  }
  const f = rdLeerFiltros();
  const visibles = datos.filas.filter(x => rdPasaFiltros(x, f));
  rdFilasVistas = visibles;
  // El número de cada estado, con los demás filtros aplicados.
  const sel = $("rdFiltroEstado");
  if (sel) {
    const sinEstado = Object.assign({}, f, { estado: "" });
    const n = {};
    for (const x of datos.filas) if (rdPasaFiltros(x, sinEstado)) n[x.estado] = (n[x.estado] || 0) + 1;
    for (const o of sel.options) if (o.value) o.textContent = o.value + " (" + (n[o.value] || 0) + ")";
  }
  const cursor = rdNota.cursor(); // si se estaba escribiendo la nota, vuelve a ella
  const ed = rdNota.actual();
  cuerpo.innerHTML = visibles.length
    ? visibles.map(x => {
        const notaP = txTextoNota(f.notas, x.clave);
        const editando = !!(ed && ed.clave === x.clave);
        return rdHtmlFila(x, { notaPersonal: notaP, editandoNota: editando }) +
          rdHtmlFilaNota(x, notaP, editando, editando ? ed.borrador : null);
      }).join("")
    : rdHtmlFilaVacia("Ningún reparto con estos filtros.");
  rdNota.restaurar(cursor);
  pintarTotal(visibles.length ? rdSumas(visibles) : null);
  const filtrado = !!(f.ejercicio || f.estado || f.inmueble || txHayBusqueda(f.q));
  if (rec) {
    rec.textContent = rdTextoRecuento(visibles.length, datos.filas.length, filtrado) +
      (datos.sinContar ? " · " + datos.sinContar + " fuera por tus decisiones" : "");
  }
  if (pend) {
    const p = rdPendiente(datos.filas);
    pend.textContent = p.n ? "⏳ Pendiente de reclamar: " + numEs(p.total) + " USD en " + p.n + (p.n === 1 ? " reparto." : " repartos.") : "";
    pend.hidden = !p.n;
  }
  if (av) av.innerHTML = rdHtmlAvisos(datos, faltan);
}

function renderRendimientos() {
  if (typeof document === "undefined" || !$("rdCuerpo")) return;
  ccInyectarEstilos(); // burbujas de js/15
  txInyectarEstilos(); // iconos, burbujas y nota de js/18
  rdInyectarEstilos();
  const datos = rdDatosVistos = rdDatos();
  const op = rdOpciones(datos ? datos.filas : []);
  /* Cada selector, sin perder lo elegido si sigue existiendo. El número de
     cada estado lo pone rdPintarCuerpo, con los demás filtros. */
  const rellenar = (id, valores, etiquetar) => txRellenarSelect(id, valores, ($(id) || {}).value || "", "Todos", etiquetar);
  rellenar("rdFiltroEjercicio", op.ejercicios);
  rellenar("rdFiltroEstado", op.estados.map(x => x.e));
  const nombre = new Map(op.inmuebles.map(i => [i.k, i.nombre]));
  rellenar("rdFiltroInmueble", op.inmuebles.map(i => i.k), k => nombre.get(k));
  rdPintarCuerpo(datos);
}

/* Solo se pinta si la vista está visible; `forzar` pinta aunque no lo
   esté (al entrar en #rendimientos, este aviso llega antes que el de
   js/13, que es quien marca la vista como activa). */
function rdRenderSeguro(forzar) {
  try {
    if (forzar || rdVistaVisible()) renderRendimientos();
  } catch (e) { console.error("Rendimientos (js/17-rendimientos.js):", e); }
}
function rdPintarCuerpoSeguro() {
  try { rdPintarCuerpo(rdDatosVistos); }
  catch (e) { console.error("Rendimientos (js/17-rendimientos.js):", e); }
}

/* ----------------------------- Nota personal -----------------------------
   El editor de 📒 Transacciones (txEditorNota de js/18), con las
   filas de esta pestaña: solo se abre la nota de una fila que se ve. */
const rdNota = txEditorNota({
  cuerpo: "rdCuerpo", clase: "rd-nota-texto", buscar: "rdBuscar", otra: "📒 Transacciones",
  repintar: () => rdPintarCuerpoSeguro(),
  existe: clave => rdFilasVistas.some(x => x.clave === clave),
});

/* ----------------------------- Estilos (inyectados una vez) -----------------------------
   Las reglas de 📒 Transacciones, con espacio de nombres rd-*: sin
   líneas verticales, las horizontales claras, todo centrado en vertical,
   cifras a la derecha. Solo colores del design system (el modo oscuro no
   necesita repintar). */
function rdInyectarEstilos() {
  if (typeof document === "undefined" || $("estiloRendimientos17")) return;
  const estilo = document.createElement("style");
  estilo.id = "estiloRendimientos17";
  estilo.textContent = [
    ".rd-buscar{flex:1 1 220px}",
    /* Columnas siempre iguales (con flex, la quinta bajaría sola a otra
       fila y se estiraría); las cinco en una fila
       desde unos 640 px de ancho. Una cifra que no cabe se corta con «…» y
       la exacta sigue en su burbuja. */
    ".rd-tarjeta{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:4px 0 10px}",
    ".rd-tt-dato{background:var(--tarjeta);border:1px solid var(--border);border-radius:12px;padding:10px 15px;min-width:0}",
    ".rd-tarjeta[hidden]{display:none}",
    ".rd-tt-k{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--faint)}",
    ".rd-tt-v{font-size:18px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".rd-pendiente{margin:2px 0 4px;color:var(--warn);font-weight:600}",
    ".rd-nota-aviso{font-size:13px;color:var(--warn);margin:2px 0}",
    ".rd-tablawrap{overflow-x:auto;border-radius:10px;position:relative}",
    /* Lo común con 📒 Transacciones, en la clase tabla-libro de index.html. */
    "#rdTabla th{line-height:1.2}",
    "#rdTabla .rd-centro,#rdTabla .rd-fecha,#rdTabla .rd-celestado,#rdTabla .rd-acciones{text-align:center}",
    "#rdTabla .rd-fecha{font-variant-numeric:tabular-nums}",
    "#rdTabla th .rd-sub{display:block;font-weight:400;font-size:11.5px;text-transform:none;letter-spacing:normal;color:var(--muted)}",
    "#rdTabla td.rd-inmueble{white-space:normal;font-weight:600;min-width:9em}",
    "#rdTabla td.num{min-width:72px}",
    "#rdTabla .rd-cero{color:var(--faint)}",
    "#rdTabla tbody tr:hover,#rdTabla tbody tr.rd-fila:hover+tr.rd-fila-nota{background:var(--panel2)}",
    "#rdTabla tr.rd-revisar{background:var(--warn-bg)}",
    "#rdTabla tr.rd-con-notap>td{border-bottom:0}",
    "#rdTabla tr.rd-fila-nota>td{padding:0 6px 9px;white-space:normal}",
    "#rdTabla tfoot td{font-weight:700;border-bottom:0;border-top:1px solid var(--border2)}",
    "#rdTabla .rd-hash a{display:block}",
    "#rdTabla .rd-hash a.rd-hash-mas{font-size:11.5px;color:var(--muted)}",
    ".rd-estado{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:700;border:1px solid var(--border);background:var(--chip);color:var(--muted)}",
    ".rd-e-reinv{background:var(--ok-bg);border-color:var(--ok-bd);color:var(--ok)}",
    ".rd-e-recl{background:var(--info-bg);border-color:var(--info-bd);color:var(--info)}",
    ".rd-e-pend{background:var(--warn-bg);border-color:var(--warn-bd);color:var(--warn)}",
    ".rd-e-mixto{background:var(--err-bg);border-color:var(--err-bd);color:var(--err)}",
    ".rd-aviso{color:var(--warn);cursor:help}",
    ".rd-nota-texto{flex:1 1 360px;max-width:640px;width:auto;font-size:13px;padding:7px 10px;resize:vertical}",
  ].join("\n");
  document.head.appendChild(estilo);
}

/* ----------------------------- Eventos ----------------------------- */

function rdMontarEventos() {
  const escuchar = txEscuchar; // una sola vez por elemento y tipo
  for (const id of RD_IDS_SELECTS) escuchar(id, "change", () => rdPintarCuerpoSeguro());
  let temporizador = null; // la búsqueda espera 150 ms a que dejes de escribir
  escuchar("rdBuscar", "input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(rdPintarCuerpoSeguro, 150);
  });
  escuchar("rdLimpiar", "click", () => { rdVaciarFiltros(); rdPintarCuerpoSeguro(); });
  /* Editor de la nota: Intro guarda (Mayús+Intro, salto de línea), Esc
     cancela; lo escrito se recuerda por si la tabla se repinta. */
  escuchar("rdCuerpo", "keydown", e => rdNota.teclas(e));
  escuchar("rdCuerpo", "input", e => rdNota.apuntar(e));
  escuchar("rdCuerpo", "click", e => {
    const btn = txBotonDe(e, "[data-accion]");
    if (btn) rdNota.accion(btn.getAttribute("data-accion"), btn.getAttribute("data-clave"));
  });
}

/* ----------------------------- Repintado -----------------------------
   Como js/16 y js/18: envoltorios que AÑADEN el repintado detrás de las
   funciones globales que avisan de cambios de datos (carga de la cache o
   del archivo, sincronización y clasificación), más hashchange al entrar
   en #rendimientos. Si la función original lanza, el error se propaga
   exactamente igual. */
(function montarHooksRendimientos() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function envolver(nombre) {
    const original = window[nombre];
    if (typeof original !== "function" || original.__rdEnvuelta) return;
    const envoltura = function () {
      const resultado = original.apply(this, arguments);
      rdRenderSeguro(false);
      return resultado;
    };
    envoltura.__rdEnvuelta = true;
    window[nombre] = envoltura;
  }
  ["renderPanel", "actualizarChipEstado", "ejecutarClasificacion"].forEach(envolver);

  window.addEventListener("hashchange", () => {
    if (location.hash === "#rendimientos") rdRenderSeguro(true);
  });

  rdMontarEventos();
  rdRenderSeguro(true); // el DOM ya existe: los scripts van al final del <body>
})();
