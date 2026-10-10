# -*- coding: utf-8 -*-
"""Los documentos y el código no dicen «dividendo» (la palabra es
«rendimiento»; ver docs/especificaciones/glosario.md).

Cada «dividend» que queda en el proyecto tiene que estar en uno de estos
grupos (docs/especificaciones/glosario.md, §3 y §4):
  A) columnas del archivo de Reental (`dividend`);
  B) lectura de lo antiguo: la cache (R8), las tablas de nombres antiguos,
     el nombre antiguo del archivo y el contrato 1.0 de reental_datos.json;
  C) el glosario y lo que vigila que la palabra no vuelva (los tests y los
     comentarios que la nombran entre «»);
  D) historia: el registro de cambios y el «Hecho» de la hoja de ruta.
Ademas: el glosario esta en su sitio y los enlaces de los documentos
principales llevan a archivos que existen.

Sin datos del usuario. Ejecucion: python -m pytest tests/test_documentos_paso_rend5.py -q
"""
import os
import re
import subprocess
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORIAL = ()
DE_ANTES = re.compile(
    r"reental_dividendos\.csv|(?<![a-z])(?:RCM_)?DIVIDENDO(?![a-z])|base_dividendos|"
    r"Distribuidor de dividendos|`dividendos`")
ENLACE_HISTORIAL = re.compile(r"div-1-dividendos-desde-csv")


def archivos_del_proyecto():
    salida = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"],
                            cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", check=True)
    return [a for a in salida.stdout.splitlines()
            if a.lower().endswith((".py", ".js", ".html", ".md", ".bat", ".sh", ".json", ".gitignore"))
            and os.path.isfile(os.path.join(RAIZ, a))]


def leer(ruta):
    with open(os.path.join(RAIZ, ruta), encoding="utf-8", errors="replace") as f:
        return f.read()


def grupo(ruta, linea, m, en_hecho):
    """Grupo (A, B, C, D o None) de una aparicion de «dividend»."""
    if ruta.startswith(HISTORIAL) or ruta == "docs/CHANGELOG.md" or en_hecho:
        return "D"
    alrededor = linea[max(0, m.start() - 40):m.end() + 40]
    if ENLACE_HISTORIAL.search(alrededor):
        return "D"
    if DE_ANTES.search(alrededor):
        return "B"
    if not re.match(r"(?i)dividendos?", linea[m.start():m.start() + 10]):
        return "A"                       # «dividend» a secas: la columna de Reental
    if ruta.startswith("tests/") or ruta == "docs/especificaciones/glosario.md":
        return "C"
    if "«" in linea[max(0, m.start() - 12):m.start()]:
        return "C"
    return None


def apariciones():
    """[(ruta, numero de linea, linea, grupo)] de todo el proyecto."""
    res = []
    for ruta in archivos_del_proyecto():
        en_hecho = False
        for n, linea in enumerate(leer(ruta).splitlines(), 1):
            if ruta == "docs/ROADMAP.md" and linea.startswith("## "):
                en_hecho = linea.startswith("## Hecho")
            for m in re.finditer(r"(?i)dividend", linea):
                res.append((ruta, n, linea.strip(), grupo(ruta, linea, m, en_hecho)))
    return res


class TestDocumentos(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.todas = apariciones()

    def test_nada_sin_clasificar(self):
        sueltas = [f"{r}:{n}: {l[:90]}" for r, n, l, g in self.todas if g is None]
        self.assertEqual(sueltas, [])

    def test_se_ha_mirado_de_verdad(self):
        grupos = {g for _, _, _, g in self.todas}
        self.assertTrue({"A", "B", "C"} <= grupos, grupos)
        rutas = {r for r, _, _, _ in self.todas}
        self.assertIn("Reental-SPA/js/02-utilidades.js", rutas)

    def test_documentos_vivos_y_codigo_solo_con_lo_previsto(self):
        """Fuera del historial y de los tests, solo columnas de Reental,
        lectura de lo antiguo y la palabra nombrada entre «»."""
        for ruta, n, linea, g in self.todas:
            if g == "D" or ruta.startswith("tests/"):
                continue
            self.assertIn(g, ("A", "B", "C"), f"{ruta}:{n}: {linea[:90]}")

    def test_el_glosario_esta_en_su_sitio(self):
        glosario = leer("docs/especificaciones/glosario.md")
        for palabra in ("**Rendimiento**", "**Reparto**", "**Inmueble**", "**Íntegro**",
                        "**Recompensa DeFi**", "`reental_rendimientos.csv`",
                        "`catalogo_propiedades`", "`reental_dividendos.csv`"):
            self.assertIn(palabra, glosario)
        for doc in ("README.md", "docs/ROADMAP.md"):
            self.assertIn("especificaciones/glosario.md", leer(doc), doc)

    def test_los_enlaces_llevan_a_archivos_que_existen(self):
        rotos = []
        for doc in ("README.md", "docs/ROADMAP.md", "docs/especificaciones/glosario.md",
                    "docs/especificaciones/archivo-rendimientos-reental.md",
                    "tests/navegador/README.md"):
            texto = leer(doc)
            carpeta = os.path.dirname(doc)
            destinos = re.findall(r"\]\(([^)#]+?\.(?:md|html|js|py))(?:#[^)]*)?\)", texto)
            if doc == "README.md":   # tambien las rutas entre comillas de las tablas
                destinos += re.findall(r"`((?:docs|tests)/[^`*<]+?\.(?:md|html|js|py|sh))`", texto)
            for destino in destinos:
                if destino.startswith("http"):
                    continue
                base = "" if destino.startswith(("docs/", "tests/")) else carpeta
                if not os.path.exists(os.path.normpath(os.path.join(RAIZ, base, destino))):
                    rotos.append(f"{doc} -> {destino}")
        self.assertEqual(rotos, [])


if __name__ == "__main__":
    unittest.main()
