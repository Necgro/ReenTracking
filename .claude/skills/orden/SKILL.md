---
name: orden
description: Paso corto de orden del proyecto Reental (10-15 minutos), de vez en cuando o cuando el usuario lo pida: documentos, evidencias, planes cerrados, pendientes escondidos y archivos sueltos. Úsalo cuando el usuario escriba /orden, pida «ordenar» o «limpiar documentos», o cuando el paso marcado con ➡️ en docs/ROADMAP.md sea de orden.
---

# Paso de orden

El desorden se acumula si ordenar depende de acordarse. Hay dos defensas:

- **La prueba de orden** (`tests/test_orden_paso_orden.py`, dentro de la
  regresión) falla en cuanto aparece algo medible (por ejemplo, enlaces
  rotos, documentos demasiado largos, más de un ➡️ en el ROADMAP o datos
  privados en Git).
- **Este paso**, de vez en cuando (tras unos cuantos pasos o al cerrar una
  fase), para lo que una máquina no ve. **No se toca código** y no lleva
  auditoría grande.

## Pasos

1. **La prueba de orden:** `python -m pytest tests/test_orden_paso_orden.py -q`
   y arreglar lo que diga.
2. **Pendientes escondidos** (lo más importante; lo hace un agente nuevo
   que no haya visto la conversación): en lo que se ha cerrado o marcado
   «hecho ✅» desde el último orden (planes de `privado/docs/planes/`,
   entradas del CHANGELOG, notas), buscar «queda por decidir», «apuntado»,
   «para más adelante», «llega con…», «duda», «asesor». Todo lo que siga
   abierto va a `privado/docs/planes/arreglos.md` o al ROADMAP.
3. **Contradicciones:** el ROADMAP manda. Comparar con él el README, los
   planes vivos y las skills (`.claude/skills/*`): qué está hecho, qué es
   lo siguiente, el orden y las reglas de cierre (README, «Cómo se
   trabaja»).
4. **`privado/evidencias/`:** de los pasos ya cerrados, dejar solo
   resúmenes, informes, resultados, capturas del paso y los guiones de
   fallos aún apuntados en `privado/docs/planes/arreglos.md`; lo demás, a
   la papelera (nunca borrar del todo), después de mirar qué se va. Los
   planes cerrados que valga la pena guardar, a `privado/docs/historial/`.
5. **Archivos sueltos:** `git status` limpio; en la raíz y en cada carpeta,
   solo lo que dicen «Carpetas» y «Dónde va cada cosa» del README; el
   README al día si cambiaron carpetas.
6. **Cierre:** entrada en `docs/CHANGELOG.md` y el ROADMAP al día; commit
   solo con sus rutas (`git commit -- <rutas>`: puede haber otra sesión
   trabajando) y push. Informe de 3-5 líneas: qué se ordenó y qué
   pendiente se rescató, si alguno.

Si un punto necesita una decisión (borrar algo que no está en Git, cambiar
una regla), una pregunta, en llano.
