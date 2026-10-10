/* =====================================================================
   REENTAL SPA · js/25-xlsx.js
   Escribir un libro de Excel (.xlsx) a mano, sin librerías (la app no
   tiene dependencias).

   Un .xlsx es un .zip con unos XML dentro. Aquí se arma ese .zip sin
   comprimir (método «store»: Excel, LibreOffice y openpyxl lo abren igual)
   con lo que usa el Excel de la app: texto, números, fechas, formatos
   de número, negrita, color de letra, relleno, alineación, celdas unidas,
   anchos de columna, alto de fila, cabecera congelada y filtro.

   Uso (filas y columnas desde 1; una fuera de la hoja da error):
     const libro = xlsxLibro();
     const hoja = xlsxHoja(libro, "Resumen");
     xlsxCelda(hoja, 1, 1, "Inversor", { negrita: true, relleno: "D9E1F2" });
     xlsxCelda(hoja, 2, 2, 1234.5, { formato: "#,##0.00 €" });
     xlsxCongelar(hoja, 2, 1);          // congela lo de encima de A2
     xlsxFiltro(hoja, 1, 1, 9, 2);      // filtro en A1:B9
     xlsxUnir(hoja, 3, 1, 3, 4);        // une A3:D3
     hoja.anchos = [50, 34];  hoja.altos[3] = 45;
     const blob = xlsxBlob(libro);

   Estilo de una celda (todo opcional): formato (formato de número de
   Excel, un texto), negrita, mono (Consolas en vez de Calibri), color y
   relleno (hexadecimal «RRGGBB» o «AARRGGBB»), horizontal («left», «center», «right»),
   vertical («top», «center», «bottom») y ajustar (texto en varias líneas).
   Lo que no es válido (un color mal escrito, «derecha», un formato con una
   comilla sin cerrar) no se aplica.

   Valores: número (uno no finito, NaN o Infinity, deja la celda vacía:
   Excel no lo admite), texto (siempre texto, también si empieza por «=»:
   nunca una fórmula), true/false, una fecha (Date, con sus partes UTC,
   del 01/03/1900 al 31/12/9999, o la celda queda vacía; sin formato sale
   DD/MM/YYYY) o null (solo el estilo). Las fechas de los
   registros se pasan con xlsxFecha(texto) y la de hoy con xlsxAhora():
   new Date() o new Date(texto) saldrían con 1-2 horas de menos.
   ===================================================================== */

const XLSX_TIPO = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSX_FMT_FECHA = "DD/MM/YYYY";
const XLSX_MAX_TEXTO = 32767;              // lo más largo que cabe en una celda
const XLSX_MAX_FILAS = 1048576, XLSX_MAX_COLUMNAS = 16384;   // el tamaño de una hoja
const XLSX_NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XLSX_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XLSX_NS = 'xmlns="' + XLSX_NS_MAIN + '" xmlns:r="' + XLSX_REL + '"';
const XLSX_NS_PAQUETE = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const XLSX_TIPO_PARTE = "application/vnd.openxmlformats-officedocument.spreadsheetml.";
const XLSX_CABECERA_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const XLSX_ALINEAR = { horizontal: ["left", "center", "right"], vertical: ["top", "center", "bottom"] };

function xlsxLibro() { return { hojas: [] }; }

// Nombre válido y único (Excel: hasta 31 letras, sin []:*?/\, sin
// apóstrofo al principio ni al final y sin repetir, sin mirar mayúsculas).
// Se limpia antes de mirar si se repite («A» con un carácter invisible
// acaba igual que «A»), y se compara como Excel, en
// mayúsculas («Straße» y «STRASSE» son la misma).
function xlsxNombreHoja(libro, nombre) {
  const puntas = t => t.replace(/^[\s']+|[\s']+$/g, "");      // espacios y apóstrofos de los extremos
  const base = puntas(xlsxCortar(puntas(xlsxSinRaros(nombre ?? "").replace(/[\[\]:*?\/\\]/g, " ")), 31)) ||
    "Hoja " + (libro.hojas.length + 1);
  const usados = new Set(libro.hojas.map(h => h.nombre.toUpperCase()));
  let elegido = base;
  for (let n = 2; usados.has(elegido.toUpperCase()); n++) {
    const sufijo = " (" + n + ")";
    elegido = puntas(xlsxCortar(base, 31 - sufijo.length)) + sufijo;
  }
  return elegido;
}

// Los primeros n caracteres sin partir un emoji (que ocupa dos).
function xlsxCortar(texto, n) {
  const t = texto.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(t) ? t.slice(0, -1) : t;
}

