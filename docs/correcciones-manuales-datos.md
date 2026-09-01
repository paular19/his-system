# Correcciones manuales sobre la base de produccion

Registro de escrituras hechas por fuera de la app (SQL directo o scripts). **No quedan
en el log de auditoria de Prisma**, asi que este archivo es el unico rastro.

Anotar siempre: fecha, que se toco, por que, y como verificar que quedo bien.

---

## 2026-08-25 — 420303 cobrando el doble (5 registros)

**Reportado por:** Paula, revisando el lote 41 (FLORES SILVIA SUSANA).

**Que estaba mal:** 4 filas del codigo `420303` (INTERCONSULTA ESPECIALIZADA EN
INTERNACION) facturaban 34.000,22 con cantidad 1, cuando el valor correcto es
17.000,11 — un solo honorario. Las otras 210 filas activas del mismo codigo ya
estaban bien.

**Causa:** el nomenclador del 420303 solo trae `NPrValEsp`. El override de
`CODIGOS_HE_CON_OPCION_HA` lo espeja sobre `valorAnestesista` para habilitar la
opcion HA. Con los dos componentes en el mismo numero, la inferencia por importe
empataba entre "HE" y "HA", devolvia null, y null significa practica completa:
sumaba los dos honorarios. Detalle que lo delata: cobraba el componente
anestesista pero no asignaba matricula de anestesista.

**Fix de codigo:** commit `a8912f5` — cuando los candidatos empatan, se desempata
con las matriculas cargadas en la practica (solo especialista -> HE, solo
anestesista -> HA). El fix corrige el calculo de ahi en adelante; no reescribe lo
ya guardado, de ahi esta correccion.

**Registros tocados** (una sola transaccion, cada UPDATE guardado por el valor
actual `= 34000.22`):

| tabla | registro | antes | despues |
|---|---|---|---|
| `OrdenPrac` | ing 153, orden 637 it.2 (pra 1370) | 34.000,22 | 17.000,11 |
| `OrdenPrac` | ing 153, orden 639 it.1 (pra 1371) | 34.000,22 | 17.000,11 |
| `OrdenPrac` | ing 191, orden 706 it.1 (pra 1480) | 34.000,22 | 17.000,11 |
| `OrdenPrac` | ing 192, orden 764 it.1 (pra 1550) | 34.000,22 | 17.000,11 |
| `Orden` | ing 153, orden 637 (`OrdImpTotal`) | 49.149,85 | 32.149,74 |
| `Orden` | ing 153, orden 639 (`OrdImpTotal`) | 34.000,22 | 17.000,11 |
| `Orden` | ing 191, orden 706 (`OrdImpTotal`) | 34.000,22 | 17.000,11 |
| `Orden` | ing 192, orden 764 (`OrdImpTotal`) | 34.000,22 | 17.000,11 |
| `Practica` | 1480 (ARGUELLO), `PraImpTotal` | 34.000,22 | 17.000,11 |

Las cabeceras se recalcularon como suma de sus items — coincidian con la suma
vieja y quedaban inconsistentes si se tocaban solo los items.

**Alcance verificado:** barrido de 1.880 filas de orden en todos los lotes
generados. Los lotes afectados eran el 41 (FLORES, 2 filas) y el 26 (AIMO, 1
fila), los dos en `PEN` — nada facturado con el numero equivocado. Los lotes 8 y
25 tenian las mismas filas pero estan anulados. El ingreso 191 (ARGUELLO) no
estaba en ningun lote todavia.

Ademas: **0 codigos** del nomenclador tienen dos componentes con el mismo valor,
asi que el empate solo podia darse por este override y ningun otro codigo puede
caer en el mismo bug.

**Como verificar que sigue bien:**

```sql
SELECT round(op."OprImpTotal" / nullif(op."OprCant", 0), 2) AS unitario, count(*)
FROM "Orden" o
JOIN "OrdenPrac" op ON op."PueNum" = o."PueNum" AND op."OrdNum" = o."OrdNum"
WHERE trim(op."NPrCodig") = '420303' AND o."OrdEstad" <> 'X'
GROUP BY 1 ORDER BY 1;
```

Tiene que dar una sola fila en 17.000,11. Cualquier fila en 34.000,22 significa
que el bug volvio.

**Nota de entorno:** el query engine de Prisma no logra abrir el 5432 contra Neon
desde la sesion de Claude Code (el server no responde al SSLRequest). El driver
HTTP de Neon (`@neondatabase/serverless`, sale por 443) si funciona y fue el que
se uso. Las lecturas de auditoria salieron por ahi tambien.

---

## 2026-08-25 — Verificacion del fix del 420303 (paciente de prueba)

Antes de borrar el paciente de prueba queda anotado lo que mostraba, porque es la
evidencia de que el fix del commit `a8912f5` quedo bien en produccion.

Paciente `ZZTEST, CANTIDADES` (PacID 68391), ingreso 516 ambulatorio, cargado el
2026-08-25 21:16 para reproducir el caso reportado en el lote 41:

| orden | codigo | cantidad | importe | esperado |
|---|---|---|---|---|
| 2563 | 420301 | 2 | 34.000,22 | correcto — 2 x 17.000,11 |
| 2564 | 420303 | 1 | **17.000,11** | correcto — un solo honorario |

Las dos practicas con `PraMatEsp = 9110` y `PraMatAne` en null. Antes del fix esa
combinacion caia en el empate "HE"/"HA" y el 420303 salia 34.000,22; con el
desempate por matricula sale 17.000,11.

---

## 2026-08-25 — Borrado del paciente de prueba ZZTEST

**Que se borro:** el paciente 68391 y todo lo que colgaba de el, en una
transaccion y en orden de FK.

| tabla | filas |
|---|---|
| `OrdenPrac` | 2 |
| `Orden` | 2 |
| `Practica` | 2 |
| `InformeAmb` | 1 |
| `IngresoSubtipo` | 1 |
| `Ingreso` | 1 (ingreso 516) |
| `Paciente` | 1 (PacID 68391) |

