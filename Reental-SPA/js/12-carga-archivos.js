/* =====================================================================
   REENTAL SPA · js/12-carga-archivos.js
   Carga de archivos del usuario: archivo de rendimientos y montaje de las
   dropzones.
   La app trabaja con cache + CSV; no carga `reental_datos.json`. La
   especificación `docs/especificaciones/spec_reental_datos_Fase 7.md` es
   el contrato de EXPORTACIÓN.
   El CSV se aplica desde su TEXTO (`aplicarCsvTexto`), así sirve igual para
   el archivo que eliges y para el que el navegador recuerda de tu última
   visita. Tras cargarlo avisa a js/19 (`arrTrasCargarCsv`), que borra la
   clasificación anterior, lo recuerda y clasifica solo.
   El archivo de rendimientos se guarda DENTRO de la cache
   («archivo_rendimientos», js/05). Con la cache abierta, el que cargas la
   sustituye; sin ella, se queda en memoria (`state.csvArchivo`) y entra al
   abrirla o crearla (`cargarCsvDeLaCache`). Uno más antiguo que el que ya
   tienes se pregunta antes.
   ===================================================================== */

/* La última fecha de reparto («AAAA-MM-DD») de unas filas, o "". */
function csvUltimaFecha(filas) {
  return (filas || []).map(f => fmtFecha(enHoraEspanola(f.fecha_reparto))).filter(Boolean).sort().pop() || "";
}
/* ¿Es `nuevas` más antiguo que `actuales`? Termina antes o trae menos repartos. */
function csvMasViejo(nuevas, actuales) {
  return csvUltimaFecha(nuevas) < csvUltimaFecha(actuales) || nuevas.length < actuales.length;
}
/* La pregunta antes de usar un archivo más antiguo (si termina después
   pero trae menos repartos, no se dice «más antiguo»). */
function csvPreguntaMasViejo(nuevas, actuales, quien) {
  const motivo = csvUltimaFecha(nuevas) < csvUltimaFecha(actuales)
    ? " es más antiguo que el que ya tienes (hasta " + fechaEs(csvUltimaFecha(actuales)) + ")."
    : " trae menos repartos (" + numEs(nuevas.length, 0) + ") que el que ya tienes (" + numEs(actuales.length, 0) + ").";
  return quien + motivo + " ¿Usarlo igualmente?";
}
/* ¿Es `a` más nuevo que `b`? Termina después o, el mismo día, trae más repartos. */
function csvMasNuevo(a, b) {
  const fa = csvUltimaFecha(a), fb = csvUltimaFecha(b);
  return fa > fb || (fa === fb && a.length > b.length);
}
/* Frente al archivo que ya tenías, cuántos repartos de
   `nuevas` no estaban, cuántos cambiaron (otra fecha o importes, como al
   cobrar uno que estaba por cobrar) y cuántos ya no vienen. Un reparto es
   su periodo y su wallet (columnas «dividend» y «wallet»).
   Si alguno de los dos archivos no trae la wallet (los antiguos), solo el
   periodo. Sin los hashes, que dependen de las columnas que traiga el
   archivo y de su orden. Primero se apartan los
   que no cambiaron; los que quedan con la misma clave son los actualizados. */
function csvComparar(nuevas, actuales) {
  const conWallet = nuevas.every(f => f.wallet) && actuales.every(f => f.wallet);
  const clave = f => f.periodo_fiscal + (conWallet ? "|" + f.wallet : "");
  const huella = f => [f.fecha_reparto, f.distributed, f.retained, f.reinvested, f.claimed].join("|");
  const antes = new Map();
  for (const f of actuales) {
    const k = clave(f);
    (antes.get(k) || antes.set(k, []).get(k)).push(huella(f));
  }
  const cambiadas = nuevas.filter(f => {
    const lista = antes.get(clave(f)), i = lista ? lista.indexOf(huella(f)) : -1;
    if (i >= 0) lista.splice(i, 1);
    return i < 0;
  });
  let nuevos = 0, actualizados = 0;
  for (const f of cambiadas) {
    const lista = antes.get(clave(f));
    if (lista && lista.length) { lista.pop(); actualizados++; } else nuevos++;
  }
  let quitados = 0;
  for (const lista of antes.values()) quitados += lista.length;
  return { nuevos, actualizados, quitados };
}
/* El aviso al cargarlo: «…: 125 repartos (3 nuevos, 1 actualizado).» */
function csvTextoCargado(n, comp) {
  const cuantos = (x, uno, varios) => numEs(x, 0) + " " + (x === 1 ? uno : varios);
  let texto = "Archivo de rendimientos cargado: " + cuantos(n, "reparto", "repartos");
  if (comp) {
    const partes = [comp.nuevos ? cuantos(comp.nuevos, "nuevo", "nuevos") : "ninguno nuevo"];
    if (comp.actualizados) partes.push(cuantos(comp.actualizados, "actualizado", "actualizados"));
    if (comp.quitados) partes.push(numEs(comp.quitados, 0) + " que ya no trae");
    texto += " (" + partes.join(", ") + ")";
  }
  return texto + ".";
}
/* Las filas del archivo que tienes: el de dentro de la cache o, si no
   trae, el cargado. null si no hay ninguno. */
function csvFilasActuales() {
  const dentro = state.cache && leerArchivoRendimientosCache(state.cache);
  const res = dentro ? cargarCsvRendimientos(dentro.texto) : null;
  if (res && !res.error && res.filas.length) return res.filas;
  return state.csvCargado ? state.filasCsv : null;
}

