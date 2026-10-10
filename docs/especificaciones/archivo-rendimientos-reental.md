# Archivo de rendimientos de Reental

> Formato del archivo (un CSV) que se descarga de app.reental.co y se carga
> en 🚀 Puesta en marcha. Para las pruebas con datos propios va en
> `privado/datos_reales/reental_rendimientos.csv` (fuera de Git; con el
> nombre antiguo, `reental_dividendos.csv`, también se lee). Es la fuente de
> verdad de los rendimientos. Las columnas son de Reental y llevan sus
> nombres (`dividend`…). Palabras: [`glosario.md`](glosario.md). Los
> importes de los ejemplos son **inventados**.

## Formato general

- Comas como separador y campos entre comillas; los importes llevan **coma
  decimal** (`"9,5"`).
- Una fila por reparto (inmueble + periodo) y wallet.
- Una sola transacción puede reinvertir **varios repartos**: esas filas
  llevan el **mismo hash** en `reinvests`.
- Reental tarda un poco en anotar una reinversión: un CSV bajado justo
  después puede traer todavía la fila como pendiente.
- Las listas de hashes van serializadas: `"[""0x…""]"`, que sin las
  comillas del CSV es `["0x…"]`; vacía = `[]`.
- Cabecera:
  `id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date`.
  La app lee las columnas por su nombre, así que el orden da igual, sin
  distinguir mayúsculas ni espacios.

## Lo que no se entiende

Si algo no se entiende, la app **no lo usa**: no carga el archivo y
conserva el anterior, diciendo la fila y la columna. Nunca lo cambia por 0.

- Tienen que estar `dividend`, `date`, `distributed`, `retained`,
  `reinvested`, `claimed` y `reinvests` (un archivo separado por «;», el
  de Excel en español, no las tiene). `claims` y `wallet` pueden faltar en
  archivos antiguos: sin `claims`, un reclamo queda sin hash y a revisar;
  sin `wallet`, no se mira de quién es cada fila.
- El archivo, en UTF-8 (con o sin BOM): guardado como ANSI desde Excel, no.
- Importes: vacío = 0; `9`, `9,5` o `1.234,56` (con coma, el punto es de
  miles; sin coma, decimal). Texto, «NaN», negativos o `1 000,5`, no.
- Listas de hashes: `["0x…"]`, con comillas simples o dobles, sin
  comillas, un hash suelto o sin `0x` valen; repetidos, una vez. Algo que
  no es un hash de 64 cifras (una lista sin cerrar, un hash cortado), no.
- `date`: ISO (`2026-06-30`, con hora y con `Z` o `+01:00`; **sin zona,
  UTC**) o un timestamp en segundos. `30/06/2026`, `2026-02-30` o `24:00`,
  no. Una fila con `date` vacía sale a revisar.
- Las filas sin nada no cuentan, tampoco para el nº de fila de las notas.
- Un archivo con solo la cabecera: la app no lo carga.
- Una fila de otra wallet (ni la tuya ni tu vault) sale a revisar.

## Columnas

| Columna | Qué es | Uso en la app |
|---|---|---|
| `id` | Id de la fila en Reental | No se usa |
| `dividend` | Inmueble y periodo, p. ej. «Toledo 1 #3/2025» | Inmueble (lo de antes de «#») y periodo |
| `hashId` | Id interno de Reental; no es un hash on-chain útil | No se usa |
| `wallet` | Wallet del inversor | Se guarda normalizada |
| `distributed` | **Íntegro** repartido | Ingresos íntegros del rendimiento (`integro_usdt`), también si parte está pendiente |
| `retained` | **Retención** practicada por Reental; 0 si no la hay | Retención del rendimiento (`retencion_usdt`) |
| `reinvested` | Parte **reinvertida** (sin retención) | Suma al importe |
| `claimed` | Parte **reclamada, neta**: lo que llega a la wallet o al vault | Suma al importe |
| `claims` | Hashes on-chain de los **reclamos** | Índice hash → filas, junto con `reinvests` |
| `reinvests` | Hashes on-chain de las **reinversiones** (movimientos del vault) | Índice hash → filas |
| `date` | Fecha del **reparto** (UTC), no la del reclamo: el día en que Reental pone el rendimiento a disposición del inversor. Casi siempre es el último día del mes que paga (p. ej. `#12/2024` → 31/12/2024); alguna vez, uno de los primeros días del mes siguiente | Fecha del reparto (`fecha_reparto`): decide el ejercicio del rendimiento, haga después lo que haga con él |

Lo lee `cargarCsvRendimientos` (`js/10-csv-descubrimiento.js`), por el
nombre de cada columna.

## Token en el que se paga

Los rendimientos se pagan en **USDT de Polygon**, que ahora se llama
**USDT0** (Tether lo actualizó sin cambiar la dirección del contrato,
`0xc2132d05d31c914a87c6611c10748aeb04b58e8f`). En la cache y en el libro
aparece como «USDT0»; la app lo reconoce por la dirección, así que es la
misma stablecoin.

## Cuadre de cada fila

`distributed = reinvested + claimed + retained` cuando todo el reparto se ha
reinvertido o reclamado (cuadra al céntimo). Si da **menos**, la diferencia
está **pendiente**: ni reclamada ni reinvertida. Nunca debería dar más.

## Casos (importes inventados)

| Caso | `distributed` | `reinvested` | `claimed` | `retained` | `claims` | `reinvests` |
|---|---|---|---|---|---|---|
| Reinvertido | 10 | 10 | 0 | 0 | `[]` | `[hash]` |
| Reclamado, con retención del 19 % | 10 | 0 | 8,1 | 1,9 | `[hash]` | `[]` |
| Reclamado, sin retención | 10 | 0 | 10 | 0 | `[hash]` | `[]` |
| Pendiente | 10 | 0 | 0 | 0 | `[]` | `[]` |

- Reental retiene **solo en algunos inmuebles** y **solo al reclamar**; al
  reinvertir, nunca. La app no lo supone: toma `retained` tal cual.
- **Pendiente** (sin ningún hash): sale como rendimiento `RCM_PENDIENTE`
  («rendimiento pendiente (ni reclamado ni reinvertido)»), en el ejercicio
  del reparto con su íntegro y retención 0, con el campo `hash` vacío. Si
  luego ya llegó su cobro a la blockchain (el archivo es anterior a que
  Reental lo anotara), el cobro pasa a revisar: ya cuenta con la fila.
- **Clave de cada rendimiento:** `csv::<dividend>::<fecha del reparto>` en
  minúsculas, tenga hash o no, y `::2`, `::3`… si dos filas la repiten, en
  el orden del archivo. Sale solo de la fila: no cambia si Reental anota el
  hash más tarde, cambia el orden de las filas o el inmueble cambia de
  contrato. Una fila sin hash pero con algo reinvertido, reclamado o
  retenido sale igual, a revisar.
- **Reclamo parcial** (la app de Reental deja reclamar el 25, 50, 75 o 100 %):
  no se ha visto aún en el CSV. Se espera que la parte no reclamada quede
  como pendiente; comprobarlo con el primer caso real.

## Correspondencia con el diálogo «Confirmar retirada» de Reental

| Diálogo de Reental | Archivo | Renta Web |
|---|---|---|
| Cantidad a reclamar | `claimed + retained` (el íntegro) | Ingresos íntegros |
| Cantidad retenida | `retained` | Retenciones |
| Cantidad a recibir | `claimed` (el neto) | No se declara |