**Guardas del script:** aborta si el `PacNomCom` del 68391 no contiene "ZZTEST", y
aborta si el ingreso 516 aparece en algun `LoteFacturacionItem`. No estaba en
ningun lote, asi que no se toco ninguna facturacion.

**Verificacion:** 0 pacientes con ZZTEST en apellido, nombre o nombre completo.

---

## 2026-08-26 — Ingresos sin obra social que no se podian facturar

**Sintoma reportado:** MAIDANA, ROBERTO NARCISO — ambulatorio AMB-223 (IngID 368).
Se tildaba la practica en el panel de facturacion y no la tomaba.

**Causa:** el ingreso tenia `Ingreso.OSID` nulo aunque su orden 1-1707 si tenia
OSID=1 / PosID=1. `cargarOrdenesDesdePrestaciones` cortaba en
`src/modules/facturacion/repository.ts:3330` con "El ingreso no tiene obra social
cargada". Ademas, con `OSID` nulo el ingreso tampoco entraba en el lote de IPSS
(`repository.ts:5492` filtra `whereIngreso.obraSocialId = data.obraSocialId`).

El ingreso quedo sin obra social porque al admitir, `admision-form.tsx` marca
"Paciente particular" automaticamente cuando la ficha del paciente no tiene OS
(`const esParticular = !p.obraSocialId`), deshabilita el combo y guarda el ingreso
con `obraSocialId: null` sin avisar. El audit del alta del 368 (AudID 41603, 2026-08-15
12:14) muestra `"obraSocialId":null`; la ficha del paciente 68346 recien recibio
`obraSocialId: 1` el 2026-08-26 12:47 (AudID 62745), pero eso no reescribe el ingreso.

**Que se corrigio:** los 10 ingresos con `OSID` nulo que ya tenian orden generada.
Cada uno hereda la OS y el plan de su propia orden — en los 10 casos, unanime
OSID=1 (IPSS) / PosID=1.

| IngID | tipo | nro | paciente | practicas | ordenes |
|---|---|---|---|---|---|
| 346 | INT | 173 | BENITEZ, CATALINA | 37 | 6 |
| 364 | INT | 177 | BENITEZ, CATALINA | 25 | 21 |
| 368 | AMB | 223 | MAIDANA, ROBERTO NARCISO | 1 | 1 |
| 369 | AMB | 224 | LEEM, BUGUN SEAN | 1 | 1 |
| 434 | AMB | 267 | PUCA, WALTER TOMAS | 6 | 1 |
| 448 | AMB | 280 | ANGEL, ENRIQUE AMADEO | 1 | 1 |
| 454 | AMB | 283 | VILTE FERNANDA JAZMIN | 2 | 1 |
| 464 | AMB | 289 | RIOS MELANI MAGALI | 1 | 1 |
| 469 | AMB | 292 | ALEMAN, ANA INES | 2 | 1 |
| 513 | INT | 229 | RODRIGUEZ, CARLOS JOSE | 2 | 3 |

```sql
update "Ingreso" i
   set "OSID" = o."OSID", "PosID" = o."PosID"
  from (select distinct on ("IngID") "IngID","OSID","PosID"
          from "Orden" where "IngID" = any($1::int[]) order by "IngID","OrdNum") o
 where i."IngID" = o."IngID" and i."IngID" = any($1::int[]) and i."OSID" is null
```

10 filas actualizadas. Ninguna practica estaba facturada (`PraEstad='F'` = 0 en los
10), asi que no se toco ningun importe ni lote ya armado.

**Verificacion:** quedan 9 ingresos con `OSID` nulo (7 AMB, 2 INT) y **0** de ellos
tiene ordenes, o sea ninguno esta bloqueado para facturar. No se tocaron: no hay de
donde deducirles la cobertura.

**Prevencion:** `crearOrdenInterna` (`src/modules/orden/repository.ts`) ahora, dentro
de la misma transaccion, copia la OS y el plan de la orden al ingreso cuando el
ingreso no tiene ninguna (`updateMany` con `obraSocialId: null` en el where, asi
nunca pisa una cobertura ya cargada).

**Pendiente (no tocado):** el default de "Paciente particular" en
`src/components/admision/admision-form.tsx:122` y `:298`. 22.654 de 54.253 pacientes
(42%) no tienen OS en su ficha — todos ellos se admiten como particular en silencio.
Cambiar ese default es decision de negocio, no un fix mecanico.

---

## 2026-08-26 — MAMANI: sutura partida en dos ordenes que no se podia facturar

**Reportado por:** Paula, sobre `/dashboard/facturacion?numeroOrden=1747&ingresoId=360`.

**Que estaba mal:** el ingreso 360 (INT-176, MAMANI MIGUEL ANGEL) tenia UNA sola
`Practica` del codigo 130110 (SUTURA DE HERIDA, PraID 2973) y DOS ordenes activas
apuntando a ella: la 1747 (HONORARIO ESPECIALISTA, autorizacion 52296834) y la 1748
(DERECHOS, autorizacion 52296873). Facturacion vincula una practica a un solo item de
orden (`resolverVinculosOrdenExistenteFacturacion`, `Map` con clave `practicaId`) y
`Practica` guarda un unico `(PueNum, OrdNum, OprItem)`: solo entraba una de las dos y
la otra quedaba muerta. La practica nunca se pudo facturar (`PraEstad` null).

Ademas las dos ordenes tenian el importe **completo** de la practica (81.579,56 cada
una, 163.159,12 sumadas) en vez de su componente. El prorrateo por subitem entro con
el commit `619c914` (18/08 20:09) y estas ordenes se crearon el 18/08 13:13.

**Que se hizo:** se partio la practica en una fila por componente.

