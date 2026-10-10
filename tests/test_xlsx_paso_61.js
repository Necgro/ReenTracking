/* Test unitario de js/25: escribir un .xlsx a mano.
 *
 * Arma un libro con todo lo que usa el Excel de la app (texto, números,
 * fechas, formatos, negrita, color, relleno, alineación, celdas unidas,
 * anchos, altos, cabecera congelada y filtro) y casos raros (caracteres que
 * el XML no admite, texto que empieza por «=», NaN, fechas mal, nombres de
 * hoja repetidos o con símbolos), lo guarda en una carpeta temporal y lo
 * abre con openpyxl para leerlo de vuelta.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_xlsx_paso_61.js
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, TextEncoder, Blob };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(BASE, "25-xlsx.js"), "utf8"), sandbox, { filename: "25-xlsx.js" });
const { xlsxLibro, xlsxHoja, xlsxCelda, xlsxUnir, xlsxFiltro, xlsxCongelar, xlsxColumna, xlsxBytes, xlsxBlob,
  xlsxCrc32, xlsxSinRaros } = sandbox;

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

// ---------- Piezas sueltas ----------
assert("columnas: A, Z, AA, ZZ, AAA", [1, 26, 27, 702, 703].map(xlsxColumna).join() === "A,Z,AA,ZZ,AAA");
assert("CRC32 de «123456789» = CBF43926", xlsxCrc32(new TextEncoder().encode("123456789")) === 0xCBF43926);
let tiro = null;
try { xlsxBytes(xlsxLibro()); } catch (e) { tiro = e.message; }
assert("un libro sin hojas no se escribe", tiro === "El libro no tiene hojas", tiro);
tiro = null;
try { xlsxCelda(xlsxHoja(xlsxLibro(), "X"), 0, 1, "x"); } catch (e) { tiro = e.message; }
assert("una celda en la fila 0 da error", /fuera de la hoja/.test(tiro || ""), tiro);
for (const [nombre, fn] of [["unir", h => xlsxUnir(h, 1, 0, 2, 2)], ["filtro", h => xlsxFiltro(h, 1, 1, 1.5, 2)],
  ["congelar", h => xlsxCongelar(h, "A", 2)]]) {
  tiro = null;
  try { fn(xlsxHoja(xlsxLibro(), "X")); } catch (e) { tiro = e.message; }
  assert(nombre + " fuera de la hoja da error", /fuera de la hoja/.test(tiro || ""), tiro);
}

// ---------- El libro ----------
const EUR = "#,##0.00 €", PARCIAL = '#,##0.00" *"', FH = "DD/MM/YYYY HH:MM";
const libro = xlsxLibro();
const h1 = xlsxHoja(libro, "Resumen");
h1.anchos = [50, 34, 0, 16];
xlsxCongelar(h1, 2, 1);
xlsxFiltro(h1, 1, 1, 5, 6);
xlsxCelda(h1, 1, 1, "Título", { negrita: true, relleno: "D9E1F2" });
xlsxCelda(h1, 1, 2, "Rojo", { negrita: true, relleno: "#c00000", color: "FFFFFF" });
xlsxCelda(h1, 2, 1, 'A & B <c> "d" \'e\' ñ €');
xlsxCelda(h1, 2, 2, "=SUMA(A1:A2)");
xlsxCelda(h1, 2, 3, "con\u0001control\u0000y medio \uD83D suelto y entero 😀");
xlsxCelda(h1, 2, 4, "  espacios  ");
xlsxCelda(h1, 3, 1, 1234.5, { formato: EUR });
xlsxCelda(h1, 3, 2, -0.000001, { formato: "#,##0.######" });
xlsxCelda(h1, 3, 3, 123456789012);
xlsxCelda(h1, 3, 4, 7.5, { formato: PARCIAL });
xlsxCelda(h1, 3, 5, NaN, { formato: EUR });
xlsxCelda(h1, 3, 6, Infinity);
xlsxCelda(h1, 4, 1, new Date(Date.UTC(2025, 2, 15)));
xlsxCelda(h1, 4, 2, new Date(Date.UTC(2025, 11, 31, 10, 30)), { formato: FH });
xlsxCelda(h1, 4, 3, new Date("no es fecha"));
xlsxCelda(h1, 4, 4, true);
xlsxCelda(h1, 4, 5, null, { relleno: "BDD7EE" });
xlsxCelda(h1, 4, 6, undefined);
xlsxCelda(h1, 5, 1, "hash", { mono: true });
xlsxCelda(h1, 5, 2, 10, { formato: EUR, horizontal: "right" });
xlsxCelda(h1, 5, 3, 20, { formato: EUR, horizontal: "right" });   // mismo estilo: se reutiliza
xlsxCelda(h1, 5, 4, "mal", { horizontal: "derecha", vertical: "middle", color: "nope", negritaa: true });
xlsxCelda(h1, 10, 1, "Nota larga en varias líneas\nsegunda línea", { ajustar: true, vertical: "top" });
xlsxUnir(h1, 10, 1, 10, 4);
h1.altos[10] = 45;
h1.altos[12] = 30;                 // fila sin celdas, solo con alto
h1.altos.x = 99;                   // mal escrito: se ignora
xlsxCelda(h1, 11, 1, "x".repeat(40000));
xlsxCelda(h1, 6, 1, "primera vez");
xlsxCelda(h1, 6, 1, "segunda vez");   // la misma celda dos veces: queda la última
const h2 = xlsxHoja(libro, "Resumen");                 // repetido
xlsxCongelar(h2, 3, 2);
xlsxCelda(h2, 1, 1, "segunda");
const h3 = xlsxHoja(libro, "a/b:c*d?e[f]g\\h nombre muy largo de verdad");
xlsxCelda(h3, 1, 1, "tercera");
const h4 = xlsxHoja(libro, "'Renta 2025' d'Ana");
xlsxFiltro(h4, 1, 1, 2, 2);
xlsxCongelar(h4, 1, 1);          // A1: no congela nada
xlsxCelda(h4, 1, 1, "cuarta");
xlsxHoja(libro, "  ");
xlsxHoja(libro, "RESUMEN");                 // repetido sin mirar mayúsculas

assert("nombres de hoja válidos y sin repetir",
  JSON.stringify(libro.hojas.map(h => h.nombre)) === JSON.stringify(["Resumen", "Resumen (2)",
    "a b c d e f g h nombre muy larg", "Renta 2025' d'Ana", "Hoja 5", "RESUMEN (3)"]),
  libro.hojas.map(h => h.nombre));
assert("nombres de hasta 31 letras", libro.hojas.every(h => h.nombre.length <= 31));

const fecha = new Date(2026, 9, 5, 12, 0, 0);
const bytes = xlsxBytes(libro, fecha);
assert("mismo libro y misma hora: los mismos bytes", Buffer.compare(Buffer.from(bytes), Buffer.from(xlsxBytes(libro, fecha))) === 0);
const blob = xlsxBlob(libro, fecha);
assert("el Blob lleva el tipo de Excel y los mismos bytes",
  blob.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" && blob.size === bytes.length);

// ---------- Leerlo con openpyxl (y con Excel, si está) ----------
// openpyxl abre cosas que Excel tiene que reparar: además se
// mira el orden de las partes de cada hoja, que Excel exige, y, si Excel está
// instalado, se abre con él (si tuviera que repararlo, no abre).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx61-"));
const lector = `
import json, re, sys, zipfile, datetime
from openpyxl import load_workbook
ruta = sys.argv[1]
z = zipfile.ZipFile(ruta)
malo = z.testzip()
def num_col(letras):
    n = 0
    for c in letras: n = n * 26 + ord(c) - 64
    return n
problemas = []
seleccionadas = 0
for nombre in z.namelist():
    x = z.read(nombre).decode("utf-8")
    if nombre.startswith("xl/worksheets/"):
        pos = [p for p in (x.find(e) for e in ("<sheetViews", "<sheetFormatPr", "<cols", "<sheetData", "<autoFilter", "<mergeCells")) if p >= 0]
        if pos != sorted(pos): problemas.append(nombre + ": partes fuera de orden")
        filas = [int(n) for n in re.findall(r'<row r="(\\d+)"', x)]
        if filas != sorted(set(filas)): problemas.append(nombre + ": filas fuera de orden")
        for fila in re.findall(r'<row r="\\d+"[^>]*?(?:/>|>(.*?)</row>)', x):
            cols = [num_col(c) for c in re.findall(r'<c r="([A-Z]+)\\d+"', fila)]
            if cols != sorted(set(cols)): problemas.append(nombre + ": celdas fuera de orden")
        if re.search(r'<t(?: (?!xml:space="preserve")[^>]*)?>', x): problemas.append(nombre + ": texto sin xml:space")
        seleccionadas += x.count('tabSelected="1"')
    if nombre == "xl/workbook.xml":
        ids = re.findall(r'sheetId="(\\d+)"', x)
        if len(ids) != len(set(ids)): problemas.append("sheetId repetido")
    if nombre == "xl/styles.xml":
        rellenos = re.findall(r"<fill>.*?</fill>", x)
        if len(rellenos) < 2 or "gray125" not in rellenos[1]: problemas.append("falta el relleno gray125")
if seleccionadas != 1: problemas.append("hojas seleccionadas: %d" % seleccionadas)
wb = load_workbook(ruta)
def v(x):
    if isinstance(x, datetime.datetime): return "fecha:" + x.isoformat()
    return x
out = {"crc_malo": malo, "problemas": problemas, "nombres": wb.sheetnames, "hojas": {}}
for ws in wb.worksheets:
    celdas = {}
    for fila in ws.iter_rows():
        for c in fila:
            f = c.font
            celdas[c.coordinate] = {"v": v(c.value), "t": c.data_type, "fmt": c.number_format,
                "b": bool(f.b), "fuente": f.name, "color": f.color.rgb if f.color is not None and f.color.type == "rgb" else None,
                "relleno": c.fill.fgColor.rgb if c.fill.fill_type == "solid" else None,
                "h": c.alignment.horizontal, "va": c.alignment.vertical, "wrap": bool(c.alignment.wrap_text)}
    out["hojas"][ws.title] = {"celdas": celdas, "congelar": ws.freeze_panes, "filtro": ws.auto_filter.ref,
        "unidas": [str(r) for r in ws.merged_cells.ranges],
        "anchos": {k: d.width for k, d in ws.column_dimensions.items() if d.customWidth},
        "altos": {str(k): d.height for k, d in ws.row_dimensions.items() if d.height},
        "max": [ws.max_row, ws.max_column]}
out["n_estilos"] = len(wb._cell_styles)
print(json.dumps(out, ensure_ascii=True))
`;
// Guarda el libro y lo lee con openpyxl; null si no lo abre (y cuenta el fallo).
function leer(bytesLibro, nombre) {
  const r = path.join(dir, nombre + ".xlsx");
  fs.writeFileSync(r, bytesLibro);
  try {
    const out = JSON.parse(execFileSync("python", ["-c", lector, r], { encoding: "utf8" }));
    assert(nombre + ": openpyxl lo abre, sin CRC malo ni partes fuera de orden",
      out.crc_malo === null && out.problemas.length === 0, out.problemas);
    return out;
  } catch (e) {
    assert(nombre + ": openpyxl lo abre", false, String(e.stderr || e.message).slice(0, 800));
    return null;
  }
}
// Excel por COM (solo en Windows con Excel): "ok", "no abre" o null si no hay Excel.
const { abrirConExcel } = require("./paridad_excel_paso_62.js");
const leido = leer(bytes, "prueba");
if (leido) {
  assert("las 6 hojas, en orden", JSON.stringify(leido.nombres) === JSON.stringify(libro.hojas.map(h => h.nombre)), leido.nombres);
  const r = leido.hojas["Resumen"], c = r.celdas;
  assert("cabecera: negrita y relleno", c.A1.v === "Título" && c.A1.b && c.A1.relleno === "FFD9E1F2", c.A1);
  assert("color de letra y relleno con # en minúsculas", c.B1.color === "FFFFFFFF" && c.B1.relleno === "FFC00000", c.B1);
  assert("texto con & < > \" ' ñ € intacto", c.A2.v === 'A & B <c> "d" \'e\' ñ €', c.A2.v);
  assert("texto que empieza por «=» se queda texto", c.B2.v === "=SUMA(A1:A2)" && c.B2.t === "s", c.B2);
  assert("sin caracteres de control ni medios caracteres, con el emoji entero",
    c.C2.v === "concontroly medio  suelto y entero 😀", c.C2.v);
  assert("Fase 6 A11: dos o tres medios caracteres bajos seguidos se van todos; el emoji de delante, entero",
    xlsxSinRaros("a\uDC00\uDC00b") === "ab" && xlsxSinRaros("\uDC00\uDC00\uDC00") === "" &&
    xlsxSinRaros("😀\uDC00x") === "😀x", [xlsxSinRaros("a\uDC00\uDC00b")]);
  assert("espacios al principio y al final se conservan", c.D2.v === "  espacios  ", c.D2.v);
  assert("número con formato en euros", c.A3.v === 1234.5 && c.A3.fmt === EUR, c.A3);
  assert("número muy pequeño y negativo", c.B3.v === -0.000001 && c.B3.fmt === "#,##0.######", c.B3);
  assert("número grande sin formato", c.C3.v === 123456789012 && c.C3.fmt === "General", c.C3);
  assert("formato con comillas dentro", c.D3.v === 7.5 && c.D3.fmt === PARCIAL, c.D3);
  assert("NaN: celda vacía pero con su formato", c.E3.v === null && c.E3.fmt === EUR, c.E3);
  assert("Infinity: sin celda", !c.F3 || c.F3.v === null, c.F3);
  assert("fecha sin formato: DD/MM/YYYY", c.A4.v === "fecha:2025-03-15T00:00:00" && c.A4.fmt === "DD/MM/YYYY", c.A4);
  assert("fecha con hora y su formato", c.B4.v === "fecha:2025-12-31T10:30:00" && c.B4.fmt === FH, c.B4);
  assert("fecha mal: celda vacía", c.C4.v === null, c.C4);
  assert("verdadero", c.D4.v === true, c.D4);
  assert("null con estilo: vacía con su relleno", c.E4.v === null && c.E4.relleno === "FFBDD7EE", c.E4);
  assert("mono: Consolas; lo demás, Calibri", c.A5.fuente === "Consolas" && c.A3.fuente === "Calibri", [c.A5.fuente, c.A3.fuente]);
  assert("alineada a la derecha", c.B5.h === "right" && c.C5.h === "right", c.B5);
  assert("ajustar y arriba", c.A10.wrap && c.A10.va === "top" && c.A10.v.includes("\n"), c.A10);
  assert("texto de más de 32767 letras se corta", c.A11.v.length === 32767, c.A11.v.length);
  assert("celdas unidas", JSON.stringify(r.unidas) === '["A10:D10"]', r.unidas);
  assert("anchos (el 0 no se pone)", r.anchos.A === 50 && r.anchos.B === 34 && !("C" in r.anchos) && r.anchos.D === 16, r.anchos);
  assert("altos de fila (también sin celdas; lo mal escrito no)", r.altos["10"] === 45 && r.altos["12"] === 30 &&
    Object.keys(r.altos).length === 2, r.altos);
  assert("cabecera congelada y filtro", r.congelar === "A2" && r.filtro === "A1:F5", [r.congelar, r.filtro]);
  const h2l = leido.hojas["Resumen (2)"];
  assert("congelar fila y columna (B3)", h2l.congelar === "B3", h2l.congelar);
  assert("hoja sin filtro", leido.hojas["a b c d e f g h nombre muy larg"].filtro === null);
  assert("la misma celda dos veces: queda la última", c.A6.v === "segunda vez", c.A6);
  assert("alineación, color o clave mal escritos: no se aplican", c.D5.v === "mal" && c.D5.h === null &&
    c.D5.va === null && c.D5.color === null && !c.D5.b, c.D5);
  const h4l = leido.hojas["Renta 2025' d'Ana"];
  assert("filtro en una hoja con apóstrofos", h4l.filtro === "A1:B2" && h4l.celdas.A1.v === "cuarta", h4l.filtro);
  assert("congelar en A1: nada", h4l.congelar === null || h4l.congelar === "A1", h4l.congelar);
  assert("hoja vacía: se abre", leido.hojas["Hoja 5"].max[0] === 1);
  assert("los estilos iguales se reutilizan (pocos estilos)", leido.n_estilos <= 16, leido.n_estilos);
}

// ---------- Casos raros ----------
{
  // Uniones repetidas, que se pisan o al revés; filtro al revés
  const l = xlsxLibro(), h = xlsxHoja(l, "Rangos");
  xlsxCelda(h, 1, 1, "x");
  xlsxUnir(h, 1, 1, 1, 4);
  xlsxUnir(h, 1, 1, 1, 4);            // la misma otra vez: nada
  xlsxUnir(h, 3, 4, 2, 1);            // al revés: A2:D3
  tiro = null;
  try { xlsxUnir(h, 1, 3, 2, 5); } catch (e) { tiro = e.message; }
  assert("A1: unir celdas que pisan otras da error", /se pisan/.test(tiro || ""), tiro);
  assert("A1: la misma unión dos veces queda una", h.unidas.length === 2, h.unidas.length);
  xlsxFiltro(h, 5, 6, 1, 1);          // al revés: A1:F5
  const r = leer(xlsxBytes(l, fecha), "a1_rangos");
  if (r) {
    const hr = r.hojas.Rangos;
    assert("A2: unión al revés se escribe al derecho", JSON.stringify(hr.unidas.sort()) === '["A1:D1","A2:D3"]', hr.unidas);
    assert("A2: filtro al revés se escribe al derecho", hr.filtro === "A1:F5", hr.filtro);
  }
}
{
  // Fechas de los registros y la de hoy, sin el desfase de la hora local
  const { xlsxFecha, xlsxAhora } = sandbox;
  const iso = d => d && d.toISOString().slice(0, 19);
  assert("A3: fecha de un registro con hora, tal cual", iso(xlsxFecha("2025-01-01 00:30:00")) === "2025-01-01T00:30:00");
  assert("A3: fecha sin hora y con T", iso(xlsxFecha("2025-12-31")) === "2025-12-31T00:00:00" &&
    iso(xlsxFecha("2025-12-31T23:59")) === "2025-12-31T23:59:00");
  assert("A3: fechas mal: null", [null, undefined, "", "x", "2025-02-30", "2025-13-01", "2025-01-01 24:00",
    "31/12/2025", 20250101].every(t => xlsxFecha(t) === null));
  assert("A3: año de dos cifras no pasa a 19xx", xlsxFecha("0050-06-01").getUTCFullYear() === 50);
  const ahora = new Date(2026, 9, 5, 0, 30, 15);   // 05/10/2026 00:30:15, hora de este ordenador
  assert("A3: «ahora» con la hora que ve el usuario", iso(xlsxAhora(ahora)) === "2026-10-05T00:30:15", iso(xlsxAhora(ahora)));
  const l = xlsxLibro(), h = xlsxHoja(l, "Fechas");
  xlsxCelda(h, 1, 1, xlsxFecha("2025-01-01 00:30:00"));
  xlsxCelda(h, 1, 2, xlsxAhora(ahora), { formato: FH });
  const r = leer(xlsxBytes(l, fecha), "a3_fechas");
  if (r) {
    const c = r.hojas.Fechas.celdas;
    assert("A3: en el Excel, el 01/01/2025 sigue en 2025", c.A1.v === "fecha:2025-01-01T00:30:00", c.A1.v);
    assert("A3: en el Excel, «ahora» es la hora local", c.B1.v === "fecha:2026-10-05T00:30:15", c.B1.v);
  }
}
{
  // Nombres de hoja que Excel rechaza
  const l = xlsxLibro();
  const treinta = "x".repeat(30);
  for (const n of [" 'Hola", "Hola", "A\u0001", "A", "\u0001\u0002", "Straße", "STRASSE",
    treinta + "😀", treinta]) xlsxHoja(l, n);
  const nombres = l.hojas.map(h => h.nombre);
  assert("A4: nombres limpios y sin repetir (también en mayúsculas)", JSON.stringify(nombres) ===
    JSON.stringify(["Hola", "Hola (2)", "A", "A (2)", "Hoja 5", "Straße", "STRASSE (2)", treinta, treinta.slice(0, 27) + " (2)"]),
    nombres);
  l.hojas.forEach((h, i) => xlsxCelda(h, 1, 1, i));
  const r = leer(xlsxBytes(l, fecha), "a4_nombres");
  if (r) assert("A4: openpyxl ve los mismos nombres", JSON.stringify(r.nombres) === JSON.stringify(nombres), r.nombres);
}
{
  // Cambiar el estilo o la fecha después no cambia la celda escrita
  const l = xlsxLibro(), h = xlsxHoja(l, "Copias");
  const estilo = { negrita: true }, dia = new Date(Date.UTC(2025, 0, 1));
  xlsxCelda(h, 1, 1, dia, estilo);
  estilo.relleno = "FF0000";
  dia.setUTCFullYear(2030);
  xlsxCelda(h, 1, 2, "rojo", estilo);
  // Topes de la hoja
  for (const [f, c] of [[1048577, 1], [1, 16385]]) {
    tiro = null;
    try { xlsxCelda(h, f, c, "x"); } catch (e) { tiro = e.message; }
    assert("A6: fila " + f + ", columna " + c + " fuera de la hoja da error", /fuera de la hoja/.test(tiro || ""), tiro);
  }
  tiro = null;
  try { xlsxCelda(xlsxHoja(xlsxLibro(), "Y"), 1048576, 16384, "última"); } catch (e) { tiro = e.message; }
  assert("A6: la última celda de la hoja vale", tiro === null, tiro);
  h.altos[2000000] = 20;              // fuera de la hoja: se ignora
  // Anchos y altos raros
  h.anchos = ["Infinity", NaN, 300, "12"];
  h.altos[2] = Infinity;
  h.altos[3] = 600;
  const r = leer(xlsxBytes(l, fecha), "a5_a7_copias_topes");
  if (r) {
    const hr = r.hojas.Copias, c = hr.celdas;
    assert("A5: la fecha y el estilo quedan como al escribirla", c.A1.v === "fecha:2025-01-01T00:00:00" && c.A1.b &&
      c.A1.relleno === null && c.B1.relleno === "FFFF0000", [c.A1, c.B1]);
    assert("A6: el alto de una fila fuera de la hoja no se escribe", !("2000000" in hr.altos), hr.altos);
    assert("A7: anchos infinitos o vacíos no se ponen; los grandes, a 255", !("A" in hr.anchos) && !("B" in hr.anchos) &&
      hr.anchos.C === 255 && hr.anchos.D === 12, hr.anchos);
    assert("A7: alto infinito no se pone; el grande, a 409", !("2" in hr.altos) && hr.altos["3"] === 409, hr.altos);
  }
}
{
  // Fechas fuera de lo que Excel enseña; estilos de otro tipo
  const { xlsxFecha } = sandbox;
  const l = xlsxLibro(), h = xlsxHoja(l, "Raros");
  ["1900-01-01", "1900-02-28", "1899-12-31", "0050-06-01", "1900-03-01", "9999-12-31 23:59:59"]
    .forEach((t, k) => xlsxCelda(h, 1, k + 1, xlsxFecha(t)));
  xlsxCelda(h, 1, 7, new Date(Date.UTC(2025, 0, 1, 10, 0, 0, 999)));   // con milésimas
  xlsxCelda(h, 2, 1, 1234.5, { formato: 2 });
  xlsxCelda(h, 2, 2, 1234.5, { formato: '#,##0.00 "€' });
  xlsxCelda(h, 2, 3, 1234.5, { formato: '#,##0.00 \\"x' });          // comilla escrita con \ : vale
  xlsxCelda(h, 2, 4, "verde", { color: "FF00B050", relleno: "#80FFFF00" });
  const r = leer(xlsxBytes(l, fecha), "a8_a9_raros");
  if (r) {
    const c = r.hojas.Raros.celdas;
    assert("A8: antes del 01/03/1900 y años de dos cifras: celda vacía", ["A1", "B1", "C1", "D1"].every(k => c[k].v === null),
      ["A1", "B1", "C1", "D1"].map(k => c[k].v));
    assert("A8: el 01/03/1900 y el 31/12/9999 sí", c.E1.v === "fecha:1900-03-01T00:00:00" &&
      c.F1.v === "fecha:9999-12-31T23:59:59", [c.E1.v, c.F1.v]);
    assert("A8: sin milésimas", c.G1.v === "fecha:2025-01-01T10:00:00", c.G1.v);
    assert("A9: formato que no es texto o con una comilla suelta: no se aplica", c.A2.fmt === "General" &&
      c.B2.fmt === "General" && c.A2.v === 1234.5, [c.A2.fmt, c.B2.fmt]);
    assert("A9: comilla escrita con \\ sí vale", c.C2.fmt === '#,##0.00 \\"x', c.C2.fmt);
    assert("A9: colores de 8 cifras", c.D2.color === "FF00B050" && c.D2.relleno === "80FFFF00", [c.D2.color, c.D2.relleno]);
  }
}

// ---------- Excel ----------
const libros = fs.readdirSync(dir).filter(f => f.endsWith(".xlsx")).sort();
const excel = abrirConExcel(libros.map(f => path.join(dir, f)));
if (excel === null) console.log("  (sin Excel en este ordenador: no se abren con él)");
else libros.forEach((f, i) => assert(f + ": Excel lo abre sin repararlo", excel[i] === "ok", excel[i]));

fs.rmSync(dir, { recursive: true, force: true });

console.log("\n" + ok + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
