/* =====================================================================
   REENTAL SPA · js/20-coste-compras.js
   Coste de las compras por transferencia bancaria: plegable «💶 Coste de las compras bancarias
   (n)» en 🔍 Revisión, cerrado por defecto.

   Qué hace:
   - Lista las compras bancarias del libro (COMPRA con via_compra
     BANCARIA), una por fila y las más recientes primero, como en
     📒 Transacciones: fecha, inmueble,
     tx, tokens, lo pagado en € y el € por token.
   - Lo pagado se ve como texto, con «✏️ Editar» (nada
     editable a la vista hasta que lo pides). Al pulsarlo se abre la
     casilla, con «Guardar» y «Cancelar»; el € por token se recalcula al
     escribir. Intro guarda y Esc cancela.
   - «Guardar» guarda la compra de su fila: el coste se corrige POR
     COMPRA, no por inmueble. Cada
     coste es un ajuste en ajustes_usuario { coste_eur, nota } con la marca
     «Coste puesto por ti (fecha)», que el motor ya aplica: sin
     reglas nuevas. Guardar el valor por defecto (100 € por
     token) también lo guarda: lo confirma como tuyo y el informe deja de
     marcarlo con «**». Sin coste
     tuyo, la fila dice «por defecto».
   - Una compra con una decisión de Revisión («Compra bancaria…» o «Dejar
     como Compra») también se edita aquí: solo se le pone coste_eur y sigue
     deshaciéndose en «Movimientos ya decididos». Lo mismo una mandada a
     revisar por ti.
   - Un ajuste de otro origen (p. ej. uno escrito a mano) nunca
     se pisa: su coste se enseña sin «Editar», con una ⓘ.

   Reglas:
   - Guardado con ccGuardarAjustesDecision de js/15 (marcarCacheDirty +
     autoGuardarCache y reclasificación). Nada de almacenamiento del
     navegador. Nunca se inventan costes: solo se escribe lo que pone el
     usuario.
   - Lo escrito y sin guardar se recuerda entre repintados (cbBorrador):
     una compra está abierta mientras tiene algo en el borrador.
   - Reutiliza utilidades de js/02, js/04, js/14, js/15 (ajustes, formatos,
     guardado) y js/18 (txEsCompraBancaria). Se engancha detrás de
     renderCorrecciones (js/15), sin tocar otros módulos; index.html solo
     aporta el esqueleto.
   - Las funciones puras van primero: tests/test_coste_compras_paso_du2i.js
     las carga en Node con vm.
   ===================================================================== */

/* ----------------------------- Utilidades puras ----------------------------- */

/* Sin emojis: la nota se guarda en la cache y otras herramientas la leen. */
const CB_MARCA_COSTE = CC_MARCA_COSTE; // en js/15: deshacer una decisión la usa
const CB_AYUDA_AJENO = "Ajuste manual: se cambia en «✏️ Ajustes en JSON».";
/* Dos costes son el mismo si difieren en menos de medio céntimo. */
const CB_TOLERANCIA = 0.005;

function cbMismoImporte(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < CB_TOLERANCIA;
}
function cbRedondearCentimos(v) {
  return Math.round(v * 100) / 100;
}

const CB_ORDEN = new Intl.Collator("es");

/* ¿Hay algo escrito para esa compra? */
function cbEscrito(borrador, clave) {
  return !!borrador && Object.prototype.hasOwnProperty.call(borrador, clave);
}

/* Las compras bancarias del libro, las más recientes primero (como
   📒 Transacciones). */
function cbComprasBancarias(registros) {
  return (registros || []).filter(txEsCompraBancaria).sort((a, b) =>
    String(b.fecha || "").localeCompare(String(a.fecha || "")) ||
    CB_ORDEN.compare(String(a.inmueble || ""), String(b.inmueble || "")) ||
    String(a.clave).localeCompare(String(b.clave)));
}

/* Estado de una compra frente a los ajustes: "libre" (sin ajuste),
   "propio" (de este editor), "decision" (decidida en Revisión o mandada a
   revisar por ti: solo se le pone coste_eur) o "ajeno"
   (otro ajuste: no se toca). */