| | PraID | componente | autorizacion | importe | orden |
|---|---|---|---|---|---|
| original | 2973 | HE | 52296834 | 21.930,22 | 1747 |
| nueva | 4208 | GA | 52296873 | 59.649,34 | 1748 |

Los importes salen del nomenclador de 130110 convenio 1 (`NPrValEsp` 21.930,22 +
`NPrValGto` 59.649,34 = 81.579,56, el total que tenia la practica).

Tambien se completo `OprModulo` (estaba null en los dos items) con el componente que
ya traia `OprClasAgrup`, y se bajo `OrdImpTotal` de cada orden a su componente.

**Verificacion:** 0 practicas del ingreso 360 con mas de una orden. La suma de las
ordenes activas del ingreso da 809.253,14 = 727.673,58 (lo ya facturado, que es lo que
el lote 41 tiene guardado para MAMANI) + 81.579,56 (la sutura, todavia sin facturar) +
0,00 (orden 1745, protocolo de laboratorio). El lote 41 (PEN) no se toco: la sutura
nunca estuvo adentro.

**Prevencion:** `generarOrdenesDesdeInternacionAction` (`src/modules/orden/actions/`)
ahora crea una fila de `Practica` por componente cuando parte una practica por
subitem, prorratea tambien el importe de la practica original, y escribe el componente
en `incluyeCodigo` (`OprModulo`) del item.

**Pendiente:** quedan **37 casos** con la misma estructura (una practica, varias
ordenes por componente), ninguno facturado. Solo uno mas esta en un lote pendiente:
ingreso 258 (INT-147, TORRES PAULINA) en el lote 43. En 34 de los 37 los importes ya
estan bien repartidos y solo falta el corte; los que ademas necesitan prorrateo son
PraID 3081 (ing. 282), 3059 y 3060 (ing. 400).

Tres casos aparte, que no son de este bug y no se tocaron:

- ing. 467 (BURGOS, 721012): la practica vale 2.117.380,72 pero solo tiene ordenes HE,
  HA y GA, que suman 1.922.871,67. Falta la orden del ayudante, 194.509,05.
- ing. 470 (VALENCIA, 100404): hay ordenes de anestesista y ayudante en 0,00; el
  nomenclador de ese codigo no trae esos componentes.
- ing. 258 (TORRES, 80720): la practica guarda 537.356,26 (solo el gasto) y sus tres
  ordenes suman 1.134.362,66.

---

## 2026-08-26 — Componente de cirugia guardado sin multiplicar por la cantidad

**Sintoma detectado por la usuaria:** el monto de la orden por escision de escaras de
ROSALES HECTOR BENITO (ingreso 241, lote 43) no cerraba contra el nomenclador.

**Causa:** cuando una practica se parte en subitems (GA/HE/HA/A1) y se carga con
`cantidad > 1`, la ruta de carga desde cirugia guardaba en `Practica.importeTotal` el
valor **unitario** del componente, sin multiplicar
(`src/modules/internacion/repository.ts`, `importeTotal: p.importeTotal ?? null`).

Al facturar, `inferirIncluyeCodigoDesdeImporte`
(`src/modules/facturacion/repository.ts`) divide ese importe por la cantidad para
adivinar que componente es. Con cantidad 2 el objetivo queda a la mitad, no matchea
ningun componente, devuelve `null`, y el fallback trataba la fila como **practica
completa**: facturaba `(esp+ayu+ane+gto) x cantidad`.

**Alcance medido:** 858 practicas con `cantidad > 1` y desglose. **14 rotas** (11
nacieron mal al crear, 3 al editar la cantidad). De esas, 2 ya se habian facturado
infladas, las dos de ROSALES: ordenes 1685 y 1687 a 865.715,24 cada una, cuando
correspondian 46.644,08 (HE) y 483.018,68 (GA). Sobrefacturacion: **1.201.767,72**.
Las otras 12 sub-facturaban.

**Correccion aplicada** (script `tmp-corregir-componentes.ts`, ya borrado):

- 14 `Practica.PraImpTotal` = componente unitario x cantidad.
- 14 renglones de `OrdenPrac.OprImpTotal` en 13 ordenes activas.
- 13 `Orden.OrdImpTotal` recalculados como suma de sus renglones.
- 2 `LoteFacturacionItem.LItImpTotal` ajustados **por diferencia** (no recalculados
  desde cero: el reparto por categoria y las ordenes tomadas por otros lotes las
  decide la app al armar el lote).
- Totales de los lotes 43 y 30, ambos PEN. Ningun lote confirmado quedo afectado.

Incluye revertir la edicion manual del 2026-08-25 sobre la practica 2691, a la que le
habian puesto el total de la practica (865.715,24) en un renglon que es solo HE.

| lote | antes | despues |
|---|---|---|
| 43 (ACIDSAL) | 34.325.721,57 | 32.882.444,51 |
| 30 (OSECAC) | 79.933,09 | 86.845,29 |

**Verificacion:** 0 practicas con el patron roto entre las corregidas; 0 cabeceras de
orden descuadradas contra sus renglones (13 de 13); las escaras de ROSALES dan
865.715,24 por cirugia, 1.731.430,48 en total, contra 3.174.707,54 antes; el total de
cada lote coincide con la suma de sus items.

**ROSALES tiene 2 cirugias reales** (confirmado por la usuaria): los dos juegos de
ordenes 1586-1589 y 1685-1688 son legitimos. El tercer juego de practicas
(2848-2851) ya estaba anulado.

**Prevencion:** la carga desde cirugia ahora multiplica por la cantidad, el campo del
payload pasa a llamarse `importeBaseUnitario` para que la semantica sea explicita, y
la facturacion (a) reintenta la inferencia contra el importe crudo para leer bien las
cargas viejas y (b) nunca cae en "practica completa" cuando no reconoce el componente:
usa el importe guardado.

**No se toco:** la practica 483 (ingreso 68, 80617 x5). Es del paciente de prueba que
se borro — el ingreso quedo con `PacID` en null, sin orden y sin lote.

