#!/bin/sh
# Regresión del proyecto (README §7.2). El trabajo lo hace regresion.js, al
# lado de este archivo: corre los tests en paralelo, arranca solo el
# servidor de la SPA si hace falta y enseña solo lo que falla.
#
# Uso (desde cualquier carpeta):
#   sh tests/navegador/regresion.sh          (completa, con Chrome)
#   sh tests/navegador/regresion.sh corta    (sin Chrome)
exec node "$(dirname "$0")/regresion.js" "$@"