/* El archivo cargado entra en la cache abierta (si no es ya el mismo) y se
   guarda. */
async function csvALaCache() {
  const a = state.csvArchivo, dentro = state.cache && leerArchivoRendimientosCache(state.cache);
  if (!state.cache || !a) return false;
  if (dentro && dentro.texto === a.texto) { a.deArchivo = true; return false; }
  ponerArchivoRendimientosCache(state.cache, a.nombre, a.texto);
  a.deArchivo = true;
  marcarCacheDirty();
  await autoGuardarCache();
  return true;
}

/* Al abrir o crear una cache: si trae archivo de rendimientos, manda el de
   dentro; si no, el cargado antes entra en ella. Si están los dos y el de
   fuera es más nuevo, gana el de fuera. Devuelve qué pasó: "ninguno",
   "dentro" (se aplicó el de la cache), "fuera" (el cargado entra en la
   cache) o "fuera_mas_nuevo" (el cargado sustituye al de dentro). Con
   "fuera…", la cache cambió: quien llama la marca por guardar.
   El «de fuera» es solo el cargado sin archivo abierto (o el que
   recordaba el navegador); el de otro archivo abierto antes (`deArchivo`)
   se olvida, no entra en este. Uno de fuera más reciente
   pero con menos repartos se pregunta, como al cargarlo. */
function cargarCsvDeLaCache(cache) {
  let dentro = leerArchivoRendimientosCache(cache);
  if (state.csvArchivo && state.csvArchivo.deArchivo) {
    state.filasCsv = []; state.indicePorHash = {}; state.csvCargado = false; state.csvArchivo = undefined;
  }
  const fuera = state.csvCargado && state.csvArchivo ? state.csvArchivo : null;
  if (dentro && fuera && dentro.texto === fuera.texto) return "dentro";
  const leido = dentro && cargarCsvRendimientos(dentro.texto);
  if (leido && (leido.error || !leido.filas.length)) {
    log("  AVISO: el archivo de rendimientos de la cache no se puede leer" + (leido.error ? " (" + leido.error + ")" : "") + ".", "warn");
    dentro = null;
  }
  if (dentro && (!fuera || !csvMasNuevo(state.filasCsv, leido.filas) ||
      (csvMasViejo(state.filasCsv, leido.filas) &&
       !confirm(csvPreguntaMasViejo(state.filasCsv, leido.filas, "El archivo de Reental que cargaste"))))) {
    return aplicarCsvTexto(dentro.texto, "cache", dentro.nombre) ? "dentro" : "ninguno";
  }
  if (!fuera) return "ninguno";
  ponerArchivoRendimientosCache(cache, fuera.nombre, fuera.texto);
  fuera.deArchivo = true;
  return dentro ? "fuera_mas_nuevo" : "fuera";
}

/* Aplica el texto de un Archivo de rendimientos. Devuelve true si se cargó.
   `recordado`: viene del navegador (última visita), con "cache" de tu
   archivo o, con "copia", de una copia que trae su cache (ya avisa
   ella); los tres sin aviso flotante. `nombre`: el del archivo.
   `actuales`: las filas del que ya tenías, para decir cuántos son nuevos. */
function aplicarCsvTexto(texto, recordado, nombre, actuales) {
  const res = cargarCsvRendimientos(texto);
  // Un archivo con solo la cabecera no sustituye al que ya había (si no,
  // borraría la clasificación y el navegador lo recordaría en lugar del
  // bueno).
  if (!res.error && !res.filas.length) res.error = "El archivo de rendimientos no trae ningún reparto.";
  if (res.error) { toast(res.error, "error"); return false; }
  state.filasCsv = res.filas;
  state.indicePorHash = res.indicePorHash;
  state.csvCargado = true;
  // deArchivo: ya está dentro de tu archivo abierto (no entra en otro).
  state.csvArchivo = { nombre: typeof nombre === "string" ? nombre : "", texto, deArchivo: recordado === "cache" };
  const n = state.filasCsv.length;
  if (!recordado) toast(csvTextoCargado(n, actuales ? csvComparar(res.filas, actuales) : null), "ok");
  actualizarChipEstado();
  return true;
}

async function cargarCsv(file) {
  let texto;
  try {
    texto = await file.text();
    // Uno más antiguo que el que ya tienes no lo sustituye sin preguntar.
    const nuevo = cargarCsvRendimientos(texto), actuales = csvFilasActuales();
    if (!nuevo.error && nuevo.filas.length && actuales && csvMasViejo(nuevo.filas, actuales) &&
        !confirm(csvPreguntaMasViejo(nuevo.filas, actuales, "Este archivo"))) return;
    if (!aplicarCsvTexto(texto, false, file.name, actuales)) return;
  } catch (e) {
    return toast("No se pudo leer el archivo de rendimientos: " + e.message, "error");
  }
  await csvALaCache();
  if (typeof arrTrasCargarCsv === "function") await arrTrasCargarCsv(file.name, texto);
}
function montarDropZone(idZona, idInput, manejador) {
  const zona = $(idZona), input = $(idInput);
  zona.addEventListener("click", () => input.click());
  input.addEventListener("change", () => { if (input.files[0]) manejador(input.files[0]); input.value = ""; });
  ["dragover", "dragenter"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("drag"); }));
  zona.addEventListener("drop", e => {
    const f = e.dataTransfer.files[0];
    if (f) manejador(f);
  });
}