**Pendiente:** durante la correccion aparecieron 3 practicas nuevas con el mismo bug,
cargadas el mismo 2026-08-26 entre las 16:41 y las 16:58: PraID 4215, 4222 y 4232
(SULCA PASCUALA, ingreso 456, codigo 340907 x4, 10.639,12 en vez de 42.556,48).
Ninguna tiene orden ni lote todavia. El fix de codigo no estaba deployado cuando se
cargaron.

### Anexo del mismo dia — SULCA PASCUALA (ingreso 456)

Mientras se corregia lo anterior aparecieron 4 cargas de `340907` (radioscopia en
quirofano) x4 para el ingreso 456, todas entre las 16:41 y las 16:58 del 2026-08-26.
Fueron cuatro intentos: cargar, generar orden, anular, recargar.

| PraID | componente | importe que tenia | su orden |
|---|---|---|---|
| 4215 | HE | 1.769,60 | 2657 anulada |
| 4222 | HE | 1.769,60 | 2661 anulada |
| 4225 | GA | 42.556,48 (correcto) | 2667 anulada |
| 4232 | GA | 10.639,12 | 2670 **activa** |

No habia duplicacion facturable: de los cuatro intentos sobrevive uno solo.

Corregido: `PraImpTotal` de 4215 y 4222 a 7.078,40 y de 4232 a 42.556,48; el renglon
2670/2 de 10.639,12 a 42.556,48; la cabecera de la orden 2670 de 431.094,33 a
463.011,69. El ingreso no esta en ningun lote. La practica 4225 no se toco: ya estaba
bien.

Estas ordenes no las genera la ruta de facturacion sino
`generarOrdenesDesdeInternacionAction`, que copia `Practica.importeTotal` tal cual, asi
que aca el importe salio corto en vez de inflado.

**Verificacion:** el barrido completo sobre las practicas con `cantidad > 1` no
devuelve ninguna con el patron roto.

---

## 2026-08-28 — Columnas de importe para medicacion y descartable (DDL)

**Que se toco:** dos `ALTER TABLE` sobre produccion, aplicados por el endpoint SQL
sobre HTTP de Neon (el 5432 no responde desde la terminal):

```sql
ALTER TABLE "MedicacionIngreso"  ADD COLUMN IF NOT EXISTS "MedImporte" numeric(18,2);
ALTER TABLE "DescartableIngreso" ADD COLUMN IF NOT EXISTS "DesImporte" numeric(18,2);
```

**Por que:** el importe de medicacion y descartable en facturacion salia de dos
funciones que lo inventaban a partir del largo del nombre
(`precioFicticioMedicacion` / `precioFicticioDescartable`). Se borraron: ahora el
importe se carga y se edita a mano, y necesita donde guardarse.

**Por que a mano y no `db push`:** trampa 5 del CLAUDE.md — el push borraria
`Paciente_HC_seq` y los indices creados fuera del schema.

Las columnas son nullable a proposito: las filas viejas quedan en `null` y se
muestran en 0, sin inventar un numero. `DesImporte` es unitario; la grilla muestra
unitario x cantidad.

**Verificacion:** `information_schema.columns` devuelve las dos como
`numeric(18,2)` nullable; `Paciente_HC_seq` sigue viva y los 9 indices `idx_%trgm`
siguen presentes despues del ALTER.

---

## 2026-08-28 — Columna de ampollas en medicacion (DDL)

**Que se toco:** un `ALTER TABLE` sobre produccion, por el endpoint SQL sobre HTTP
de Neon:

```sql
ALTER TABLE "MedicacionIngreso" ADD COLUMN IF NOT EXISTS "MedCantidad" integer;
```

**Por que:** la lista de medicacion de facturacion pasa a tener precio por unidad
(ampolla), asi que el importe se guarda unitario y hace falta la cantidad para
calcular el total.

Nullable a proposito: las 5 filas que ya existian quedan en `null` y se leen como
1, o sea que su importe no cambia.

**Verificacion:** la columna figura como `integer` nullable en
`information_schema.columns`; `Paciente_HC_seq` sigue viva y los 9 indices
`idx_%trgm` siguen presentes.

---

## 2026-08-28 — Orden 2174 (LIZARRAGA): 340213 partida en filas x1

**Que se toco:** las practicas del ingreso 466 y los items de la orden 1-2174, por
el endpoint SQL sobre HTTP de Neon.

```sql
UPDATE "Practica" SET "PraCant"=2, "PraImpTotal"=10639.12 WHERE "PraID"=3567;  -- gastos
UPDATE "Practica" SET "PraCant"=2, "PraImpTotal"=3185.28  WHERE "PraID"=3569;  -- especialista
UPDATE "Practica" SET "PraEstad"='X', "PraNumAut"=NULL,
       "PueNum"=NULL, "OrdNum"=NULL, "OprItem"=NULL       WHERE "PraID"=3568;  -- fila duplicada
DELETE FROM "OrdenPrac" WHERE "PueNum"=1 AND "OrdNum"=2174 AND "OprItem"=3;
UPDATE "OrdenPrac" SET "OprCant"=2, "OprImpTotal"=10639.12 WHERE "PueNum"=1 AND "OrdNum"=2174 AND "OprItem"=2;
UPDATE "OrdenPrac" SET "OprCant"=2, "OprImpTotal"=3185.28  WHERE "PueNum"=1 AND "OrdNum"=2174 AND "OprItem"=4;
-- mas el recalculo de Orden.OrdImpTotal, LoteFacturacionItem 518 y LoteFacturacion 45
```

**Por que:** el ingreso se cargo el 21/08, antes del fix `61bb52a` (25/08). El
codigo viejo (`obtenerSubitemsSeleccionados`) traducia "gastos x2" a dos filas x1
con importe unitario en vez de una fila x2, y ademas ignoraba el campo Cantidad de
la practica. La orden quedaba con tres renglones de 340213 x1.