function xlsxHoja(libro, nombre) {
  const hoja = { nombre: xlsxNombreHoja(libro, nombre), filas: new Map(), anchos: [],
    altos: {}, unidas: [], congelar: null, filtro: null };
  libro.hojas.push(hoja);
  return hoja;
}

// «B3» de una fila y una columna; error si no están dentro de la hoja.
function xlsxRefDe(fila, columna) {
  if (!(Number.isInteger(fila) && fila >= 1 && fila <= XLSX_MAX_FILAS &&
        Number.isInteger(columna) && columna >= 1 && columna <= XLSX_MAX_COLUMNAS)) {
    throw new Error("Celda fuera de la hoja: fila " + fila + ", columna " + columna);
  }
  return xlsxColumna(columna) + fila;
}

// Guarda una copia del estilo y de la fecha: cambiarlos después no cambia
// la celda ya escrita.
function xlsxCelda(hoja, fila, columna, valor, estilo = {}) {
  xlsxRefDe(fila, columna);
  if (Object.prototype.toString.call(valor) === "[object Date]") valor = new Date(valor.getTime());
  if (!hoja.filas.has(fila)) hoja.filas.set(fila, new Map());
  hoja.filas.get(fila).set(columna, { valor, estilo: { ...(estilo || {}) } });
}

// Rango de dos celdas, de arriba a la izquierda a abajo a la derecha aunque
// se den al revés (Excel no abre «D3:A1»): { a: "A1", b: "D3", fila, columna, fila2, col2 }.
function xlsxRango(fila1, col1, fila2, col2) {
  xlsxRefDe(fila1, col1);
  xlsxRefDe(fila2, col2);
  const f = Math.min(fila1, fila2), c = Math.min(col1, col2), f2 = Math.max(fila1, fila2), c2 = Math.max(col1, col2);
  return { a: xlsxRefDe(f, c), b: xlsxRefDe(f2, c2), fila: f, columna: c, fila2: f2, col2: c2 };
}

// Une celdas. La misma unión otra vez no hace nada; una que pisa a otra da
// error (Excel no abre el libro con las dos).
function xlsxUnir(hoja, fila1, col1, fila2, col2) {
  const r = xlsxRango(fila1, col1, fila2, col2);
  for (const u of hoja.unidas) {
    if (u.a === r.a && u.b === r.b) return;
    if (r.fila <= u.fila2 && u.fila <= r.fila2 && r.columna <= u.col2 && u.columna <= r.col2) {
      throw new Error("Celdas unidas que se pisan: " + r.a + ":" + r.b + " y " + u.a + ":" + u.b);
    }
  }
  hoja.unidas.push(r);
}
function xlsxFiltro(hoja, fila1, col1, fila2, col2) { hoja.filtro = xlsxRango(fila1, col1, fila2, col2); }
// Congela las filas de encima y las columnas a la izquierda de esa celda.
function xlsxCongelar(hoja, fila, columna) { xlsxRefDe(fila, columna); hoja.congelar = { fila, columna }; }

// 1 → A, 27 → AA.
function xlsxColumna(n) {
  let letras = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) letras = String.fromCharCode(65 + (n - 1) % 26) + letras;
  return letras;
}

