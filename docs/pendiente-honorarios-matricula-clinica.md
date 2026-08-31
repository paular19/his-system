# Pendiente: honorarios cargados con matricula de clinica

**Estado:** abierto, esperando una definicion de la clinica. Nada que arreglar por
codigo hasta entonces.
**Medido:** 2026-08-31, contra la base de produccion.

---

## Que pasa

Hay lineas de `OrdenPrac` que cobran la practica **completa** (honorario + gastos en
la misma fila) pero estan cargadas con la matricula de la clinica: 9995
(internacion) o 9110 (ambulatorio).

La liquidacion las descarta enteras como `gastosDeLaClinica`
(`liquidacion-profesionales/repository.ts`, el chequeo de `esMatriculaClinica`). El
honorario que llevan adentro no se le liquida a **nadie**.

Es el problema espejo del que se arreglo en el commit `dd97b1a`: ahi las lineas
combinadas estaban cargadas con matricula de medico y los gastos de la clinica
terminaban dentro del honorario. Aca es al reves.

**No afecta la facturacion a la obra social.** El importe de cada linea es correcto
y ya esta cobrado. Lo unico en juego es si algun profesional deberia estar
recibiendo un honorario que hoy queda en la bolsa de la clinica.

---

## Numeros

**92 lineas**, con **997.635,03** de honorario adentro.

> Ojo: en una medicion anterior se hablo de "64 lineas". Ese numero contaba solo las
> que tienen etiqueta explicita (`OprClasAgrup` con `+`). Sumando las que se detectan
> porque el importe es la suma del desglose, son 92.

### Por practica

| Codigo | Practica | Lineas | Honorario adentro |
|---|---|---|---|
| **400101** | Arancel global por cada 24 hs | 10 | **824.116,50** |
| 340301 | Radiografia o telerradiografia de torax | 49 | 78.039,36 |
| 170101 | Electrocardiograma | 2 | 30.299,26 |
| 180116 | Ecografia renal bilateral | 4 | 14.012,08 |
| 340421 | Radiografia simple de abdomen | 11 | 13.625,92 |
| 340907 | Radioscopia en quirofano con amplificador | 2 | 10.617,60 |
| 180114 | Ecografia de vejiga o prostata | 3 | 7.008,36 |
| 180111 | Ecografia de testiculos | 1 | 4.737,66 |
| 180120 | Ecografia de partes blandas | 1 | 4.737,65 |
| 340905 | Radiografia en quirofano | 1 | 2.300,48 |
| 340209 | Radiografia de raquis | 1 | 1.592,64 |
| 340211 | Radiografia de hombro/humero | 1 | 1.592,64 |
| 340213 | Radiografia de codo/antebrazo | 1 | 1.592,64 |
| 340302 | Por exposicion subsiguiente (torax) | 3 | 1.592,64 |
| 340906 | Radiografia en quirofano | 1 | 1.238,72 |
| 340210 | Por exposicion subsiguiente (raquis) | 1 | 530,88 |

### Por lote

| | Lineas | Honorario adentro |
|---|---|---|
| Sin lotear | 61 | 729.914,47 |
| Lote 41 (PEN) | 7 | 9.732,80 |
| Lote 43 (PEN) | 24 | 257.987,76 |

**Ningun lote confirmado esta afectado.** No hay liquidacion cerrada que haya dejado
de pagar un honorario.

---

## El 400101 probablemente esta bien

Diez lineas de `400101` (arancel global por cada 24 hs de atencion) son el **83 %**
del total: 824.116,50 de los 997.635,03.

El arancel global es el dia-cama: una facturacion de la clinica de punta a punta. El
nomenclador le asigna un `NPrValEsp` de 27.470,55 sobre 405.551,32 (6,8 %), pero eso
no es el honorario de ningun medico en particular. Cargarlo con 9995 es correcto.

Si se confirma que el 400101 queda afuera, lo que realmente esta en discusion baja a
**173.518,53** en 82 lineas de radiologia y ecografia.

---

## Lo que hay que definir

**Quien informa las radiografias y las ecografias.**

En la radiografia de torax (`340301`) el nomenclador reparte 1.592,64 de honorario y
4.432,97 de gastos. Las 49 lineas estan facturadas enteras a la clinica.

- Si las lee un radiologo, esos 1.592,64 por placa son suyos y hoy no los cobra.
- Si las informa la clinica, esta bien como esta.

No se puede deducir de los datos. El unico profesional que trae la orden es el
**prescriptor** —quien pidio el estudio, no quien lo informo— y son medicos de sala
variados: TOMA ENGEL, GUTIERREZ MATORRAS, PARDO, IGLESIAS, MUNOZ.

Preguntas concretas para cerrar el tema:

1. El `400101` (arancel global): confirmar que es de la clinica y queda afuera.
2. Radiografias (`3403xx`, `3404xx`, `3409xx`): quien informa. Si es un radiologo,
   cual es su matricula.
3. Ecografias (`1801xx`): lo mismo.
4. Los dos electros (`170101`) con matricula de clinica: revisar caso por caso, son
   solo dos y el honorario es el 81 % del precio, asi que ahi el error se nota.

---

## Como se arregla, una vez definido

**No por codigo.** La linea no tiene matricula de medico, asi que no hay a quien
asignarle el honorario: no es un problema de calculo sino de carga.

Dos caminos, segun lo que se defina:

- **Dejarlo como esta** para las practicas donde informa la clinica. Cero trabajo.
- **Reasignar** las que correspondan: cargar la practica con la matricula de quien
  informa, o partirla en dos lineas (honorario con la matricula del medico, gastos
  con 9995) como ya hace la app cuando se tildan los componentes por separado.

Como todo lo afectado esta en lotes PEN o sin lotear, se puede corregir el dato sin
rehacer ninguna liquidacion.

---

## Como regenerar la medicion

El resolver que detecta estas lineas ya esta en el repo:
`porcionGastosDeLineaCombinada` en `src/modules/liquidacion-profesionales/subitem.ts`.

Una linea entra en esta lista si `OprMatric IN (9995, 9110)` y
`porcionGastosDeLineaCombinada()` devuelve un valor (o sea, la fila cobra varios
componentes). El honorario adentro es `OprImpTotal - porcionGastos`.

Script `tmp-*.ts` en la raiz + `npx tsx`, consultando por el endpoint HTTP de Neon
(el 5432 esta bloqueado desde la terminal; ver el resto de `docs/`).

---

## Relacionado

- Commit `dd97b1a` — el arreglo del calculo para el caso inverso (lineas combinadas
  con matricula de medico).
- `docs/correcciones-manuales-datos.md`, entrada del 2026-08-31 — la correccion de
  los electros del lote 43.