El honorario de especialista habia entrado una sola vez. Se confirmo con la usuaria
que va x2, igual que las otras radiografias cargadas con el mismo bug (ingresos 349,
434, 446, 490). Por eso el total sube: la consolidacion de gastos no mueve plata,
el especialista si.

**Importes:** orden 2174 13.333,17 -> 14.925,81 (+1.592,64). Lote 45 (PEN, "CM
AGOSTO / RX IPS") 165.722,52 -> 167.315,16. El lote deriva sus importes en vivo de
`OrdenPrac`; los campos guardados se actualizaron para que el snapshot no quede
desfasado.

**Verificacion:** el ingreso 466 queda con 340119 x1 1.101,41, 340213 gastos x2
10.639,12 y 340213 especialista x2 3.185,28; la orden tiene 3 items (1, 2 y 4 — el
3 se borro, el hueco de numeracion es intencional) y suma 14.925,81.

**Los demas casos del mismo bug** se consolidaron en la entrada siguiente.

---

## 2026-08-28 — Consolidar el resto de las practicas partidas en filas x1

**Que se toco:** los mismos dos campos que la entrada anterior (`Practica` y
`OrdenPrac`) en 10 grupos de 6 ingresos, por el endpoint SQL sobre HTTP de Neon.
Por cada grupo: la fila de menor `PraID` queda con la cantidad y el importe
sumado, las otras se anulan (`PraEstad='X'`, punteros a orden en null) y sus items
de `OrdenPrac` se borran.

| ingreso | orden | codigo | queda | anuladas | resultado |
|---|---|---|---|---|---|
| 226 | 774  | 340119 gastos | 1569 | 1570, 1571 | x3 3.304,23 |
| 349 | 1557 | 340213 gastos | 2621 | 2622 | x2 10.639,12 |
| 349 | 1557 | 340213 esp.   | 2623 | 2624 | x2 3.185,28 |
| 434 | 2023 | 340213 gastos | 3333 | 3334 | x2 10.639,12 |
| 434 | 2023 | 340213 esp.   | 3335 | 3336 | x2 3.185,28 |
| 444 | 2075 | 430205 esp.   | 3420 | 3421, 3422 | x3 2.952,72 |
| 446 | 2079 | 340213 gastos | 3433 | 3434 | x2 10.639,12 |
| 446 | 2079 | 340213 esp.   | 3435 | 3436 | x2 3.185,28 |
| 490 | 2309 | 340213 gastos | 3753 | 3754 | x2 10.639,12 |
| 490 | 2309 | 340213 esp.   | 3755 | 3756 | x2 3.185,28 |

**Por que:** mismo bug que la entrada anterior (cargas anteriores al fix `61bb52a`
del 25/08). A diferencia del ingreso 466, aca los dos componentes ya habian entrado
con la cantidad correcta: la plata estaba bien y lo unico mal era que se veia como
varios renglones x1.

**Importes:** ninguno se movio. El script verifico `sum(OprImpTotal)` por orden
antes y despues: 774 3.304,23 / 1557 25.206,00 / 2023 20.736,60 / 2075 3.391,50 /
2079 32.612,65 / 2309 33.674,41, iguales en los dos lados. Los lotes 39 y 45 (los
dos PEN) quedaron en 78.696,16 y 167.315,16.

**Guardas del script:** antes de tocar cada grupo verifico que las filas
compartieran ingreso, orden, codigo, componente (`OprClasAgrup`/`OprModulo`) e
importe unitario, y que ninguna estuviera ya anulada.

**Dos casos que NO se tocaron a proposito:**

- **Ingreso 32, 721331 x2 de 18.923,83 (PraID 237 y 238).** No es el bug: 18.923,83
  es el `NPrValAyu` de esa practica, o sea que son el primer y el segundo ayudante
  (A1 y A2). Son puestos distintos y tienen que seguir como dos renglones x1 — es
  justamente lo que el fix `61bb52a` dejo sin agrupar.
- **Ingreso 251, 430205 x3 de 438,78 (PraID 1704-1706).** Es el bug, pero el
  ingreso esta en el **lote 44, confirmado**. Consolidarlo no moveria un peso, pero
  cambia como se imprime el detalle de un lote ya cerrado. Queda para decidir.

---

## 2026-08-28 — Ordenes 1829-1833 (ingreso 282): fecha al 27/08

**Que se toco:** las practicas 3081 y 3087 del ingreso 282, sus items en `OrdenPrac`
y las cabeceras de las ordenes 1-1829 a 1-1833, por el endpoint SQL sobre HTTP de Neon.

```sql
UPDATE "Practica" SET "PraFch"='2026-08-27 15:00:00' WHERE "PraID" IN (3081,3087);
UPDATE "OrdenPrac" SET "OprFch"='2026-08-27 15:00:00' WHERE "PraID" IN (3081,3087);
UPDATE "Orden" SET "OrdFchEmi"='2026-08-27 15:00:00', "OrdFchPed"='2026-08-27 15:00:00'
 WHERE "PueNum"=1 AND "OrdNum" IN (1829,1830,1831,1832,1833);
```

**Por que:** la usuaria intento seis veces (28/08 21:20-21:23) cambiar la fecha de la
practica 3081 desde internacion. La auditoria muestra las seis tandas escribiendo
27/08 en `Practica`, `OrdenPrac` y `Orden`, y ninguna quedo: la transaccion de
`actualizarPractica` no declaraba `timeout` y corria con los 5 s por defecto de
Prisma. Con ~15 operaciones de ~225 ms cada una (la practica 3081 cuelga de cuatro
ordenes) se pasaba del limite y hacia rollback entero. El punto donde cortaba
variaba entre intentos —a veces alcanzaba a tocar la orden 1833, a veces no—, que
es la firma de un timeout y no de un throw. Arreglado en el mismo commit con
`{ timeout: 30000, maxWait: 10000 }`.

**Importes:** sin cambios. El ingreso 282 no esta en ningun lote, asi que mover la
fecha no reubica nada facturado.

**Verificacion:** las cinco ordenes quedan con `OrdFchEmi`/`OrdFchPed` en
2026-08-27 15:00:00 y estado 'A'. Los items 1830/1 (420303) y 1831/1 (431101)
siguen en 17/08 a proposito: son otras practicas que la usuaria no pidio mover, y
la cabecera toma el maximo de los items igual que lo haria la app.

---

## 2026-08-31 — Lote 43: electrocardiogramas facturados a medias (codigo 170101)

**Que se cambio:** siete lineas del lote 43 cobraban un solo componente del
nomenclador en vez del electro completo. Seis cobraban solo el honorario
(15.149,63) y la de LUQUE solo los gastos (3.550,32). El electro vale
HE 15.149,63 + GA 3.550,32 = 18.699,95.

Las siete pasaron a 18.699,95 con la misma forma que las 37 lineas que ya estaban
bien cargadas: `OprClasAgrup='HE+GA'`, `OprModulo=NULL`,
`OprTitularModular='HONORARIO ESPECIALISTA + DERECHOS'`, `OprImprimirDuplicado=true`.

| Paciente | Orden/item | PraID | De | A |
|---|---|---|---|---|
| ARAMAYO | 1089/2 | 2002 | 15.149,63 | 18.699,95 |
| ARGUELLO | 623/1 | 1346 | 15.149,63 | 18.699,95 |
| DIP | 1368/1 | 2344 | 15.149,63 | 18.699,95 |
| LAMAS | 1393/1 | 2376 | 15.149,63 | 18.699,95 |
| LAMAS | 1620/1 | 2751 | 15.149,63 | 18.699,95 |
| PERSAMPIERI | 1819/1 | 3072 | 15.149,63 | 18.699,95 |
| LUQUE | 1835/1 | 3096 | 3.550,32 | 18.699,95 |

Cabeceras recalculadas: las que llevan tambien un 420303 (623, 1089, 1393, 1819)
a 35.700,06; las de un solo item (1368, 1620, 1835) a 18.699,95. En las multi-item
no se toco `OrdTitularModular` ni `OrdImprimirDuplicado` para no mal-etiquetar el
420303.

**LUQUE (ingreso 382):** era UN electro partido en dos cargas. El 18/08 18:27 el
split genero la orden 1834 (`titularModular='HONORARIO ESPECIALISTA'`) y la 1835
(`'DERECHOS'`) con segundos de diferencia, y despues movieron la 1835 al 15/08.
Solo la mitad GA quedo facturada, asi que el lote cobraba 3.550,32 por un estudio
entero. Quedo la orden 1835 completa con fecha 15/08 y se anulo la 1834 junto con
su practica 3097 (`estado='X'`), para que no se facture de nuevo en el proximo lote.

**Por que salieron asi:** al cargar la practica los dos componentes vienen
tildados por defecto (`seleccionPorDefecto` en `componente-selector.tsx`). Alguien
los destildo, o uso el modo de subitems que crea una practica por componente. El
sistema calculo bien: le pidieron componentes sueltos y guardo componentes
sueltos. No hay aviso cuando una practica queda a medias ni cuando su otra mitad
nunca se facturo.

**Importes:** lote 43 pasa de 32.882.444,51 a **32.918.896,06** (+36.451,55).
`LItImpTotal` de los seis ingresos (288, 191, 181, 331, 382, 388) actualizado con
su delta. El lote estaba en PEN y sigue en PEN.

```sql
-- Una sola sentencia con CTEs: o entra todo o no entra nada.
-- objetivo(pue, ord, item, praid, nuevo_cab, unica) =
--   (1,623,1,1346,35700.06,f) (1,1089,2,2002,35700.06,f) (1,1368,1,2344,18699.95,t)
--   (1,1393,1,2376,35700.06,f) (1,1620,1,2751,18699.95,t) (1,1819,1,3072,35700.06,f)
--   (1,1835,1,3096,18699.95,t)
UPDATE "Practica"  SET "PraImpTotal"=18699.95                    -- 7 filas
UPDATE "OrdenPrac" SET "OprImpTotal"=18699.95, "OprClasAgrup"='HE+GA',
       "OprModulo"=NULL, "OprTitularModular"='HONORARIO ESPECIALISTA + DERECHOS',
       "OprImprimirDuplicado"=true                               -- 7 filas
UPDATE "Orden"     SET "OrdImpTotal"=<nuevo_cab>, titular/duplicado solo si unica
UPDATE "Practica"  SET "PraEstad"='X' WHERE "PraID"=3097
UPDATE "Orden"     SET "OrdEstad"='X', "OrdFchEst"=now() WHERE "PueNum"=1 AND "OrdNum"=1834
UPDATE "LoteFacturacionItem" SET "LItImpTotal" = "LItImpTotal" + <delta>  -- 6 filas
UPDATE "LoteFacturacion"     SET "LotImpTotal"=32918896.06 WHERE "LotID"=43
```

**Verificacion:** las 11 lineas de 170101 del lote 43 quedan las 11 en 18.699,95.
El script chequeo antes de escribir que el lote siguiera en PEN, que el total
fuera el medido y que las 7 lineas tuvieran su PraID e importe esperados; aborta
sin tocar nada si algo no coincide.

**Reversion:** estado previo completo en `docs/snapshot-lote43-170101-2026-08-31.json`
(8 practicas, 12 lineas de orden, 8 cabeceras, el lote y sus 6 items).

**Relacionado:** en el mismo dia se arreglo el calculo de la liquidacion (commit
`dd97b1a`), que mandaba el importe entero de estas lineas al honorario del medico.
Con las dos cosas aplicadas, cada electro liquida 15.149,63 al medico y 3.550,32 a
gastos de la clinica.

---

## 2026-09-01 — Ingreso 506: separar la cirugia repartida entre sus cuatro ordenes

**Sintoma:** la orden 1/2510 (HONORARIO ESPECIALISTA de la hernioplastia 80203) no
aparecia en ninguna de las dos vistas de facturacion: ni en pendientes ni en
facturadas. Tampoco se podia facturar.

**Causa:** el estado de facturado vive en la practica (`PraEstad='F'` mas un unico
puntero puesto/orden/item), y la cirugia se cobra repartida por rol con un item de
la MISMA practica en cada orden. La practica 4011 tenia un item en 2510 (especialista),
2511 (anestesista), 2512 (derechos) y 2514 (ayudante 1), y quedo marcada 'F'
apuntando a 2512. Ese unico flag daba por facturadas a las cuatro.

Desde `separarItemEnPracticaPropia` (commit `e693b03`) facturar una orden le da al
item su practica propia, asi que el caso no se repite. Pero esa separacion corre al
facturar, sobre la fila de la grilla de pendientes — y la practica ya marcada no esta
en esa grilla. Quedaba trabado en circulo: para separarla habia que facturarla, y para
facturarla habia que separarla.

**Escritura aplicada** (`scripts/separar-practicas-repartidas.ts --ingreso=506 --aplicar`):

```
INSERT "Practica" x3  -- clones de 4011 en estado 'A', sin puntero, con el importe del item
   4800  135942.83   HONORARIO ESPECIALISTA
   4801  148201.60   HONORARIO ANESTESISTA
   4802   24473.62   AYUDANTE 1
UPDATE "OrdenPrac" SET "PraID"=4800 WHERE ("PueNum","OrdNum","OprItem")=(1,2510,1)
UPDATE "OrdenPrac" SET "PraID"=4801 WHERE ("PueNum","OrdNum","OprItem")=(1,2511,1)
UPDATE "OrdenPrac" SET "PraID"=4802 WHERE ("PueNum","OrdNum","OprItem")=(1,2514,1)
UPDATE "Practica"  SET "PraImpTotal"=841008.66 WHERE "PraID"=4011   -- ya era ese valor
```

La 4011 queda facturada apuntando a 2512 (DERECHOS, 841.008,66). Las otras tres
vuelven a pendientes con su importe, que coincide exacto con el nomenclador de 80203:
especialista 135.942,83, anestesista 148.201,60, ayudante 24.473,62.

**Alcance:** el script barrio toda la base y este era el unico caso. Las otras 15
practicas 'F' referenciadas por varias ordenes son renumeraciones — la segunda orden
esta anulada ('X') —, no repartos por rol, y el script las excluye a proposito:
separarlas resucitaria la orden anulada como pendiente, lista para cobrarse dos veces.

**Verificacion:** `obtenerContextoFacturacion(506)` devuelve las tres nuevas en
pendientes (cada una vinculada a su unica orden) y las filas facturadas siguen siendo
las mismas cuatro de antes (2512#1, 2512#2, 2512#3 y 2653#1). Nada se movio de lugar.

**Relacionado:** en el mismo dia se corrigio el codigo que producia el contagio, para
que facturar una practica no de por facturadas las ordenes que nadie facturo.

---

## 2026-09-01 — Orden 1/2512: la linea de derechos cobraba la cirugia entera

**Sintoma:** la orden 0001-00002512 (DERECHOS del ingreso 506) mostraba la 80203 con
todos los subitems incluidos, cuando esa orden solo cobra los gastos.

**Causa:** el componente que cobra un item de orden se leia solo de `OprModulo`, que
recien se empezo a escribir con el fix de subitems del 2026-08-26 (`1308372`). Las
ordenes anteriores llevan el componente unicamente en `OprClasAgrup`. Sin leerlo, el
item 2512#1 pasaba por practica completa: se listaba con los cuatro subitems y, al
facturar, el importe se recalculo sobre el nomenclador entero.

Que el importe fue reescrito despues se ve en el reparto original: 2510 (HE) 135.942,83,
2511 (HA) 148.201,60 y 2514 (A1) 24.473,62 son exactos, y el A1 es el resto que solo
cierra si la linea de gastos valia 532.390,61 cuando se genero.

**Escritura aplicada** (endpoint SQL de Neon, ingreso 506 no esta en ningun lote):

```
UPDATE "OrdenPrac" SET "OprImpTotal"=532390.61 WHERE ("PueNum","OrdNum","OprItem")=(1,2512,1)
UPDATE "Orden"     SET "OrdImpTotal"=712375.63 WHERE ("PueNum","OrdNum")=(1,2512)
UPDATE "Practica"  SET "PraImpTotal"=532390.61 WHERE "PraID"=4011
```

532.390,61 es el `NPrValGto` de la 80203 en el convenio 1, cantidad 1. Con esto los
cuatro componentes vuelven a sumar el valor de la practica: 532.390,61 + 135.942,83 +
148.201,60 + 24.473,62 = 841.008,66.

**Alcance:** solo esta orden. La base tiene 107 grupos de practica repartida por rol en
varias ordenes vivas (casi todos sin `OprModulo`), y en todos los demas la suma de los
items sigue dando el valor entero de la practica: el reparto solo se rompio aca, porque
esta se facturo y el importe se recalculo.

**Relacionado:** `incluyeCodigoDeItemOrden` en `src/modules/facturacion/repository.ts`
deduce el componente de `OprClasAgrup` cuando `OprModulo` esta vacio, pero solo si el
importe guardado lo confirma. Medido sobre las ordenes vivas sin modulo: 410 items valen
exactamente su componente (reparto real, es lo que el respaldo arregla), 1.762 tienen una
clasificacion que ya es la practica entera (el respaldo no cambia el importe), 96 valen el
total del nomenclador con etiqueta parcial y 133 no coinciden con ninguno de los dos. En
esos ultimos 229 la clasificacion es el titular de la orden, no un reparto: tomarla al pie
de la letra haria cobrar de menos, asi que siguen tratandose como practica completa.

**Los cuatro roles de esta cirugia quedan cubiertos:** 2510 (HE), 2511 (HA) y 2512 (GA)
llevan el componente en `OprClasAgrup` y el importe lo confirma; 1/2514/1 (AYUDANTE 1) no
tiene `OprClasAgrup` pero si `OprModulo='A1'`, que es el campo que se lee primero. Se
generaron por caminos distintos — el de ayudante escribe el modulo y no la clasificacion,
el resto al reves — pero ninguno de los cuatro pasa por practica completa.

---

## 2026-09-01 — Orden 2645: el electro cobraba solo el honorario (codigo 170101)

**Reportado por:** Paula — "orden 2645 no tiene gastos en la practica 170101".

**Que estaba mal:** la orden 1/2645 (ingreso 520, FABIAN CLAUDIA LUZ, OSECAC) cobraba
el electro a 15.149,63, solo el honorario especialista. El electro vale
HE 15.149,63 + GA 3.550,32 = 18.699,95. Mismo caso que las siete lineas del lote 43
corregidas el 31/08, mas abajo en este archivo.

**Causa:** la practica 4196 se cargo el 26/08 15:42:59 ya con 15.149,63, o sea con
derechos destildado en la carga; la orden salio 27 segundos despues arrastrando ese
importe. No hay bug de calculo: el nomenclador tiene el `NPrValGto` y la API lo
devuelve (`buscarPracticas('170101', 1)` -> `valorGastos: 3550.32`), y
`seleccionPorDefecto` tilda los dos componentes. La edicion del 01/09 16:01 desde
facturacion solo guardo el numero de autorizacion, no toco componentes.

**Registros tocados** (una transaccion, cada UPDATE guardado por el valor actual):

| tabla | registro | antes | despues |
|---|---|---|---|
| `Practica` | 4196 (`PraImpTotal`) | 15.149,63 | 18.699,95 |
| `OrdenPrac` | 1/2645 it.1 (`OprImpTotal`) | 15.149,63 | 18.699,95 |
| `Orden` | 1/2645 (`OrdImpTotal`) | 32.149,74 | 35.700,06 |

El item quedo con la misma forma que las 37 lineas bien cargadas y que las siete del
lote 43: `OprClasAgrup='HE+GA'`, `OprModulo=NULL`,
`OprTitularModular='HONORARIO ESPECIALISTA + DERECHOS'`, `OprImprimirDuplicado=true`.
La orden lleva tambien un 420303, asi que no se toco `OrdTitularModular` ni
`OrdImprimirDuplicado` de la cabecera, para no mal-etiquetar el 420303.

**Alcance verificado:** el ingreso 520 no esta en ningun lote (0 filas en
`LoteFacturacionItem`, 0 en `LoteFacturacionOrdenExcluida`), asi que no hubo que
recalcular ningun total de lote y nada salio a la obra social con el numero viejo. El
script chequeo antes de escribir el codigo, la cantidad, los tres importes, el vinculo
practica-item, que la orden siguiera activa y que el ingreso no estuviera en un lote;
aborta sin tocar nada si algo no coincide.

**Tocadas y revertidas el mismo dia — 1/2634, 1/2637 y 1/2638.** Se corrigieron primero
junto con la 2645 y despues se decidio dejarlas en la lista para completar desde la app,
asi que volvieron a su estado original en una tercera transaccion. **Hoy estan como
estaban**: practicas 4181, 4186 y 4188 en 15.149,63, sus items en 15.149,63 y las tres
cabeceras en 32.149,74. Queda anotado porque las escrituras existieron y este archivo es
el unico rastro. Valores restaurados uno por uno, que no eran iguales entre si:

| orden | ingreso | practica | item 1 restaurado a |
|---|---|---|---|
| 1/2634 | 511 (INT-228) | 4181 | `OprModulo='HE'`, `OprClasAgrup=NULL`, `OprTitularModular=NULL` |
| 1/2637 | 400 (INT-190) | 4186 | `OprModulo=NULL`, `OprClasAgrup='HE'`, `OprTitularModular='HONORARIO ESPECIALISTA'` |
| 1/2638 | 508 (INT-226) | 4188 | `OprModulo='HE'`, `OprClasAgrup=NULL`, `OprTitularModular=NULL` |

Las tres con `OprImprimirDuplicado=false`: se midieron antes de revertir los 49 items de
170101 en 15.149,63 que quedan sin tocar en la base y los 49 lo tienen en false.

**Lo que sigue a medias** (medido el 01/09, con la 2645 ya corregida): de 164 practicas
activas de 170101, 78 estan completas y 20 son pares HE+GA cargados en filas separadas.
Quedan **30 a medias** contando por ingreso (25 solo honorario, 5 solo derechos), de las
cuales **23 estan fuera de todo lote**: $93.256,67 sin cobrar. Solo tres ya tienen orden
generada (2074, 2191 y 2486) ademas de las 2634/2637/2638 de arriba; el resto sigue
pendiente, asi que se arreglan desde facturacion tildando el componente que falta, sin
SQL. **Ninguna se toca sin pedido expreso.**

**El origen es siempre la carga manual.** De las 76 practicas de 170101 a medias, 63
tienen su `CREAR Practica` en el audit log y **las 63 nacieron ya con el importe a
medias**; ninguna se creo completa y se recorto despues. Las otras 13 son anteriores al
log. Tampoco hay un camino automatico que las genere: `IngresoElectrocardiograma` tiene
1 sola fila en toda la base.

**Como verificar que quedo bien:** la cabecera 1/2645 en 35.700,06 = 18.699,95 +
17.000,11, y su item 1 con `OprClasAgrup='HE+GA'`.

**Reversion:** `PraImpTotal`/`OprImpTotal` a 15.149,63, `OrdImpTotal` a 32.149,74,
`OprClasAgrup=NULL`, `OprModulo='HE'`, `OprTitularModular=NULL`,
`OprImprimirDuplicado=false`.