function cbEstadoCoste(reg, ajustes) {
  const h = ccBuscarAjuste(ajustes, reg && reg.clave);
  if (!h) return "libre";
  if (ccEsAjusteCoste(h.ajuste)) return "propio";
  if (ccEsAjusteDecision(h.ajuste) || ccAjusteQuePideRevision(h.ajuste) === "revisar") return "decision";
  return "ajeno";
}

/* ¿Lleva el coste de por defecto (sin coste_eur en su ajuste)? Es lo
   que el informe marca con «**» (la misma regla que js/21). */
function cbSupuesto(reg, ajustes) {
  const h = ccBuscarAjuste(ajustes, reg && reg.clave);
  return !h || !pdEsObjeto(h.ajuste) || !("coste_eur" in h.ajuste);
}

/* El coste que se enseña: el del ajuste si lo tiene; si no, el que pone
   el motor (tokens × precio, el € por token por defecto) o, en una de otro
   origen o sin precio, el del registro. Si guardar no pudo
   reclasificar, el registro aún tiene el viejo. */
function cbCosteVisto(reg, ajustes, precio) {
  const h = ccBuscarAjuste(ajustes, reg && reg.clave);
  const c = h && pdEsObjeto(h.ajuste) ? Number(h.ajuste.coste_eur) : NaN;
  if (ccEsNumeroPositivo(c)) return c;
  const defecto = Number(reg.cantidad) * Number(precio);
  return ccEsNumeroPositivo(defecto) && cbEstadoCoste(reg, ajustes) !== "ajeno" ? defecto : Number(reg.coste_eur);
}

/* Las filas del editor: [{ reg, estado, coste, supuesto }]. */
function cbFilas(registros, ajustes, precio) {
  return cbComprasBancarias(registros).map(reg => ({ reg, estado: cbEstadoCoste(reg, ajustes),
    coste: cbCosteVisto(reg, ajustes, precio), supuesto: cbSupuesto(reg, ajustes) }));
}

/* Lo escrito, leído como número (NaN si está vacío o no se entiende). */
function cbValorEscrito(texto) {
  const t = String(texto).trim();
  return t === "" ? NaN : ccLeerImporte(t);
}

/* Lo escrito que cambia el coste de una compra editable:
   [{ clave, valor }] (valor = número leído, NaN si no se entiende). Con
   soloClave, solo el de esa compra (la pantalla siempre lo pasa; sin él,
   todas: lo usan los tests). */
function cbCambios(registros, ajustes, borrador, soloClave, precio) {
  const cambios = [];
  for (const reg of cbComprasBancarias(registros)) {
    if (soloClave !== undefined && reg.clave !== soloClave) continue;
    if (!cbEscrito(borrador, reg.clave)) continue;
    if (cbEstadoCoste(reg, ajustes) === "ajeno") continue;
    const valor = cbValorEscrito(borrador[reg.clave]);
    // Guardar el de por defecto lo confirma como tuyo (el informe deja de
    // marcarlo con «**»).
    if (cbSupuesto(reg, ajustes) || !cbMismoImporte(valor, cbCosteVisto(reg, ajustes, precio))) cambios.push({ clave: reg.clave, valor });
  }
  return cambios;
}

/* Ajustes NUEVOS con los costes (no muta los recibidos; lanza si un
   importe no es válido o si la compra ya tiene un ajuste de otro origen).
   precio = € por token por defecto (config). */
function cbAjustesConCostes(ajustes, cambios, registros, precio, fechaISO) {
  const copia = Object.assign({}, pdEsObjeto(ajustes) ? ajustes : {});
  const porClave = new Map((registros || []).map(r => [ccClaveAjuste(r.clave), r]));
  for (const { clave, valor } of cambios || []) {
    const k = ccClaveAjuste(clave);
    const reg = porClave.get(k);
    if (!reg || !txEsCompraBancaria(reg)) throw new Error("Compra no encontrada.");
    // Se mira ya redondeado a céntimos (si no, 0,004 € se guardaría como 0).
    const v = ccEsNumeroPositivo(valor) ? cbRedondearCentimos(valor) : NaN;
    if (!ccEsNumeroPositivo(v)) throw new Error("Escribe un importe mayor que 0.");
    const h = ccBuscarAjuste(copia, clave);
    const estado = cbEstadoCoste(reg, copia);
    if (estado === "ajeno") throw new Error("Ya tiene un ajuste manual: se cambia en «✏️ Ajustes en JSON».");
    if (estado === "decision") {
      // El importe se guarda aunque sea el de por defecto (así el informe
      // deja de marcarlo con «**»).
      copia[h.clave] = Object.assign({}, h.ajuste, { coste_eur: v });
      continue;
    }
    if (h) delete copia[h.clave];
    copia[k] = ccAjusteCoste(v, fechaISO);
  }
  return copia;
}