// Sin los caracteres de control que el XML no admite (ni medios caracteres
// sueltos; el bajo, mirando atrás sin gastar el de antes: si no, con dos
// seguidos quedaría uno).
function xlsxSinRaros(texto) {
  return String(texto)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

// Texto seguro dentro de un XML: sin raros y con & < > " escapados.
function xlsxEsc(texto) {
  return xlsxSinRaros(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Una fecha de los registros («AAAA-MM-DD» o «AAAA-MM-DD HH:MM[:SS]», sin
// zona) como Date para una celda, tal cual, sin pasar por la hora local
// (new Date(texto) la tomaría como hora de Madrid y a las 00:30 caería en
// el día de antes). null si no es una fecha válida.
function xlsxFecha(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(texto ?? "").trim());
  if (!m) return null;
  const [anio, mes, dia, h, mi, s] = m.slice(1).map(x => Number(x || 0));
  const d = new Date(Date.UTC(2000, mes - 1, dia, h, mi, s));
  d.setUTCFullYear(anio);
  return d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia && h < 24 && mi < 60 && s < 60 ? d : null;
}

// La hora de este ordenador como Date para una celda («Generado el»): Excel
// no tiene zonas, así que se escribe la hora que ve el usuario.
function xlsxAhora(d = new Date()) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
}

// Fecha de Excel: días desde el 30/12/1899 (con la hora como fracción).
// Solo del 01/03/1900 al 31/12/9999 (antes, Excel cuenta
// un 29/02/1900 que no existió; después, no las enseña); fuera, null (celda vacía).
function xlsxNumeroFecha(d) {
  const t = Math.floor(d.getTime() / 1000) * 1000;   // sin milésimas
  if (!(t >= Date.UTC(1900, 2, 1) && t < Date.UTC(10000, 0, 1))) return null;
  return (t - Date.UTC(1899, 11, 30)) / 86400000;
}

// ---------- Estilos: cada combinación distinta, una vez ----------

// La posición 0 de cada lista es la de por defecto: un estilo vacío da 0.
function xlsxEstilos() {
  return { fuentes: ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'],
    rellenos: ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
    formatos: [], xfs: ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'] };
}

function xlsxIndiceDe(lista, xml) {
  let i = lista.indexOf(xml);
  if (i < 0) { lista.push(xml); i = lista.length - 1; }
  return i;
}

// «RRGGBB» (o «AARRGGBB», como en openpyxl) → «AARRGGBB»; otra cosa, null.
function xlsxColor(hex) {
  const limpio = String(hex || "").replace(/^#/, "").toUpperCase();
  return /^([0-9A-F]{2})?[0-9A-F]{6}$/.test(limpio) ? limpio.padStart(8, "F") : null;
}

// Formato de número: solo un texto con las comillas cerradas (un número o
// una comilla suelta dejarían la celda mal o el libro sin abrir); otra
// cosa, null.
function xlsxFormato(formato) {
  if (typeof formato !== "string" || !formato.trim()) return null;
  return (formato.replace(/\\./g, "").match(/"/g) || []).length % 2 ? null : formato;
}

function xlsxEstiloId(estilos, estilo, esFecha) {
  const formato = xlsxFormato(estilo.formato) || (esFecha ? XLSX_FMT_FECHA : null);
  const color = xlsxColor(estilo.color), relleno = xlsxColor(estilo.relleno);
  const fuente = xlsxIndiceDe(estilos.fuentes, "<font>" + (estilo.negrita ? "<b/>" : "") +
    '<sz val="11"/>' + (color ? '<color rgb="' + color + '"/>' : "") +
    '<name val="' + (estilo.mono ? "Consolas" : "Calibri") + '"/><family val="' + (estilo.mono ? 3 : 2) + '"/></font>');
  const fill = relleno ? xlsxIndiceDe(estilos.rellenos, '<fill><patternFill patternType="solid"><fgColor rgb="' +
    relleno + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
  const fmt = formato ? 164 + xlsxIndiceDe(estilos.formatos, formato) : 0;
  const alinear = Object.keys(XLSX_ALINEAR).filter(eje => XLSX_ALINEAR[eje].includes(estilo[eje]))
    .map(eje => eje + '="' + estilo[eje] + '"').concat(estilo.ajustar ? ['wrapText="1"'] : []).join(" ");
  return xlsxIndiceDe(estilos.xfs, '<xf numFmtId="' + fmt + '" fontId="' + fuente + '" fillId="' + fill +
    '" borderId="0" xfId="0"' + (fmt ? ' applyNumberFormat="1"' : "") + (fuente ? ' applyFont="1"' : "") +
    (fill ? ' applyFill="1"' : "") + (alinear ? ' applyAlignment="1"><alignment ' + alinear + "/></xf>" : "/>"));
}

function xlsxEstilosXml(estilos) {
  const formatos = estilos.formatos.map((f, i) => '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + xlsxEsc(f) + '"/>');
  return '<styleSheet xmlns="' + XLSX_NS_MAIN + '">' +
    (formatos.length ? '<numFmts count="' + formatos.length + '">' + formatos.join("") + "</numFmts>" : "") +
    '<fonts count="' + estilos.fuentes.length + '">' + estilos.fuentes.join("") + "</fonts>" +
    '<fills count="' + estilos.rellenos.length + '">' + estilos.rellenos.join("") + "</fills>" +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + estilos.xfs.length + '">' + estilos.xfs.join("") + "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

// ---------- Hojas ----------

function xlsxCeldaXml(ref, celda, estilos) {
  let valor = celda.valor;
  const esFecha = Object.prototype.toString.call(valor) === "[object Date]";   // también de otra ventana
  if (esFecha) valor = xlsxNumeroFecha(valor);   // una fecha inválida también da null
  if (typeof valor === "number" && !Number.isFinite(valor)) valor = null;
  const id = xlsxEstiloId(estilos, celda.estilo, esFecha);
  const s = id ? ' s="' + id + '"' : "";
  if (valor === null || valor === undefined) return s ? '<c r="' + ref + '"' + s + "/>" : "";
  if (typeof valor === "number") return '<c r="' + ref + '"' + s + "><v>" + valor + "</v></c>";
  if (typeof valor === "boolean") return '<c r="' + ref + '"' + s + ' t="b"><v>' + (valor ? 1 : 0) + "</v></c>";
  const texto = String(valor).slice(0, XLSX_MAX_TEXTO);
  return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xlsxEsc(texto) + "</t></is></c>";
}

function xlsxPanelXml(congelar) {
  if (!congelar) return "";
  const x = congelar.columna - 1, y = congelar.fila - 1;
  if (!x && !y) return "";
  const panel = x && y ? "bottomRight" : (y ? "bottomLeft" : "topRight");
  return "<pane" + (x ? ' xSplit="' + x + '"' : "") + (y ? ' ySplit="' + y + '"' : "") +
    ' topLeftCell="' + xlsxColumna(congelar.columna) + congelar.fila + '" activePane="' + panel +
    '" state="frozen"/><selection pane="' + panel + '"/>';
}

// Un ancho o un alto: número positivo y finito, hasta lo más que admite
// Excel («Infinity» ocultaría la columna); si no, null.
function xlsxMedida(valor, maximo) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.min(n, maximo) : null;
}

function xlsxHojaXml(hoja, i, estilos) {
  // Las filas con celdas y las que solo tienen alto (dentro de la hoja), en orden
  const numeros = new Set(hoja.filas.keys());
  for (const k of Object.keys(hoja.altos)) {
    if (/^[1-9]\d*$/.test(k) && Number(k) <= XLSX_MAX_FILAS && xlsxMedida(hoja.altos[k], 409)) numeros.add(Number(k));
  }
  const filas = [...numeros].sort((a, b) => a - b).map(n => {
    const celdas = hoja.filas.get(n) || new Map();
    const xml = [...celdas.keys()].sort((a, b) => a - b)
      .map(c => xlsxCeldaXml(xlsxColumna(c) + n, celdas.get(c), estilos)).join("");
    const alto = xlsxMedida(hoja.altos[n], 409);
    return '<row r="' + n + '"' + (alto ? ' ht="' + alto + '" customHeight="1"' : "") + ">" + xml + "</row>";
  });
  const cols = hoja.anchos.slice(0, XLSX_MAX_COLUMNAS).map((a, k) => xlsxMedida(a, 255) ?
    '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + xlsxMedida(a, 255) + '" customWidth="1"/>' : "").join("");
  return "<worksheet " + XLSX_NS + ">" +
    '<sheetViews><sheetView workbookViewId="0"' + (i === 0 ? ' tabSelected="1"' : "") + ">" +
    xlsxPanelXml(hoja.congelar) + "</sheetView></sheetViews>" +
    '<sheetFormatPr defaultRowHeight="15"/>' + (cols ? "<cols>" + cols + "</cols>" : "") +
    "<sheetData>" + filas.join("") + "</sheetData>" +
    (hoja.filtro ? '<autoFilter ref="' + hoja.filtro.a + ":" + hoja.filtro.b + '"/>' : "") +
    (hoja.unidas.length ? '<mergeCells count="' + hoja.unidas.length + '">' +
      hoja.unidas.map(r => '<mergeCell ref="' + r.a + ":" + r.b + '"/>').join("") + "</mergeCells>" : "") +
    "</worksheet>";
}

// Rango del filtro con el nombre de la hoja y en absoluto: 'Mi hoja'!$A$1:$H$9.
function xlsxRangoFiltro(hoja) {
  const abs = r => r.replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2");
  return "'" + hoja.nombre.replace(/'/g, "''") + "'!" + abs(hoja.filtro.a) + ":" + abs(hoja.filtro.b);
}

// [nombre dentro del .zip, contenido] de cada archivo del libro.
function xlsxArchivos(libro) {
  if (!libro.hojas.length) throw new Error("El libro no tiene hojas");
  const estilos = xlsxEstilos();
  const tipos = [], relaciones = [], hojas = [], filtros = [], archivosHoja = [];
  libro.hojas.forEach((h, i) => {
    const n = i + 1;
    tipos.push('<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="' + XLSX_TIPO_PARTE + 'worksheet+xml"/>');
    relaciones.push('<Relationship Id="rId' + n + '" Type="' + XLSX_REL + '/worksheet" Target="worksheets/sheet' + n + '.xml"/>');
    hojas.push('<sheet name="' + xlsxEsc(h.nombre) + '" sheetId="' + n + '" r:id="rId' + n + '"/>');
    if (h.filtro) filtros.push('<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' +
      xlsxEsc(xlsxRangoFiltro(h)) + "</definedName>");
    archivosHoja.push(["xl/worksheets/sheet" + n + ".xml", xlsxHojaXml(h, i, estilos)]);
  });
  const n = libro.hojas.length;
  return [
    ["[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="' + XLSX_TIPO_PARTE + 'sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="' + XLSX_TIPO_PARTE + 'styles+xml"/>' +
      tipos.join("") + "</Types>"],
    ["_rels/.rels", "<Relationships " + XLSX_NS_PAQUETE + '><Relationship Id="rId1" Type="' + XLSX_REL +
      '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml", "<workbook " + XLSX_NS + "><bookViews><workbookView/></bookViews><sheets>" + hojas.join("") +
      "</sheets>" + (filtros.length ? "<definedNames>" + filtros.join("") + "</definedNames>" : "") + "</workbook>"],
    ["xl/_rels/workbook.xml.rels", "<Relationships " + XLSX_NS_PAQUETE + ">" + relaciones.join("") +
      '<Relationship Id="rId' + (n + 1) + '" Type="' + XLSX_REL + '/styles" Target="styles.xml"/></Relationships>'],
    ...archivosHoja,
    // Los estilos, al final: los van apuntando las hojas al escribirse
    ["xl/styles.xml", xlsxEstilosXml(estilos)],
  ].map(([nombre, xml]) => [nombre, XLSX_CABECERA_XML + xml]);
}

// ---------- El .zip (sin comprimir) ----------

const XLSX_TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function xlsxCrc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = XLSX_TABLA_CRC[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Fecha y hora del .zip (formato de MS-DOS, hora local; desde 1980).
function xlsxFechaDos(d) {
  const anio = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return { hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dia: ((anio - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

// Bytes de una cabecera del .zip: pares [valor, ancho en bytes (2 o 4)], seguidos.
function xlsxCampos(...campos) {
  const vista = new DataView(new ArrayBuffer(campos.reduce((s, [, ancho]) => s + ancho, 0)));
  let o = 0;
  for (const [valor, ancho] of campos) {
    if (ancho === 4) vista.setUint32(o, valor, true); else vista.setUint16(o, valor, true);
    o += ancho;
  }
  return new Uint8Array(vista.buffer);
}

function xlsxZip(archivos, ahora) {
  const utf8 = new TextEncoder();
  const { hora, dia } = xlsxFechaDos(ahora);
  const partes = [], central = [];
  let desplazamiento = 0;
  for (const [nombre, contenido] of archivos) {
    const n = utf8.encode(nombre), datos = utf8.encode(contenido);
    // Versión 2.0, nombres en UTF-8 (0x0800), sin comprimir, fecha, CRC, tamaños y largo del nombre
    const comunes = [[20, 2], [0x0800, 2], [0, 2], [hora, 2], [dia, 2], [xlsxCrc32(datos), 4],
      [datos.length, 4], [datos.length, 4], [n.length, 2]];
    const local = xlsxCampos([0x04034b50, 4], ...comunes, [0, 2]);
    partes.push(local, n, datos);
    central.push(xlsxCampos([0x02014b50, 4], [20, 2], ...comunes, [0, 2], [0, 2], [0, 2], [0, 2], [0, 4],
      [desplazamiento, 4]), n);
    desplazamiento += local.length + n.length + datos.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  partes.push(...central, xlsxCampos([0x06054b50, 4], [0, 2], [0, 2], [archivos.length, 2], [archivos.length, 2],
    [tamCentral, 4], [desplazamiento, 4], [0, 2]));
  const total = new Uint8Array(partes.reduce((s, b) => s + b.length, 0));
  let o = 0;
  for (const b of partes) { total.set(b, o); o += b.length; }
  return total;
}

// Los bytes del .xlsx.
function xlsxBytes(libro, ahora = new Date()) { return xlsxZip(xlsxArchivos(libro), ahora); }

function xlsxBlob(libro, ahora = new Date()) { return new Blob([xlsxBytes(libro, ahora)], { type: XLSX_TIPO }); }
