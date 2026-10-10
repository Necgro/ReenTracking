---
name: auditar-paso
description: Auditoría de un paso o una fase de la app Reental para encontrar fallos antes de darlo por cerrado, con revisores nuevos que no han visto cómo se programó y cada fallo comprobado con un guion. Úsalo cuando el usuario escriba /auditar-paso, pida «revisar», «repasar» o «auditar» un paso o una fase buscando fallos, y siempre al cerrar un paso o una fase (README, «Cómo se trabaja»), después del /simplify.
---

# Auditar un paso

Un repaso hecho a mano suele dejar fallos, algunos graves; esta auditoría los
busca con método. Uso:

- `/auditar-paso` → el paso marcado con ➡️ en `docs/ROADMAP.md`.
- `/auditar-paso NOMBRE-1` → los commits cuyo mensaje empieza por ese
  nombre (también los del «Plan …» de ese paso).
- `/auditar-paso NOMBRE-1 NOMBRE-2` → varios pasos juntos (una fase).
- `/auditar-paso desde <commit>` → todo lo que vino después de ese commit.

Siempre entra también lo que está sin commit en los archivos del paso.

**Durante la auditoría no se cambia código de la app ni de los tests.** Solo
se escriben guiones de comprobación en `privado/evidencias/<paso>/auditoria/`
(fuera de Git).

## Por qué así

- **Revisores nuevos.** Quien escribió el código tiende a darse la razón.
  Por eso la revisión la hacen agentes que no han visto la conversación.
  Tú (la sesión que lanza la skill) solo organizas y resumes: **no descartas
  un fallo comprobado** porque te parezca que está bien. Si no estás de
  acuerdo, lo dices en el informe.
- **Con ejemplo o no cuenta.** Un fallo es «con estos datos o estos pasos →
  pasa esto, y debería pasar esto otro». Sin ejemplo concreto es, como
  mucho, una duda.
- **Comprobado.** Un segundo agente intenta tumbar cada fallo, con un guion
  que lo reproduce siempre que se pueda.
- **Los fallos típicos de este proyecto** están en `patrones.md`, al lado de
  este archivo. Es la guía principal y crece con cada auditoría.

## Pasos

### 1. Delimitar qué se audita (tú)

1. Saca los commits de cada paso con
   `git log -E --format="%h %s" --grep="^(Plan )?<PASO>[ :]"` (el `[ :]`
   evita que `NOMBRE-1` coja también los de `NOMBRE-1b`), o
   `git log <commit>..HEAD`. Si no sale ninguno, pregunta al usuario qué
   audita.
2. Saca la lista de archivos tocados (`git show --stat` de cada commit, más
   `git status`) y el diff completo a un archivo:
   `privado/evidencias/<paso>/auditoria/diff.txt` (crea la carpeta).
3. Busca qué tenía que hacer el paso: su fila en `docs/ROADMAP.md`, su plan
   en `privado/docs/planes/` si lo hay y su entrada del `docs/CHANGELOG.md`
   si ya existe.
4. Mira qué módulos de `js/` toca el paso (las paridades comparan la app
   con sus cifras de referencia, `tests/cifras_referencia/`; si el paso las
   cambia a propósito, enseña al usuario qué cambia antes de regrabarlas:
   README, «Cómo se trabaja»).

### 2. Revisores en paralelo

Lanza **en un solo mensaje** cuatro agentes `general-purpose` con el texto de
abajo, cambiando solo el **ENFOQUE**. El tamaño va **según el riesgo**:

- **Grande** (los cuatro, y la comprobación del paso 3 con un agente por
  cada grupo de hasta 6): si el paso toca cifras fiscales, el motor
  (clasificación o fiscal) o los datos guardados (cache, ajustes, vínculos,
  configuración).
- **Pequeña** (dos revisores, A+B juntos y C+D juntos, y un solo agente
  que comprueba todo): textos, pantalla, tests o documentos.

| Revisor | ENFOQUE | Patrones |
|---|---|---|
| A | Datos raros y casos límite en el código cambiado: lo que falta, `null`, otro tipo, vacío, dos cosas mal a la vez, fechas. | 2, 8, 9 |
| B | Ir y volver: hacer → deshacer, hacer → editar, cargar, repintar o reclasificar a mitad, pulsar dos veces, cambiar de pestaña. ¿Queda todo como antes? | 3, 4 |
| C | Fuera del paso: quién más usa lo que cambió (`grep` de cada función y de cada campo tocado), la misma regla escrita en otro sitio, recuentos y filtros de otras pestañas, avisos, reglas del proyecto. | 5, 6, 7, 10 |
| D | Paridad y tests: si toca el motor, ¿cambian las cifras de referencia solo donde el paso quería? Tests del paso: ¿qué fallo no detectaría ninguno? | 1, 11 |

Texto para cada revisor (rellena lo que va entre `<>`):