/* € por token de un coste y unos tokens («50,00 €»; por debajo de 1 €,
   con 4 decimales, como el RNT: «0,0300 €»), o «—». */
function cbTextoPorToken(coste, tokens) {
  const c = Number(coste), t = Number(tokens);
  return ccEsNumeroPositivo(c) && ccEsNumeroPositivo(t) ? numEs(c / t, c / t < 1 ? 4 : 2) + " €" : "—";
}

/* ----------------------------- HTML (puro) ----------------------------- */

/* Un botón de la fila: data-cb = editar, guardar o cancelar. */
function cbBoton(accion, clave, texto, desactivado) {
  return '<button type="button" class="cb-accion' + (accion === "guardar" ? " primary" : "") + '" data-cb="' + accion +
    '" data-clave="' + ccEsc(clave) + '"' + (desactivado ? " disabled" : "") + ">" + texto + "</button>";
}

function cbHtmlFila(f, borrador) {
  const r = f.reg;
  const abierta = f.estado !== "ajeno" && cbEscrito(borrador, r.clave);
  const coste = f.coste;
  const guardado = numEs(coste, 2), fecha = ccFechaVer(r);
  // El inmueble o, en el RNT (P11), su símbolo (sin rellenar `inmueble`:
  // 📊 lo contaría como uno).
  const nombre = txActivo(r);
  const texto = abierta ? String(borrador[r.clave]) : guardado;
  const valor = abierta ? cbValorEscrito(texto) : coste;
  let pagado, acciones = "";
  if (f.estado === "ajeno") {
    pagado = '<span class="cb-fijo">' + ccEsc(guardado) + " €</span> " + ccInfo(CB_AYUDA_AJENO) +
      (f.supuesto ? ' <span class="cb-defecto">por defecto</span>' : "");
  } else if (abierta) {
    const cambia = !cbMismoImporte(valor, coste);
    pagado = '<input type="text" inputmode="decimal" class="cb-valor" data-clave="' + ccEsc(r.clave) + '" value="' +
      ccEsc(texto) + '" aria-label="' + ccEsc("Pagado en € · " + nombre + " · " + (fecha || "")) + '"> €';
    acciones = cbBoton("guardar", r.clave, "Guardar", !cambia && !f.supuesto) + cbBoton("cancelar", r.clave, "Cancelar");
  } else {
    // El de por defecto lo dice (en el informe lleva «**»).
    pagado = '<span class="cb-fijo">' + ccEsc(guardado) + " €</span>" +
      (f.supuesto ? ' <span class="cb-defecto">por defecto</span>' : "");
    acciones = cbBoton("editar", r.clave, "✏️ Editar");
  }
  return '<tr class="cb-fila' + (abierta ? " abierta" : "") + '" data-clave="' + ccEsc(r.clave) + '">' +
    "<td>" + ccEsc(fecha || "sin fecha") + "</td>" +
    "<td>" + ccEsc(nombre || "—") + "</td>" +
    "<td>" + ccEnlaceHash(r.hash) + "</td>" +
    '<td class="num">' + ccEsc(ccCantidad(Number(r.cantidad))) + "</td>" +
    '<td class="num">' + pagado + "</td>" +
    '<td class="num cb-por-token">' + ccEsc(cbTextoPorToken(valor, r.cantidad)) + "</td>" +
    '<td class="cb-acciones">' + acciones + "</td></tr>";
}

/* El contenido del plegable. Lo de «100 €/token por defecto» lo dice la
   explicación del apartado, en index.html (aquí no se repite). */
function cbHtmlEditor(filas, borrador) {
  if (!filas.length) return '<p class="help">Sin compras por transferencia bancaria.</p>';
  return '<div class="cb-caja"><table class="cb-tabla"><thead><tr><th>Fecha</th><th>Inmueble</th><th>Tx</th><th class="num">Tokens</th>' +
    '<th class="num">Pagado</th><th class="num">€ por token</th><th></th></tr></thead><tbody>' +
    filas.map(f => cbHtmlFila(f, borrador)).join("") +
    "</tbody></table></div>";
}

/* ----------------------------- Sesión y DOM ----------------------------- */

/* Lo escrito y sin guardar: { clave: texto }. */
let cbBorrador = {};

function cbAjustesSesion() {
  return (state.cache && state.cache.ajustes_usuario) || {};
}
/* € por token por defecto: el de la config o, si no es válido, el fijo de
   js/04 (el mismo número en la cabecera y al ver si se vuelve a él). */
function cbPrecioSesion() {
  const p = Number(state.config && state.config.compra_bancaria_coste_eur_por_token);
  return ccEsNumeroPositivo(p) ? p : COSTE_BANCARIA_EUR_POR_TOKEN;
}

function renderCosteCompras() {
  if (typeof document === "undefined") return;
  const cont = $("cbCuerpo");
  if (!cont) return;
  cbInyectarEstilos();
  const registros = ccRegistrosSesion();
  const ajustes = cbAjustesSesion();
  const filas = cbFilas(registros, ajustes, cbPrecioSesion());
  /* Lo escrito de una compra que ya no está (otra cache) se olvida. */
  const vivas = new Set(filas.map(f => f.reg.clave));
  for (const c of Object.keys(cbBorrador)) if (!vivas.has(c)) delete cbBorrador[c];
  const n = $("cbCount");
  if (n) n.textContent = String(vivas.size);
  cont.innerHTML = cbHtmlEditor(filas, cbBorrador);
}
function cbRenderSeguro() {
  try { renderCosteCompras(); }
  catch (e) { console.error("Coste de las compras (js/20-coste-compras.js):", e); }
}

/* La casilla de una compra en la pantalla. */
function cbCasilla(clave) {
  return document.querySelector('#cbCuerpo .cb-valor[data-clave="' + CSS.escape(clave) + '"]');
}

/* «✏️ Editar»: abre la casilla con lo guardado, con el cursor dentro. */
function cbAbrir(clave) {
  const reg = ccRegistrosSesion().find(r => r.clave === clave);
  if (!reg) return;
  cbBorrador[clave] = numEs(cbCosteVisto(reg, cbAjustesSesion(), cbPrecioSesion()), 2);
  renderCosteCompras();
  const input = cbCasilla(clave);
  if (input) { input.focus(); input.select(); }
}
/* El foco, al «✏️ Editar» de esa fila (si no, al repintar se va al
   principio de la página). Solo si no estás ya en otro sitio (guardar
   tarda y entretanto puedes escribir en otra parte). */
function cbFocoEditar(clave) {
  const a = document.activeElement;
  if (a && a !== document.body && !a.closest("#cbCuerpo")) return;
  const btn = document.querySelector('#cbCuerpo [data-cb="editar"][data-clave="' + CSS.escape(clave) + '"]');
  if (btn) btn.focus();
}
/* «Cancelar» o Esc: se cierra sin guardar. */
function cbCerrar(clave) {
  delete cbBorrador[clave];
  renderCosteCompras();
  cbFocoEditar(clave);
}

/* «Guardar» o Intro: guarda la compra de esa fila y la cierra. Sin cambio,
   solo la cierra. */
async function cbGuardar(clave) {
  if (!state.cache) return toast(CC_SIN_CACHE, "warn");
  const registros = ccRegistrosSesion();
  const ajustes = cbAjustesSesion();
  const cambios = cbCambios(registros, ajustes, cbBorrador, clave, cbPrecioSesion());
  if (!cambios.length) return cbCerrar(clave);
  let nuevos;
  try { nuevos = cbAjustesConCostes(ajustes, cambios, registros, cbPrecioSesion(), ahoraLocalISO()); }
  catch (e) { return toast(Number.isNaN(cambios[0].valor) ? ccAvisoImporte(String(cbBorrador[clave])) : e.message, "error"); }
  delete cbBorrador[clave];
  await ccGuardarAjustesDecision(nuevos, "Coste guardado.");
  cbFocoEditar(clave);
}