```
Eres un revisor que NO ha participado en este trabajo. Tu objetivo es
encontrar fallos reales en el paso <PASO> de la app Reental (contabilidad
fiscal de inmuebles tokenizados: app web Reental-SPA/js/; las paridades
comparan la app con sus cifras de referencia, tests/cifras_referencia/).
No confirmes que está bien: intenta romperlo.

Qué tenía que hacer el paso: <resumen de 3-6 líneas, del plan/ROADMAP>.
Commits: <lista>. Archivos tocados: <lista>. Diff completo:
privado/evidencias/<paso>/auditoria/diff.txt.

Lee primero README.md («Cómo se trabaja» y «Reglas que no se tocan») y
.claude/skills/auditar-paso/patrones.md (fallos que ya han aparecido en
este proyecto; tu enfoque cubre sobre todo los patrones <números>, pero
anota cualquier otro que veas).

ENFOQUE: <enfoque>

Cómo trabajar:
- No te quedes en el diff: abre las funciones enteras, quién las llama y
  los datos que les llegan (cache, los datos de 🚀, archivo de Reental,
  «Ajustes en JSON»).
- No des por bueno algo porque los tests pasen.
- Puedes ejecutar código para comprobar algo: los tests cargan los
  módulos en Node con vm (ver el principio de
  tests/test_arreglos_paso_arreglos1b.js). Guarda tus guiones en
  privado/evidencias/<paso>/auditoria/. NO modifiques ningún otro archivo.
- Ignora estilo, nombres y refactorizaciones que no arreglen un fallo.

Devuelve SOLO una lista (máximo 12, los más importantes primero). Para
cada uno:
- Título corto.
- Dónde: archivo:línea y función.
- Ejemplo: con estos datos o estos pasos → pasa esto; debería pasar esto.
- Gravedad: grave (dato fiscal o importe incorrecto, se pierde lo que el
  usuario hizo, la app o una pestaña no arranca) · molesto (el usuario se
  atasca o la pantalla dice algo falso, pero se puede rodear) · menor
  (raro o solo de aspecto, el dato sigue bien).
- Tipo: fallo · riesgo (puede pasar, no lo has reproducido) · hueco en
  los tests.
- Seguridad: alta (lo has reproducido o se ve sin duda en el código) ·
  media · baja.
- Arreglo en una línea.
Si no encuentras nada en tu enfoque, dilo y explica qué has mirado.
```

### 3. Comprobar cada fallo

Junta las listas, quita repetidos y lanza **en un solo mensaje** un agente
`general-purpose` por cada grupo de hasta 6 fallos (agrupados por módulo)
con este texto:

```
Tu trabajo es comprobar si estos posibles fallos de la app Reental son
reales. Intenta TUMBARLOS: busca la razón por la que no pasarían (una
comprobación antes, un caso que no puede llegar, un test que ya lo cubre,
una regla del proyecto). Reglas del proyecto: README.md, «Reglas que no se
tocan». Decisiones ya tomadas que no son fallo: las que explica un
comentario del código y, si existen, las de privado/docs/planes/.

Para cada uno, siempre que se pueda, escribe un guion pequeño en
privado/evidencias/<paso>/auditoria/ que lo reproduzca (carga los módulos
en Node con vm como tests/test_arreglos_paso_arreglos1b.js)
y ejecútalo. No modifiques ningún otro archivo.

<lista de fallos con su ejemplo y dónde>

Devuelve, para cada uno: CONFIRMADO (con la salida del guion o la línea
que lo prueba) · DESCARTADO (por qué) · SIN CONFIRMAR (qué haría falta
para saberlo). Corrige la gravedad si no es la que toca. Di también si
con los datos de privado/datos_reales/ pasaría (solo si lo puedes saber
sin leerlos; si no, «no se sabe»).
```

### 4. Informe (corto y en llano)

Sin el detalle técnico de los agentes:

```
Auditoría de <PASO>: <N> fallos comprobados (<g> graves, <m> molestos,
<n> menores). <D> descartados.

| # | Gravedad | Qué pasa | Dónde |
|---|---|---|---|
| A1 | grave | Con ... → ... (debería ...) | js/15, ccSoloLoNuevo |

Sin confirmar: <una línea por cada uno, o «ninguno»>.
Huecos en los tests: <una línea, o «ninguno»>.
```

- «Qué pasa» en una o dos frases con el ejemplo, sin nombres de funciones.
- Al final, una o dos líneas de opinión sincera: qué es lo que más importa
  y si conviene arreglarlo antes de seguir.
- Después, **una sola pregunta**: ¿se arreglan ya (un arreglo = su prueba +
  commit) o se apuntan en `privado/docs/planes/arreglos.md`?

### 5. Después

- Si se arreglan: cada uno con su prueba (en el test del paso) y su commit,
  que empiece por `<PASO> A<n>:`. Al terminar, la regresión completa
  (README, «Cómo se trabaja»).
- Si se apuntan: tabla nueva en `privado/docs/planes/arreglos.md` y una
  línea en `docs/ROADMAP.md`.
- **Patrones:** si algún fallo confirmado es de un tipo que no está en
  `patrones.md`, añádelo allí (una línea con su ejemplo, sin datos reales
  ni el nombre del paso). Si dentro de un tipo ya hay muchos ejemplos, no
  añadas más.
- `privado/evidencias/<paso>/auditoria/` se queda en local (no va a Git).