/* Al escribir: se recuerda, se recalcula el € por token de la fila y se
   activa su «Guardar» sin repintar (no se pierde el foco). */
function cbMontarEventos() {
  const cont = $("cbCuerpo");
  if (!cont || cont.__cbEventos) return;
  cont.__cbEventos = true;
  cont.addEventListener("input", e => {
    const input = e.target;
    if (!input.classList || !input.classList.contains("cb-valor")) return;
    const clave = input.getAttribute("data-clave");
    cbBorrador[clave] = input.value;
    const registros = ccRegistrosSesion();
    const reg = registros.find(r => r.clave === clave);
    const fila = input.closest("tr");
    const celda = fila && fila.querySelector(".cb-por-token");
    if (reg && celda) celda.textContent = cbTextoPorToken(cbValorEscrito(input.value), reg.cantidad);
    const btn = fila && fila.querySelector('[data-cb="guardar"]');
    if (btn) btn.disabled = cbCambios(registros, cbAjustesSesion(), cbBorrador, clave, cbPrecioSesion()).length === 0;
  });
  cont.addEventListener("keydown", e => {
    const input = e.target;
    if (!input.classList || !input.classList.contains("cb-valor")) return;
    const clave = input.getAttribute("data-clave");
    if (e.key === "Enter") { e.preventDefault(); cbGuardar(clave); }
    else if (e.key === "Escape") { e.preventDefault(); cbCerrar(clave); }
  });
  cont.addEventListener("click", e => {
    const btn = ccBotonDe(e, "[data-cb]");
    if (!btn || btn.disabled) return;
    const clave = btn.getAttribute("data-clave");
    const accion = btn.getAttribute("data-cb");
    if (accion === "editar") cbAbrir(clave);
    else if (accion === "cancelar") cbCerrar(clave);
    else if (accion === "guardar") cbGuardar(clave);
  });
}

/* Estilos (una vez), solo con variables de color del tema. */
function cbInyectarEstilos() {
  if ($("estiloCoste20")) return;
  const estilo = document.createElement("style");
  estilo.id = "estiloCoste20";
  estilo.textContent = [
    ".cb-coste summary{color:var(--text)}",
    /* En un móvil la tabla scrollea en su caja, nunca la página. */
    ".cb-caja{overflow-x:auto}",
    /* Como la tabla de 📒 Transacciones: sin
       cuadrícula, solo una raya fina entre filas, y algo más alta. */
    ".cb-tabla{max-width:720px;font-size:13.5px}",
    ".cb-tabla td,.cb-tabla th{padding:11px 10px;border:0;border-bottom:1px solid color-mix(in srgb,var(--border) 80%,var(--border2));vertical-align:middle;white-space:nowrap}",
    ".cb-tabla th{border-bottom:1px solid var(--border2);font-size:13.5px}",
    ".cb-tabla tbody td{height:50px;padding-top:6px;padding-bottom:6px}", // la misma altura con casilla o sin ella
    ".cb-tabla tbody tr:hover{background:var(--panel2)}",
    ".cb-tabla .num{text-align:right;font-variant-numeric:tabular-nums}",
    ".cb-defecto{color:var(--muted);font-size:12.5px;font-weight:400}",
    ".cb-valor{width:120px;text-align:right;padding:6px 10px;font-size:13.5px}",
    ".cb-acciones{text-align:left}",
    ".cb-accion{font-size:13px;padding:5px 10px;border-radius:8px}",
    ".cb-accion+.cb-accion{margin-left:6px}",
  ].join("\n");
  document.head.appendChild(estilo);
}

/* ----------------------------- Enganche -----------------------------
   Detrás de renderCorrecciones (js/15), que ya se repinta tras cargar,
   guardar o clasificar y al volver a #revision. */
(function montarCosteCompras() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const original = window.renderCorrecciones;
  if (typeof original === "function" && !original.__cbEnvuelta) {
    const envoltura = function () {
      const resultado = original.apply(this, arguments);
      cbRenderSeguro();
      return resultado;
    };
    envoltura.__cbEnvuelta = true;
    window.renderCorrecciones = envoltura;
  }
  cbMontarEventos();
  cbRenderSeguro(); // el DOM ya existe: los scripts van al final del <body>
})();
