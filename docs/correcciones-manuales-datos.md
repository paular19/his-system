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

---

## 2026-09-02 — BENITEZ, CATALINA figuraba con IPS siendo particular

**Reportado por:** Paula.

**Que estaba mal:** la ficha de la paciente (PacID 68340, HC 68335) estaba bien
—`obraSocialId` null, particular— pero sus dos internaciones, INT-173 (IngID 346) e
INT-177 (IngID 364), tenian `OSID = 1` (IPSS). Nadie lo cargo a mano: lo escribio el
sistema.

**Causa (cadena de tres pasos):**

1. No existia ninguna obra social PARTICULAR en la tabla `ObraSocial` (88 filas, ni
   id 500 ni ningun nombre con PARTICULAR / SIN COBERTURA / PRIVADO).
2. `Orden.OSID` es NOT NULL, asi que la orden de un particular necesita un OSID.
   `resolverObraSocialParticularId()` agotaba sus fallbacks y terminaba en
   "primera OS activa por id" — que en esta base es la **1, IPSS**. Toda orden de un
   paciente sin cobertura salia a nombre del IPS.
3. El write-back de `crearOrden` (commit 6b45d32) le copiaba al ingreso la OS de la
   orden cuando el ingreso tenia OSID nulo. Asi el IPS pasaba de la orden al ingreso.

Se habia corregido a mano dos veces (31/08 13:40 y 01/09 11:08, usuario `user_3GrKO`)
y las dos veces se volvio a pisar con la siguiente orden: 31/08 14:07 y 01/09 14:04.

**Que se escribio:**

- Alta de `ObraSocial` id **500 "PARTICULAR"** (estado A) y su `PlanObraSocial`
  (500, 1) "PARTICULAR". Sin nomenclador propio: las practicas de un particular
  siguen valorizandose con el convenio 1, que es el unico que existe.
- `Ingreso` 346 y 364: `OSID`, `PosID` y `IngOSNroAf` a null. 2 filas.

**Cambios de codigo que acompanan (para que no se vuelva a pisar):**

- `src/lib/obra-social-particular.ts` (nuevo): `resolverObraSocialParticularId()` ahora
  corta con error explicito si no hay OS PARTICULAR, en vez de inventar la primera OS
  activa.
- `src/modules/orden/repository.ts`: el write-back ya no hereda la OS al ingreso cuando
  la orden es PARTICULAR. `Ingreso.OSID = null` sigue siendo lo que el sistema entiende
  por particular — los lotes particulares filtran por null.
- `src/modules/facturacion/repository.ts`: los dos "El ingreso no tiene obra social
  cargada" ya no cortan; emiten contra la OS PARTICULAR.

**Como verificar:**

```sql
SELECT "IngID", "OSID", "PosID" FROM "Ingreso" WHERE "IngID" IN (346, 364);
-- OSID y PosID deben quedar en NULL
SELECT "OSID", "OSNom" FROM "ObraSocial" WHERE "OSID" = 500;
```

### Segunda tanda (mismo dia): los 9 ingresos y las ordenes de BENITEZ

**Ingresos pasados a particular** (`OSID` y `PosID` a null). Los 9 tenian `OSID = 1`
puesto por el sistema, paciente particular y sin nro de afiliado en ningun lado:

| IngID | Ingreso | Paciente | HC |
|-------|---------|----------|----|
| 346 | INT-173 | BENITEZ, CATALINA | 68335 |
| 364 | INT-177 | BENITEZ, CATALINA | 68335 |
| 369 | AMB-224 | LEEM, BUGUN SEAN | 68342 |
| 434 | AMB-267 | PUCA, WALTER TOMAS | 68362 |
| 448 | AMB-280 | ANGEL, ENRIQUE AMADEO | 68368 |
| 469 | AMB-292 | ALEMAN, ANA INES | 68376 |
| 513 | INT-229 | RODRIGUEZ, CARLOS JOSE | 68383 |
| 605 | AMB-382 | GODOY, ROBERTO OMAR | 68404 |
| 619 | AMB-392 | MORALES, JUAN CARLOS | 68412 |

**Ordenes de BENITEZ pasadas a PARTICULAR:** las 36 ordenes de los ingresos 345, 346 y
364 pasaron de `OSID/PosID = 1/1` (IPSS) a `500/1` (PARTICULAR). 32 activas + 4 anuladas.

No hubo que refacturar: `resolverReglaFacturacion` da `IPS_100` para IPSS y
`DEFAULT_100` para PARTICULAR, y las dos son 100% del nomenclador con 0% de cargo al
paciente. Se verifico antes de escribir (el script aborta si difieren). La suma de
importes quedo igual: **4.717.488,95** antes y despues. El `NConCodig` de los 45 items
de `OrdenPrac` sigue en 1, que es el unico convenio del nomenclador.

**Como verificar:**

```sql
SELECT "IngID", "OSID", "PosID" FROM "Ingreso"
 WHERE "IngID" IN (346,364,369,434,448,469,513,605,619);  -- todos NULL

SELECT "OSID", "PosID", COUNT(*), SUM("OrdImpTotal") FROM "Orden"
 WHERE "IngID" IN (345,346,364) GROUP BY 1,2;             -- 500 / 1 / 36 / 4717488.95
```

**Pendiente (NO corregido):**

- **9 ordenes de los otros 7 pacientes** siguen a nombre de IPSS, aunque su ingreso ya
  quedo en particular: ing 369, 434, 448, 469, 605, 619 (1 orden cada uno) y 513
  (3 ordenes). Todas en estado A. Se corrigen igual que las de BENITEZ.
- **Consultar con administracion**, no son el mismo caso: los ingresos **355**
  (AMB-216, ZERPA SONIA DANIELA, HC 48491, afiliado 39040912) y **464** (AMB-289,
  RIOS MELANI MAGALI, HC 48249, afiliado 43375353) tienen IPS y **si** tienen nro de
  afiliado. Ahi el faltante esta en la ficha del paciente, que quedo sin obra social.
  Si son IPS reales hay que completar la ficha, no sacarles la cobertura.

### Tercera tanda (mismo dia): ZERPA y RIOS, los dos casos que habia que consultar

Los dos tenian IPS en el ingreso y nro de afiliado, pero por motivos opuestos. Lo
decisivo fue el log de auditoria, no el dato en si:

- **ZERPA (ing 355)** se creo el 14/08 16:26 ya con `obraSocialId: 1` **y**
  `numeroAfiliado: "39040912"`, por `user_3F2ZR`. Una persona eligio IPS y tipeo el
  afiliado: cobertura real. El write-back del bug nunca escribio afiliados, solo la OS.
- **RIOS (ing 464)** se creo el 21/08 12:36 con `obraSocialId: null` y sin afiliado. El
  IPS le llego 18 segundos despues via el write-back de la orden 2171: era contagio.

Confirmado con admision: ZERPA es afiliada (el numero bueno es el DNI), RIOS es
particular.

**ZERPA SONIA DANIELA — PacID 55888, HC 48491 — se completa la ficha:**

| Registro | Antes | Despues |
|----------|-------|---------|
| `Paciente` 55888 `OSID`/`PosID` | null / null | 1 / 1 (IPSS) |
| `Paciente` 55888 `PacOSNroAf` | 30040912 | 30040912 (sin cambio) |
| `Ingreso` 355 `IngOSNroAf` | 39040912 | 30040912 |
| `Orden` 1/1597 `OrdNumAfil` | 39040912 | 30040912 |

El 39040912 era un dedazo en el segundo digito: el IPS usa el DNI como numero de
afiliado (11.246 de 13.461 pacientes IPSS de la base). Se unifico con el DNI en los tres
lugares para que la planilla al IPS salga con el numero correcto. La OS del ingreso y de
la orden no se toco: ya estaba bien.

**RIOS MELANI MAGALI — PacID 61382, HC 48249 — se pasa a particular:**

| Registro | Antes | Despues |
|----------|-------|---------|
| `Ingreso` 464 `OSID`/`PosID` | 1 / 1 (IPSS) | null / null |
| `Orden` 1/2171 `OSID`/`PosID` | 1 / 1 (IPSS) | 500 / 1 (PARTICULAR) |

Importe sin cambios (17.000), por lo mismo que en BENITEZ: `IPS_100` y `DEFAULT_100`
son las dos 100% del nomenclador sin cargo al paciente.

**Como verificar:**

```sql
SELECT "OSID", "PosID", "PacOSNroAf" FROM "Paciente" WHERE "PacID" = 55888;  -- 1 / 1 / 30040912
SELECT "OSID", "IngOSNroAf"          FROM "Ingreso"  WHERE "IngID" = 355;    -- 1 / 30040912
SELECT "OSID", "PosID"               FROM "Ingreso"  WHERE "IngID" = 464;    -- NULL / NULL
SELECT "OSID", "PosID"               FROM "Orden"    WHERE "PueNum" = 1 AND "OrdNum" = 2171;  -- 500 / 1
```

**Pendiente (NO corregido):**

- La ficha de RIOS conserva `PacOSNroAf = 43375353` (su propio DNI, puesto por el import
  legacy) aunque ya esta confirmada como particular. Es 1 de las 18.709 fichas con
  afiliado y sin obra social; no se limpio para no mezclarlo con esta correccion.
- Siguen las **9 ordenes** de los otros 7 pacientes contagiados a nombre de IPSS
  (ing 369, 434, 448, 469, 605, 619 con una cada uno; 513 con tres), con el ingreso ya
  en particular.

---

## 2026-09-02 — Los 22 electros a medias de la lista (codigo 170101)

**Pedido por:** Paula, con la lista de la revision del 01/09 pegada en el chat.

**Que estaba mal:** 22 practicas de 170101 cobraban un solo componente. 21 tenian solo
el honorario (15.149,63) y CERVANTES (INT-197) solo los derechos (3.550,32). El electro
completo vale HE 15.149,63 + GA 3.550,32 = 18.699,95. Todas fuera de todo lote.

**Causa, verificada una por una:** es siempre la carga. De las 76 practicas de 170101 a
medias que habia en la base, 63 tienen su `CREAR Practica` en el audit log y **las 63
nacieron ya con el importe a medias**; ninguna se creo completa y se recorto despues. Las
otras 13 son anteriores al log. No hay camino automatico que las genere:
`IngresoElectrocardiograma` tiene 1 sola fila en toda la base. Cuatro de estas
(ARMENDARIZ, VARELA, VALENCIA, LIENDRO NIEVA) ademas pasaron por ediciones posteriores
desde facturacion — autorizacion, matricula — y ninguna corrigio el importe.

**Que se escribio** (una transaccion, tres sentencias en bloque):

- `Practica`: **22 filas** de `PraImpTotal` a 18.699,95 (guardadas por `=15.149,63 OR
  =3.550,32`). 18 no tenian orden generada, asi que con la practica alcanza: `Practica`
  no guarda los componentes en ningun campo, solo el importe, y 18.699,95 es la practica
  completa para `inferirIncluyeCodigoDesdeImporte`.
- `OrdenPrac`: **4 filas** (las que si tenian orden) a 18.699,95 con la forma de siempre:
  `OprClasAgrup='HE+GA'`, `OprModulo=NULL`,
  `OprTitularModular='HONORARIO ESPECIALISTA + DERECHOS'`, `OprImprimirDuplicado=true`.
- `Orden`: **4 cabeceras** de 32.149,74 a 35.700,06. Las cuatro llevan tambien un 420303,
  asi que no se toco `OrdTitularModular` ni `OrdImprimirDuplicado`.

| orden | ingreso | practica | paciente |
|---|---|---|---|
| 1/2518 | 481 (INT-216) | 4022 | ROSALES |
| 1/2634 | 511 (INT-228) | 4181 | OCHOA |
| 1/2637 | 400 (INT-190) | 4186 | PEREZ CRUZ |
| 1/2638 | 508 (INT-226) | 4188 | ARAOZ |

Las 2634, 2637 y 2638 son las mismas que se habian corregido y revertido el 01/09; esta
vez quedan corregidas. La 2518 (ROSALES) figuraba como pendiente en la lista del 01/09 y
en realidad ya tenia orden: se detecto al remedir antes de escribir.

**Matriculas:** no se tocaron. Las 21 que ya tenian el honorario conservan su
`PraMatEsp` (1767 en 19 casos, 5071 en MAIDANA). CERVANTES, que era la de solo derechos,
ya traia 5071 — una matricula de medico real, no la 9995 de gastos — asi que al
completarla el honorario queda atribuido bien.

**Guardas:** por cada practica se verifico codigo 170101, cantidad 1, estado distinto de
X, que el importe fuera exactamente uno de los dos componentes, que el ingreso no
estuviera en ningun lote y que el puntero a orden fuera el esperado; por cada orden, que
el item 1 vinculara a su practica, los dos importes y que la cabecera siguiera activa y
con mas de un item. Las tres sentencias van con su valor anterior en el WHERE y el
conteo se chequea adentro de la transaccion (22/4/4) antes de commitear.

**Nota operativa:** el primer intento fue con 30 UPDATE de a uno y **murio por el timeout
de 5s de la transaccion interactiva de Prisma** contra Neon pooled (P2028). El rollback
fue limpio — se verifico que las 22 seguian en su importe viejo antes de reintentar. La
version que entro hace tres sentencias en bloque con `timeout: 30000`.

**Alcance:** las 170101 activas pasan de 78 a 98 completas. Quedan **4 a medias fuera de
lote** — VARELA (2074), VALENCIA (2191), LIENDRO NIEVA (2486) y BETTELLA (pra 4833, sin
orden), que no estaban en la lista — y **7 dentro de lotes ya armados** (FLORES x2,
GUZMAN, ARANCIBIA, DIP, MARTINEZ, LAMAS), que no se tocan sin recalcular tambien
`LItImpTotal` y el total del lote.

**Como verificar:** ninguna practica activa de 170101 fuera de lote deberia quedar en
15.149,63 ni en 3.550,32 salvo esas 4. Las cuatro cabeceras de arriba en 35.700,06.

**Reversion:** `PraImpTotal` de las 22 a 15.149,63 — menos la 3312 (CERVANTES), que
vuelve a 3.550,32 — y las 4 ordenes como se detalla en la entrada del 01/09.

---

## 2026-09-02 — Las 4 que faltaban del 170101 (VARELA, VALENCIA, LIENDRO NIEVA, BETTELLA)

Cierra la correccion de la entrada anterior: eran las unicas cuatro que quedaban a
medias fuera de lote. Tres estaban afuera de la lista porque se habian marcado como "ya
tienen orden" y una (BETTELLA) se corto al copiar la lista.

**Que se escribio** (una transaccion, tres sentencias en bloque, mismas guardas):

| practica | ingreso | orden | que se toco |
|---|---|---|---|
| 4833 | 518 (INT-230) BETTELLA | sin orden | solo `PraImpTotal` |
| 3415 | 409 (INT-194) VARELA | 1/2074 it.2 | practica + item + cabecera |
| 3593 | 424 (INT-199) VALENCIA | 1/2191 it.1 | practica + item + cabecera |
| 3974 | 473 (INT-214) LIENDRO NIEVA | 1/2486 it.1 | practica + item + cabecera |

4 practicas a 18.699,95, 3 items a 18.699,95 con `OprClasAgrup='HE+GA'` / `OprModulo=NULL`
/ `OprTitularModular='HONORARIO ESPECIALISTA + DERECHOS'` / `OprImprimirDuplicado=true`,
y 3 cabeceras de 32.149,74 a 35.700,06. Las tres ordenes llevan tambien un 420303, asi
que no se toco la cabecera mas alla del importe. En la 2074 el 170101 es el item 2, no el
1 — se verifico el numero de item contra el puntero de cada practica antes de escribir.

**Por que estos cuatro no estaban en ningun lote:** BETTELLA sigue internado — ingreso
25/08, sin egreso, ingreso en estado A, 19 practicas pendientes. Los otros tres califican
para lote y quedaron fuera de la seleccion al armarlo: corriendo el filtro real del
armado (ingreso en A o E, misma OS, mismo tipo, con al menos una orden facturada no
anulada, sin periodo), **OSECAC INT da 36 ingresos candidatos y el lote 41 tomo 23**;
**ACIDSAL INT da 34 y el lote 43 tomo 27**. Los dos lotes son provisorios (`PROV 1`,
`PROVI 1`, armados el 25 y 26/08) y los tres siguen con practicas pendientes, asi que lo
mas probable es que se hayan dejado para el lote definitivo.

**Estado final del 170101:** 165 practicas activas, **102 completas**, **0 a medias fuera
de lote**. Quedan 7 a medias dentro de lotes ya armados — FLORES x2 (INT-105), DIP
(INT-118), LAMAS (INT-170), GUZMAN (INT-143, ord 950), ARANCIBIA (INT-156, ord 1094) y
MARTINEZ (INT-168, ord 1408) — que no se tocan sin recalcular `LItImpTotal` y el total
del lote.

**Como verificar:** ninguna practica activa de 170101 fuera de lote debe quedar en
15.149,63 ni en 3.550,32.

---

## 2026-09-02 — Ordenes 2496-2499 de ALBIS: de la ficha INT-220 a la INT-261

Bloque quirurgico cargado en la ficha equivocada. ALBIS, RUTH CINTIA JAQUELIN (paciente
68386) tiene dos internaciones: **INT-220 = ingreso 489** (24/08 al 29/08, COLICO RENAL) e
**INT-261 = ingreso 612** (31/08 al 01/09, LITIASIS RENAL). La cirugia real es la del
31/08; las 4 ordenes del bloque quirurgico estaban colgadas del ingreso 489.

**Que se escribio** (una transaccion, dos `updateMany`, guarda `ingresoId = 489` en ambas):

| que | ids | de | a |
|---|---|---|---|
| `Orden.IngID` | 1/2496, 1/2497, 1/2498, 1/2499 | 489 | 612 |
| `Practica.IngID` | 3991 a 4000 | 489 | 612 |

Las 10 practicas salen de los `OrdenPractica.PraID` de esas 4 ordenes, no de una lista a
mano. No se toco nada mas: fechas, importes, matriculas, estados y numeros de item quedan
como estaban (pedido explicito). El bloque son 100124 y 100118 por GA (mat. 4889), HE
(mat. 6), HA (mat. 9995) y A1 (mat. 995), mas un 431101 y un 420303.

**Que quedo sin tocar, a proposito:**

- **Las fechas siguen en 25/08**, fuera del periodo de la ficha 261 (31/08 al 01/09). El
  match contra la cirugia #149 sigue funcionando por el fallback sin fecha de
  `resolverInfoCirugiaConFallback` — el ingreso 612 tiene una sola cirugia — pero un lote
  filtrado por periodo puede no levantarlas.
- **La ficha quirurgica**: las 10 filas de `CirugiaPractica` del bloque (ids 904 a 913)
  siguen en la cirugia **#127** (25/08, ingreso 489). La **#149** (31/08, ingreso 612)
  sigue con 0 practicas y su diferencial (`dobleCirugia` + `mismaViaMismaPatologia`, id 56)
  sigue inerte: nunca matchea porque no tiene contra que.
- **El 25/08 no hubo cirugia.** La #127 es solo el contenedor
  (`Creada desde internacion para carga de practicas`, 25/08 14:33), sin hora, cama,
  autorizacion ni diferenciales.

**Lo que queda en la ficha 220 y NO se factura** (se reviso, no es un riesgo): quedan las
practicas **3982 a 3989** — el mismo bloque quirurgico, 100124 y 100118 por las 4
matriculas — con `PraEstad` null y sin orden. Cuelgan de las ordenes **2492 a 2495**, que
estan anuladas (`OrdEstad = 'X'`). Anular una orden efectivamente no toca `PraEstad` (ver
`anularOrdenAction`), pero la facturacion no mira solo el estado: en
`obtenerContextoFacturacion` el filtro `practicasSinOrdenAnulada`
(`src/modules/facturacion/repository.ts:1797`) descarta la practica desvinculada cuyo
**unico** historial en `OrdenPractica` son ordenes anuladas. Medido: el contexto de
facturacion del ingreso 489 devuelve **16 prestaciones, ninguna de 100124 ni 100118**.
La 3990 (431101) ademas ya esta en `X`.

Distincion util: "practica activa y sin orden" no equivale a "pendiente de facturar". Sin
historial de vinculos es pendiente; con historial todo anulado es huerfana y se descarta.

**Reversion:** `IngID` de vuelta a 489 en las 4 ordenes y en las practicas 3991 a 4000.

**Como verificar:** el ingreso 612 tiene 6 ordenes y 13 practicas; el 489 baja a 16
ordenes y 27 practicas.

---

## 2026-09-02 — Alta de la tabla CatalogoMedicamentoFacturacion (DDL + seed)

**Reportado por:** Paula — faltaban 4 medicamentos en la lista de medicacion de
facturacion (Dexametasona 8 MG, Dipirona 1 g, Diclofenac ampolla, Diclofenac 75mg).

**Que estaba mal:** la lista era un array hardcodeado de 7 items en
`src/lib/catalogos/medicamentos-facturacion.ts`, o sea que cada medicamento nuevo
exigia cambio de codigo y deploy.

**Que se hizo:** se creo la tabla `CatalogoMedicamentoFacturacion` (nombre unico +
precio nullable + estado) y se sembraron 11 filas: los 7 de siempre con su precio y
los 4 nuevos con `CMFPrecio` NULL. El combo del panel ahora lee de esa tabla y tiene
un boton "+ Nuevo" para dar de alta desde la UI.

**No se uso `prisma db push`** (trampa 5 de CLAUDE.md). El `migrate diff` medido antes
de tocar nada confirmaba que un push habria hecho `DROP SEQUENCE "Paciente_HC_seq"` y
`DROP INDEX` sobre 11 indices manuales. Se aplico solo el bloque CreateTable + sus 2
indices, con `IF NOT EXISTS`, desde `prisma/seed-medicamentos-facturacion.ts`.

**Verificado despues de correr:** `Paciente_HC_seq` viva (`true`), 12 indices `idx_*`
presentes, 11 medicamentos activos, y `migrate diff` ya no propone ningun CreateTable.

**Reversion:** `DROP TABLE "CatalogoMedicamentoFacturacion"` y revertir el codigo. Ojo:
se pierden los medicamentos que hayan cargado desde el panel despues del seed.

**Como verificar:** `npm run db:seed-medicamentos-facturacion` es idempotente — volver a
correrlo debe decir `Sembrados: 0 | ya existian: 11` y no pisa precios cargados a mano.

---

## 2026-09-02 — Columna MedicacionIngreso.MedFacturada (DDL)

**Reportado por:** Paula — en el panel de facturacion (ingreso 641, orden 3246) los
medicamentos no se podian facturar porque no tienen orden: la fila salia sin tilde y
con el cartel "Sin autorizacion", que para un medicamento no aplica.

**Que se hizo:** se agrego la columna `MedFacturada` (`BOOLEAN NOT NULL DEFAULT false`)
a `MedicacionIngreso`. Es la marca de facturado del panel: la medicacion no genera
orden ni item, se sigue cobrando en el lote de MEDICAMENTOS, que la levanta igual con
el flag en true (`estado NOT IN ('S','X')`, sin mirar `MedFacturada`).

**No se uso `prisma db push`** (trampa 5 de CLAUDE.md). El `migrate diff` medido antes
seguia proponiendo `DROP SEQUENCE "Paciente_HC_seq"` y `DROP INDEX` sobre los indices
manuales. Se aplico solo el `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

**Verificado despues de correr:** columna presente (`boolean`, `NOT NULL`, default
`false`), `Paciente_HC_seq` viva, 12 indices `idx_*` presentes, y `migrate diff` ya no
propone ningun `AlterTable` sobre `MedicacionIngreso`.

**Reversion:** `ALTER TABLE "MedicacionIngreso" DROP COLUMN "MedFacturada"` y revertir
el codigo. Se pierde que medicamentos ya se marcaron facturados; el importe de los
lotes no cambia.

---

## 2026-09-02 — ACIDSAL lotes 43 y 60: filas que cobraban un solo componente

**Reportado por:** Paula — en los resumenes 43 y 60 de ACIDSAL (OS 346, ambos en PEN)
habia codigos que traian solo especialista o solo gastos, cuando todos ellos se cobran
con los dos componentes.

**Que se hizo:** se corrigieron 20 filas (5 en el lote 43, 15 en el lote 60) de los
codigos 170101, 200222, 340212, 340213, 340301, 340421 y 340905, todas con la practica
en estado F y la orden no anulada. Por cada fila:

- `OrdenPrac.OprImpTotal` = (valorEspecialista + valorGastos) x cantidad del nomenclador
  del convenio 1; `OprModulo` = NULL (COMPLETA).
- `Practica.PraImpTotal` = mismo importe.
- `Orden.OrdImpTotal` += delta de sus filas (venia coincidiendo con la suma de items).
- `LoteFacturacionItem.LItImpTotal` y `LoteFacturacion.LotImpTotal` += delta.

Solo 2 de las 20 tenian `OprModulo` explicito (`GA` en 1/2126#1, `HE` en 1/2991#1); las
otras 18 decian COMPLETA con importe de un componente, o sea la practica se creo con un
precio parcial y el modulo nunca lo reflejo. El origen es la carga, no el panel: al
elegir una practica del nomenclador `seleccionPorDefecto()` ya marca los dos componentes.

**Delta:** lote 43 +$8.671,04 (total $32.918.896,06 -> $32.927.567,10); lote 60
+$103.167,83 (total $28.661.363,30 -> $28.764.531,13).

**Lo que NO se toco:**
- `170101` de los ingresos 527 y 534 (lote 60): repartido en dos filas, una GA y una HE,
  que suman el completo. Corregirlo habria duplicado el cobro.
- `340211` (1/2656#1, ing 456, solo HE) y `340907` (1/2670#2, ing 456, 3x solo GA):
  mismo patron pero fuera de la lista pedida. 340907 es radioscopia en quirofano, donde
  el reparto por componente puede ser legitimo. Faltan $10.628,36 entre las dos.
- Las practicas de cirugia (80xxx, 72xxxx), que se reparten por componente/profesional
  a proposito.

**Verificado despues de correr:** el barrido que encontro las filas vuelve 0 pendientes
en el lote 43 y solo las 2 filas excluidas a proposito en el lote 60.

**Filas corregidas** (lote | ingreso | orden#item | codigo | importe viejo -> nuevo):

```
43 | 191 | 1/625#1  | 340905 |  8865.93 ->  11166.41
43 | 331 | 1/1429#1 | 340301 |  4432.97 ->   6025.61
43 | 178 | 1/1447#1 | 340301 |  4432.97 ->   6025.61
43 | 241 | 1/1406#1 | 340301 |  4432.97 ->   6025.61
43 | 382 | 1/1752#1 | 340301 |  4432.97 ->   6025.61
60 | 527 | 1/2874#1 | 340301 |  4432.97 ->   6025.61
60 | 282 | 1/1080#1 | 170101 | 15149.63 ->  18699.95
60 | 282 | 1/1082#1 | 340301 |  4432.97 ->   6025.61
60 | 412 | 1/2642#1 | 340421 |  1238.72 ->   5671.69
60 | 412 | 1/3031#1 | 200222 | 87823.58 -> 145895.36
60 | 431 | 1/2126#1 | 170101 |  3550.32 ->  18699.95   (modulo GA -> COMPLETA)
60 | 518 | 1/2687#1 | 340301 |  4432.97 ->   6025.61
60 | 282 | 1/2991#1 | 170101 | 15149.63 ->  18699.95   (modulo HE -> COMPLETA)
60 | 412 | 1/3099#1 | 340905 |  8865.93 ->  11166.41
60 | 282 | 1/2641#1 | 340301 |  1592.64 ->   6025.61
60 | 473 | 1/2338#1 | 340213 |  5319.56 ->   6912.20
60 | 456 | 1/2400#2 | 340212 |  4432.97 ->   4963.85
60 | 456 | 1/2402#1 | 340301 |  4432.97 ->   6025.61
60 | 577 | 1/2868#1 | 340301 |  4432.97 ->   6025.61
60 | 518 | 1/2870#1 | 340301 |  4432.97 ->   6025.61
```

**Reversion:** no hay script. Para volver atras hay que reponer el importe viejo de la
tabla de arriba en `OrdenPrac` y `Practica`, restar el delta en `Orden`, en el item del
lote y en el lote, y devolver `OprModulo` a `GA` / `HE` en las dos filas marcadas.

---

## 2026-09-02 — Ingresos y obras sociales del sistema anterior (DDL + import)

**Pedido por:** Paula — traer al modulo de archivo, ademas de lo que ya mostraba,
DNI, nombre completo, internaciones anteriores, fechas de ingreso/egreso, obra
social y tipo de egreso.

**De donde salieron:** la base del sistema anterior estaba restaurada en la maquina
local (instancia `.\SQLEXPRESS`, bases `SanRafael` y `SanRafaelLegacy`, identicas).
No hizo falta pedir ningun export nuevo.

**Que se hizo:**

1. DDL: se crearon `ArchivoObraSocial`, `ArchivoPlanObraSocial` y `ArchivoIngreso`
   desde `prisma/sql/archivo-ingresos.sql` con `npm run db:archivo-ddl`.
2. Import: `npm run db:import-archivo-ingresos` leyo del SQL Server local via
   `sqlcmd` (NDJSON con `FOR JSON PATH`) y cargo 395 obras sociales, 382 planes y
   8.665 ingresos.

**No se uso `prisma db push`** (trampa 5 de CLAUDE.md). El `migrate diff` medido antes
traia 12 `DROP`: `DROP SEQUENCE "Paciente_HC_seq"` y 11 `DROP INDEX` sobre indices
manuales. Se aplicaron solo los 3 CreateTable + 4 CreateIndex, con `IF NOT EXISTS`.
El script aborta si el archivo SQL contiene `DROP`, `ALTER`, `TRUNCATE` o `DELETE`.

**Verificado despues de correr:** 3/3 tablas creadas, `Paciente_HC_seq` viva, 12
indices `idx_*` presentes. Encoding correcto (`MUÑOZ ROCÍO SOFÍA`,
`INSUFICIENCIA CARDÍACA`); las 29 filas con `?` son signos de pregunta reales de los
diagnosticos, no mojibake. Horas sin corrimiento (una internacion de dia guardada
08:30 -> 10:22 se lee igual). Obra social del paciente resuelta en 54.153 de 54.154.

**Lo que NO entro, a proposito:** 322 ingresos sin `PacID` (153 de ellos
internaciones). No se pueden colgar de ningun paciente del archivo.

**Reversion:** `DROP TABLE "ArchivoIngreso", "ArchivoPlanObraSocial",
"ArchivoObraSocial"` y revertir el codigo. No se toco ninguna tabla existente.

**Como verificar:** `npm run db:import-archivo-ingresos -- --dry-run` no escribe nada
y reporta los conteos del origen; volver a correr el import sin `--reemplazar` debe
insertar 0 filas (usa `skipDuplicates`).

---

## 2026-09-03 — Alta del profesional APERTI FACUNDO (MP 5523)

**Pedido por:** Paula.

**Que se hizo:** se inserto una fila en `Profesional` — `PrfID` 1038,
`PrfNombre` `APERTI FACUNDO`, `PrfMatric` 5523, `PrfEstad` `A`, `UsuCodig`
`SUPERVISOR`, sin especialidad ni tipo (como las otras 1.016 filas importadas).
Se hizo por SQL porque la app no tiene alta de profesionales.

**Antes se verifico** que no existiera: 0 filas con nombre que contenga `APERTI`
y 0 con matricula 5523. Total antes 1.036, despues 1.037.

**Escritura extra necesaria:** la secuencia `Profesional_PrfID_seq` estaba en 63
mientras el `max(PrfID)` era 1037 — los profesionales se habian importado con ID
explicito y la secuencia nunca se reposiciono. Un insert con autoincrement habria
chocado la PK. Se corrio `setval('public."Profesional_PrfID_seq"', 1037, true)`
antes del insert; quedo en 1038. Esto tambien destraba cualquier alta futura.

**Reversion:** `DELETE FROM "Profesional" WHERE "PrfID" = 1038`. La secuencia se
deja como esta: volver a 63 rompe las altas siguientes.

**Como verificar:** el profesional aparece en los selectores de profesional
(admision, internacion, ordenes) buscando por `APERTI`.

---

## 2026-09-03 — Lote 60 / SULCA: las dos radiografias del 340211 a medias

**Reportado por:** Paula — "lote 60, codigo 340211 debe incluir honorarios y gastos
siempre, chequear a que pacientes falta alguno de esos items".

**Alcance real:** de los 14 pacientes del lote 60 (ACIDSAL, PEN, sin periodo) el
340211 lo tiene uno solo, SULCA PASCUALA (ingreso 456 / INT-207). Los otros 13 no
tienen el codigo cargado ni en ordenes ni en `Practica`.

**Que estaba mal:** el 340211 (RADIOGRAFIA DE HOMBRO, HUMERO, PELVIS, CADERA Y
FEMUR) vale HE 1.592,64 + GA 5.319,56 = 6.912,20. SULCA tenia dos radiografias y a
cada una le faltaba un componente:

| fecha | orden | cargado | faltaba |
|---|---|---|---|
| 21/08 | 1/2400 it.1 | GA 5.319,56 | HE 1.592,64 |
| 25/08 | 1/2656 it.1 | HE 1.592,64 | GA 5.319,56 |

Encima la practica 3870 (la GA del 21/08) habia quedado sin marcar como facturada
— `PraEstad` NULL y `PueNum`/`OrdNum`/`OprItem` en NULL — asi que
`practicaFacturadaEnOrden` la descartaba y esa linea **ni siquiera entraba al
resumen**: en pantalla el 340211 mostraba 1.592,64 de honorario y 0 de gastos. Su
hermana de la misma orden (3871, el 340212) si estaba bien vinculada, o sea que es
una fila rota puntual y no toda la orden.

**Por que se descarto que fueran una sola radiografia:** las dos lineas suman
exactamente 6.912,20 y en ese ingreso las otras radiografias estan cargadas
combinadas (340212 del 21/08 = 4.963,85 = 4.432,97 GA + 530,88 HE; 340301 del 23/08
= 6.025,61 = 4.432,97 + 1.592,64), asi que la hipotesis "el honorario del 25/08 es
el que faltaba del 21/08, cargado tarde" era plausible. **Paula confirmo que son dos
radiografias distintas** (la del 25/08 es del dia de la cirugia de femur), asi que
se completaron las dos.

**Forma que se replico:** en toda la base el 340211 va con sus dos componentes,
GA 5.319,56 + HE 1.592,64, misma fecha y misma matricula (18 ingresos revisados; 16
asi, uno combinado en una sola linea de 6.912,20, y este el unico partido en dos
fechas). En este ingreso la app separa por componente en ordenes distintas
(`OrdTitularModular` = `DERECHOS` vs `HONORARIO ESPECIALISTA`), asi que los faltantes
se crearon como ordenes propias en vez de meterlos en las existentes.

**Registros tocados:**

| tabla | registro | antes | despues |
|---|---|---|---|
| `Practica` | 3870 (`PraEstad`, `PueNum`, `OrdNum`, `OprItem`) | NULL, NULL, NULL, NULL | `F`, 1, 2400, 1 |
| `Practica` | 5211 (nueva) | — | 340211, 21/08, 1.592,64, `F`, link 1/3379 it.1 |
| `Orden` + `OrdenPrac` | 1/3379 (nueva) | — | HE 1.592,64, 21/08, `OprClasAgrup='HE'`, `OprModulo='HE'`, mat 9995, aut 423070 |
| `Practica` | 5212 (nueva) | — | 340211, 25/08, 5.319,56, `F`, link 1/3380 it.1 |
| `Orden` + `OrdenPrac` | 1/3380 (nueva) | — | GA 5.319,56, 25/08, `OprClasAgrup='GA'`, `OprModulo=NULL`, mat 9995, aut 423070 |

Las dos ordenes se crearon con `crearOrdenInterna` (el mismo camino que usa la app,
con su numeracion y reintento por colision), no por SQL: numeros 3379 y 3380, puesto
1, `TorCodig='CAM'`, profesional 21 (BREM RUBEN DARIO), OS 346 plan 1, cabecera
copiada de 1/2400 y 1/2656. El `OrdNumAut` se estampo despues en un update aparte
porque `crearOrdenInterna` no lo recibe.

**Snapshot previo:** `docs/snapshot-ing456-340211-2026-09-03.json` (practicas,
`OrdenPrac`, ordenes 2400/2656, item de lote y lote 60 antes del cambio).

**Reversion:** `DELETE FROM "OrdenPrac" WHERE "PueNum"=1 AND "OrdNum" IN (3379,3380)`,
`DELETE FROM "Orden" WHERE "PueNum"=1 AND "OrdNum" IN (3379,3380)`,
`DELETE FROM "Practica" WHERE "PraID" IN (5211,5212)` y devolver la 3870 a
`PraEstad=NULL, PueNum=NULL, OrdNum=NULL, OprItem=NULL`.

**Como verificar:** en el detalle del lote 60, SULCA (INT-207) muestra cuatro lineas
de 340211 — 21/08 con 1.592,64 en `$ Esp` y 5.319,56 en `$ Gto`, y lo mismo el 25/08.
Medido: el codigo aporta 3.185,28 de honorarios + 10.639,12 de gastos = 13.824,40
(antes 1.592,64). El total recalculado del lote paso de 3.829.481,14 a 3.841.712,90
en ese ingreso, +12.231,76.

**Queda pendiente (no se toco):** el `LotImpTotal` guardado del lote 60 sigue en
28.764.531,13 mientras el detalle recalcula 28.795.462,84. La diferencia son estos
12.231,76 mas 18.699,95 del ingreso 527 (GUTIERREZ SANTOS GENARO) que ya estaban
desfasados de antes. El importe guardado solo lo usa el listado de lotes; el detalle,
el resumen y el PDF recalculan siempre desde las ordenes.

---

## 2026-09-03 — Lote 67 (ACIDSAL): vuelto a pendiente para aplicar el PROMEDI

**Que paso:** el lote 67 (ACIDSAL - Cod.346, `PRACTICAS`, descripcion `AGOSTO`,
concepto `INTERNADO`, sin periodo) se confirmo hoy 17:07 sin haber corrido antes
`Aplicar PROMEDI`. Medido en la base: 41 items, los 41 incluidos y **0 con
`LItImpPromedi`** cargado, con `LotImpTotal` = 61.964.539,28 (el bruto, sin el 13%
de la regla ACIDSAL).

Confirmar un lote solo cambia el estado — `confirmarLote` llama a
`cambiarEstadoLote(id, 'CON')` y nada mas: no marca ordenes ni practicas — asi que
volverlo a `PEN` no deja nada colgado. Hace falta porque
`aplicarPromediLote` corta con "Solo se puede aplicar PROMEDI a un lote pendiente"
(`repository.ts:6808`) y la API de estado solo acepta `CON`/`ANU`, sin camino para
volver a pendiente desde la UI.

**Registros tocados:**

| tabla | registro | antes | despues |
|---|---|---|---|
| `LoteFacturacion` | 67 (`LotEstado`) | `CON` | `PEN` |
| `LoteFacturacion` | 67 (`LotFchEstado`) | 2026-09-03 17:07:18 | 2026-09-03 17:17:22 |

El `UsuCodig` se dejo como estaba (`user_3F2Zc`, el que confirmo). No se toco ningun
item ni el `LotImpTotal`.

**Reversion:** `UPDATE "LoteFacturacion" SET "LotEstado"='CON' WHERE "LotID"=67`.

**Como verificar:** el lote 67 vuelve a aparecer editable, con el boton de
`Aplicar PROMEDI` habilitado. La obra social resuelve regla `ACIDSAL` (13%) —
`resolverReglaPromedi` normaliza `"ACIDSAL - Cod.346"` a `ACIDSALCOD346` y matchea
por `includes('ACIDSAL')`.

**Queda pendiente:** que facturacion corra `Aplicar PROMEDI` y recien despues
confirme.

---

## 2026-09-03 — El periodo de un lote va del dia 2 al dia 1 del mes siguiente

**Que cambio:** agosto tiene que incluir hasta el 01/09 inclusive. Antes
`periodoToDateRange` devolvia `01/08 00:00 <= fecha < 01/09 00:00`, asi que el 01/09
quedaba entero afuera (las 83 ordenes de ese dia). Ahora el rango es
`02/08 00:00 <= fecha < 02/09 00:00`.

El corrimiento va en las **dos** puntas a proposito. Si el periodo arrancara el dia 1
y cerrara el dia 1 del mes siguiente, ese dia caeria en dos periodos y se podria
facturar dos veces. Con el corrimiento simetrico ningun dia se repite y ninguno queda
sin periodo.

La regla se movio a `src/modules/facturacion/periodo-lote.ts` con test propio
(`periodo-lote.test.ts`, 10 casos: el borde 01/09 vs 02/09, la no superposicion entre
periodos consecutivos y la excepcion de 2026-08). Es el unico lugar
que traduce periodo a fechas: lo usan la creacion del lote, el detalle, las
medicaciones, el PROMEDI y el listado.

**Lotes tocados** (los tres de este mes que estaban sin periodo):

| tabla | registro | antes | despues |
|---|---|---|---|
| `LoteFacturacion` | 62 (`LotPeriodo`) | NULL | `2026-08` |
| `LoteFacturacion` | 64 (`LotPeriodo`) | NULL | `2026-08` |
| `LoteFacturacion` | 67 (`LotPeriodo`) | NULL | `2026-08` |

El 66 ya tenia `2026-08`. Los cuatro lotes en PEN de esta vuelta (62, 64, 66, 67)
quedan con el mismo periodo.

**Reversion:** `UPDATE "LoteFacturacion" SET "LotPeriodo"=NULL WHERE "LotID" IN (62,64,67)`
y volver `periodoToDateRange` al mes calendario (dia 1 a dia 1).

**Impacto medido por lote** (ordenes no anuladas con autorizacion o practica en `F`):

| lote | regla anterior (01/08-31/08) | regla nueva (01/08-01/09) | del 01/08 | del 01/09 |
|---|---|---|---|---|
| 62 | 93 / 1.581.000,00 | 93 / 1.581.000,00 | 3 / 51.000,00 | 0 |
| 64 | 26 / 290.674,66 | 26 / 290.674,66 | 0 | 0 |
| 66 | 534 / 68.176.499,46 | 535 / 68.184.121,86 | 5 / 2.169.372,89 | 1 / 7.622,40 |
| 67 | 417 / 73.129.652,67 | 425 / 79.226.744,26 | 16 / 5.539.708,17 | 8 / 6.097.091,59 |

Contra la regla anterior el cambio es puramente aditivo: no sale ninguna orden, solo
entran las del 01/09. Los importes son una foto del 2026-09-03 a la tarde; el lote 66 se
estuvo editando ese mismo dia (reparacion de vinculos), asi que sus totales se movieron
entre dos corridas.

**Excepcion, por unica vez, para el 01/08:** con el arranque en el dia 2, las ordenes
del 01/08 caerian en el periodo `2026-07`, y **no existe ningun lote con periodo
2026-07**: son 21 ordenes por 7.709.077,23 (ingresos 113, 152, 155, 164, 182, 204) que
al 2026-09-03 no estaban en ningun lote confirmado, o sea que no las levantaria nadie.
Por eso `2026-08` arranca el 01/08 y no el 02/08 — queda `01/08 00:00` hasta
`01/09 23:59:59`. La excepcion es solo de ese periodo, esta hardcodeada en
`PRIMER_PERIODO_CON_DIA_1` y no se contagia a septiembre (que arranca el 02/09) ni a
agosto de otro año; los dos casos tienen test.

**Otro pendiente:** el lote 45 (IPSS, `RX IPS`, creado el 28/08) sigue en PEN sin
periodo. Se dejo asi porque es de la vuelta anterior, no de esta. Con `2026-08` perderia
2 ordenes por 14.078,87.

**Nota:** `aplicarPromediLote` escribe `LItImpPromedi` por item pero no reescribe
`LotImpTotal`, asi que el importe guardado del lote queda viejo hasta que se recree.
El listado usa el guardado; el detalle, el resumen y el PDF recalculan.

---

## 2026-09-03 — Lote 66: honorarios y gastos incompletos en 12 codigos

**Reportado por:** Paula — "lote 66, mismo problema: necesitamos que salga gastos y
especialista incluidos en cada practica, hay casos que traen gastos y otros solo
especialista". Codigos: 170101, 340301, 341008, 340907, 340905, 340212, 180118, 180111,
180116, 180114, 340421, 180112. Los doce tienen `NPrValEsp` y `NPrValGto` en el
nomenclador, o sea que los doce deben cobrar los dos componentes.

**Alcance:** lote 66 (OSECAC CONV DIRECT, periodo 2026-08, PEN, 49 ingresos incluidos).
Auditados 101 grupos paciente+codigo+fecha. No era un problema sino tres:

| | casos | plata |
|---|---|---|
| A. Practica con un solo componente cargado | 30 | faltaban 189.701,13 |
| B. Importe completo pero etiquetado con un solo componente | 12 lineas | 0, fallaba el desglose |
| C. Practica cargada y autorizada pero sin vincular, no llegaba al resumen | 10 | 270.781,83 sin facturar |

**C se arreglo primero** porque cambia el resultado de A: al vincularlas aparecieron dos
faltantes nuevos (los 340907 de RUIZ INT-234 y VALENCIA INT-213, que entran con gastos
solos) y dos casos salieron de la lista de A (GIMENEZ y ZAPANA ya tenian el honorario
cargado en otra orden).

**C — vinculos reparados** (`PraEstad` NULL o 'A' y `PueNum`/`OrdNum`/`OprItem` en NULL,
con `PraFacturar=true` y sin motivo de no facturacion):

| Practica | Orden/item | Paciente | Importe |
|---|---|---|---|
| 3203 | 1/1923/1 | AGUERO INT-193 | 15.149,63 |
| 3202 | 1/1924/1 | AGUERO INT-193 | 3.550,32 |
| 2878 | 1/1681/1 | CANABIDE INT-174 | 49.634,88 |
| 3100 | 1/1843/1 | GIMENEZ INT-188 | 15.149,63 |
| 2839 | 1/1672/3 | RUIZ INT-175 | 49.634,88 |
| 4247 | 1/2681/3 | RUIZ INT-234 | 42.556,48 |
| 3676 | 1/2257/1 | VALENCIA INT-199 | 18.699,95 |
| 3605 | 1/2198/4 | VALENCIA INT-213 | 42.556,48 |
| 3330 | 1/2022/1 | VARELA INT-194 | 18.699,95 |
| 2765 | 1/1628/1 | ZAPANA INT-167 | 15.149,63 |

El script aborta sin escribir si alguna practica ya esta vinculada, no es facturable,
tiene mas de una fila de orden viva, el importe no coincide con el medido, o la orden no
tiene autorizacion. Snapshot: `docs/snapshot-lote66-vinculos-2026-09-03.json`.

**A y B — 42 lineas a la forma canonica** del lote 43 (31/08, mas arriba en este
archivo): `OprImpTotal` al valor completo, `OprClasAgrup='HE+GA'`, `OprModulo=NULL`,
`OprTitularModular='HONORARIO ESPECIALISTA + DERECHOS'`, `OprImprimirDuplicado=true`, y
`PraImpTotal` igual. Cabeceras recalculadas como suma de sus items; titular y duplicado
solo en las ordenes de un item, para no mal-etiquetar los otros codigos de la orden.

30 lineas cambiaron de importe (+189.701,13) y 12 solo de etiqueta. Lo mas gordo:
GUZMAN 341008 4.383,99 -> 93.899,01 (+89.515,02), PEREZ CRUZ 180112 4.866,93 -> 18.715,53,
GUINART 180114 2.336,12 -> 12.283,70. Snapshot: `docs/snapshot-lote66-completar-2026-09-03.json`.

**Antes de escribir se verifico** que ningun otro lote activo comparta esos ingresos: los
18 ingresos tocados aparecen ademas en los lotes 21, 25, 41, 63 y 65, **todos ANU**.

**Guarda contra doble facturacion:** el script saltea cualquier codigo que, en el mismo
ingreso, tenga un grupo sin honorario **y** otro sin gastos: pueden ser las dos mitades de
la misma practica cargadas con fechas distintas. Salto los dos grupos de `170101` de
ZAPANA (ordenes 1628 y 1629, creadas con 2 segundos de diferencia, fechas de item 14/08 y
12/08). Sumadas dan 18.699,95 = un electro entero, ya esta bien; completarlas habria
facturado dos.

**Resultado medido:** de 101 grupos, 98 quedan con honorario y gastos. Los 3 restantes se
dejaron a proposito y estan abajo.

### Lo que quedo sin tocar

- **ZAPANA INT-167, 170101:** el par 1628/1629 con fechas de item distintas (14/08 y
  12/08). En plata esta bien. Si se quiere que el resumen lo muestre en una sola fecha hay
  que unificar `OprFch`.
- **MORENO INT-157, 340907 del 11/08 (orden 1047/3):** cantidad 3 con importe 49.634,88,
  que son 4 unidades completas (12.408,72 x 4). O la cantidad o el importe estan mal.
- **PEREZ CRUZ INT-190, dos 340907 del 18/08** (ordenes 1809/3 x4 por 42.556,48 y 1813/1
  x3 por 31.917,36, 74.473,84 en total): **sin numero de autorizacion**, por eso no entran
  al lote y no se pueden reparar vinculando. Ademas parecen duplicadas entre si.

### La trampa que aparecio en el medio: el total del lote depende del codigo

Durante el trabajo el total recalculado del lote 66 dio tres valores distintos con la base
**sin cambiar**: 57.216.268,27, despues 55.063.487,31, y al final 57.413.591,80. No era
concurrencia ni flakiness de Prisma: `src/modules/facturacion/periodo-lote.ts` y su test se
crearon hoy 14:46 (sin commitear al momento de escribir esto) y `repository.ts` quedo
importandolos. Cada `npx tsx` releia el archivo del disco.

La diferencia son 5 ordenes de GUINART (ing 152) emitidas el `2026-08-01T15:00:00Z` —656,
1356, 1357, 1363, 1365, 2.160.403,36 en total— que entran o no segun donde arranque el
periodo: la regla nueva es dia 2 a dia 1 del mes siguiente, con `PRIMER_PERIODO_CON_DIA_1`
haciendo que **2026-08 arranque el 01/08**.

Con la version intermedia del codigo (dia 2, sin la excepcion) escribi `LotImpTotal` en
55.253.188,44. Quedo 2.160.403,36 bajo y se corrigio despues a **57.413.591,80**, que es lo
que calcula el codigo actual. Verificado: 0 items desfasados de 50, guardado = calculado.

> **Si la regla de `periodo-lote.ts` vuelve a cambiar, los totales guardados de los lotes
> PEN quedan viejos otra vez.** `LItImpTotal` y `LotImpTotal` son una foto; el detalle, el
> resumen y el PDF recalculan siempre desde las ordenes, pero el **listado de lotes** muestra
> la foto. Refrescar con el script de recalculo (dos lecturas seguidas, aborta si no
> coinciden) antes de confirmar cualquier lote.

**Reversion:** los dos snapshots tienen el estado previo completo (practicas, `OrdenPrac`,
cabeceras, items de lote y el lote).

---

## 2026-09-03 — Lote 69 devuelto a pendiente

El lote 69 (`GUARDIA ACIDSAL AGOSTO`, obra social 346, 612.000) se habia confirmado por error
el 2026-09-03 18:59 (usuario `user_3F2ZR`). Se lo volvio a `PEN` desde un script que llama a
`reabrirLote(69, 'SISTEMA')`, o sea el mismo camino que ahora expone el boton "Volver a
pendiente" del detalle de lote: solo cambia `LotEstado`, `LotFecEst` y `LotUsuario`, no toca
items ni ordenes. Queda auditado en `Audit` como "Lote devuelto a pendiente".

---

## 2026-09-03 — Lote 70: honorarios y gastos incompletos en 170101 y 340301

**Pedido por:** Paula — "en el lote 70 tengo que corregir los mismos errores en los codigos
340301 y 170101, a algunos les falta especialista y a otros gastos; todos esos codigos deben
contar con gastos y especialista".

**Alcance:** lote 70 (OSECAC CONV DIRECT, OS 511, **sin periodo**, PEN, 3 ingresos incluidos:
FLORES ing 153, GALARZA ing 411, DIAZ ing 452). Nomenclador convenio 1: `170101` = 15.149,63 +
3.550,32 = 18.699,95; `340301` = 1.592,64 + 4.432,97 = 6.025,61.

Auditadas 15 filas de esos dos codigos: 11 ya estaban completas, 4 a medias, 3 completas pero
mal etiquetadas. Misma forma canonica del lote 43 y del lote 66: `OprImpTotal` al valor
completo, `OprClasAgrup='HE+GA'`, `OprModulo=NULL`, y `PraImpTotal` igual. Titular
(`HONORARIO ESPECIALISTA + DERECHOS`) y `OprImprimirDuplicado=true` **solo en las ordenes de
un item**, para no mal-etiquetar los otros codigos de la orden — por eso 637 y 2041, que
tienen dos items, conservan su titular.

**A — 4 filas a las que les faltaba un componente** (+8.328,24):

```
70 | 153 | 1/637#1  | 170101 | 15149.63 -> 18699.95   (solo HE)
70 | 452 | 1/2244#1 | 340301 |  4432.97 ->  6025.61   (solo GA)
70 | 452 | 1/2559#1 | 340301 |  4432.97 ->  6025.61   (solo GA)
70 | 452 | 1/2888#1 | 340301 |  4432.97 ->  6025.61   (solo GA)
```

**B — 2 filas solo de etiqueta** (importe ya completo, 0 de delta): `1/2041#1` (170101 de
GALARZA, tenia `OprModulo='HE+GA'` en vez de NULL) y `1/3085#1` (340301 de DIAZ, `clas='GA'`).

**Guardas del script** (aborta sin escribir): importe actual distinto del medido, cantidad != 1,
practica no facturable, practica que no apunta de vuelta a esa fila, orden anulada, cabecera
que no coincide con la suma de sus items, o cambio de importe sobre una practica que no esta
en estado `F`. La guarda contra doble facturacion del lote 66 no tenia nada que saltear: **0
grupos ingreso+codigo con una mitad HE y otra GA por separado**.

**Lo que quedo afuera a proposito:**

- `1/3198#1` (340301 de DIAZ del 01/09, pra 4940): la fila de orden apunta a la practica pero
  **la practica no apunta de vuelta** (`PraEstad` NULL, sin autorizacion), asi que no entra al
  lote. El script la rechazo por la guarda de vinculo. Su importe ya es el completo; queda solo
  la etiqueta `clas='GA'`. Revisar por que quedo a medio facturar.
- El ingreso 153 (FLORES) esta ademas en el lote 66, **destildado**: completarlo no duplica.

**Totales refrescados** (dos lecturas seguidas, aborta si no coinciden):

| lote | antes | despues |
|---|---|---|
| 70 | 14.531.344,67 | **14.777.674,45** |
| 66 | 57.413.591,80 | 57.413.591,80 (sin cambio: FLORES esta destildada) |

El salto del lote 70 es mas grande que los 8.328,24 de la correccion porque el
`LotImpTotal` guardado venia viejo: le faltaban 238.001,54 de GALARZA (ing 411). El item de
FLORES tambien se refresco en el lote 66 (3.062.420,21 -> 3.065.970,53) aunque no sume.

**Verificado despues de correr:** el mismo barrido devuelve **15 de 15 filas COMPLETA**, 0 a
completar, y guardado = calculado en los dos lotes (dif 0,00).

**Reversion:** `docs/snapshot-lote70-completar-2026-09-03.json` tiene el estado previo completo
(ordenes con sus items, practicas, items de lote y los lotes 66 y 70).

---

## 2026-09-03 — Orden 1/3325 (ANDRADA): plan alimentario del 28/08 con fecha de septiembre

**Reportado por:** Paula — "en el lote 66 faltan dos ordenes de ANDRADA MAXIMO LIONEL: el plan
alimentario del 28/8 y la fisioterapia del 1/9".

**Que se midio antes de tocar nada** (ingreso 450, INT-204, IPS, 20/08 -> 01/09):

- La **fisioterapia del 01/09** no faltaba: practica 4919 (`250110`) -> orden 1/3181,
  7.622,40, `fechaEmision` 01/09. Entra al periodo 2026-08 porque el periodo cierra el dia 1
  del mes siguiente, y el lote 70 la tiene en sus `ordenesExcluidas`. Las 12 sesiones del
  21/08 al 01/09 estaban todas en el 66.
- El **plan alimentario del 28/08** si faltaba: practica 5120 (`190303` PLAN ALIMENTARIO DE
  ALTA, 28/08, estado F, 8.969,53) -> orden 1/3325, emitida a mano el 03/09 13:36 con
  **`OrdFchEmi` y `OrdFchPed` = 2026-09-28** en vez de 2026-08-28. Mes tipeado mal.

**Por que se perdia:** el armado del lote filtra por `fechaEmision` (`whereFechaEmisionPeriodo`),
no por la fecha de la practica. Con 28/09 la orden quedaba fuera de 2026-08 y solo la levantaba
el lote 70, que no tiene periodo. Y ahi tampoco se cobraba: el item del ingreso 450 en el 70
esta **destildado** (`LItIncluido = false`), asi que sus 8.969,53 no sumaban a ningun total.

**Que se toco** (script `tmp-fix-3325.ts`, borrado despues):

```
Orden 1/3325       OrdFchEmi / OrdFchPed  2026-09-28 -> 2026-08-28
OrdenPrac 1/3325#1 OprFch                 ya estaba en 2026-08-28 (se reescribio igual)
LoteFacturacionOrdenExcluida  alta (lote 70, 1, 3325)
```

La exclusion en el 70 es necesaria: ese lote no filtra por fecha, asi que sin ella la orden
quedaba en los dos lotes a la vez. Los importes guardados se refrescaron con
`toggleOrdenLote(70, 1, 3325, false)` y `toggleOrdenLote(66, 1, 3325, true)`.

**Guardas del script** (aborta sin escribir): orden inexistente, de otro ingreso, anulada,
`fechaEmision` distinta de la medida, cantidad de items != 1, codigo != `190303`,
`practicaId` != 5120, practica que no es del 28/08, que no este en estado `F` o que no apunte
de vuelta a la orden, lotes 66 o 70 que no esten pendientes, o ingreso 450 repetido en un lote.

**Verificado despues de correr:**

| | antes | despues |
|---|---|---|
| ordenes visibles del ing 450 en el lote 66 | 25 | **26** (entra 1/3325) |
| item del ing 450 en el lote 66 | 5.175.324,85 | **5.184.294,38** |
| lote 66 | 57.413.591,80 | **57.422.561,33** (+8.969,53) |
| lote 70 | 14.777.674,45 | 14.777.674,45 (sin cambio: el item estaba destildado) |

En el lote 70 el guardado, el calculado por `obtenerLote` y la suma de items incluidos dan los
tres 14.777.674,45.

**Lo que quedo afuera a proposito** — dos practicas del mismo ingreso **sin ninguna orden**, que
no estan en ningun lote y hay que decidir si se cobran:

| practica | fecha | codigo | descripcion | importe |
|---|---|---|---|---|
| 4727 | 26/08 | 190303 | PLAN ALIMENTARIO DE ALTA | 8.969,53 |
| 4608 | 28/08 | 190401 | SOPORTE NUTRICIONAL EN INTERNADO | 25.114,17 |

La 4727 tenia la orden 1/3033, que quedo anulada (`OrdEstad = 'X'`) y nunca se refacturo.

**Reversion:** `docs/snapshot-orden3325-fecha-2026-09-03.json` tiene la orden con su item, la
practica 5120, los dos lotes y sus items del ingreso 450, y las exclusiones previas de ambos.

---

## 2026-09-04 — Lote 64: 340301 y 340302 sin honorario (ALVAREZ SANTILLAN)

**Reportado por:** Paula — "en el resumen 64 los codigos 340301 y 340302 tambien estan
incompletos, que a ninguno le falte especialista ni gastos".

**Alcance:** lote 64 (OSECAC CONV DIRECT, periodo 2026-08, PEN). 14 grupos
paciente+codigo+fecha con esos dos codigos, **12 ya estaban bien**. Los 2 incompletos son
del mismo paciente y la misma orden: ALVAREZ SANTILLAN, RICARDO DANIEL (ing 335 / INT-199),
orden 1/1388 del 13/08.

**Que estaba mal:** los dos items traian el importe de **gastos** y ningun honorario.

| Orden/item | Codigo | PraID | De | A | Falta |
|---|---|---|---|---|---|
| 1/1388/1 | 340301 | 2371 | 4.432,97 | 6.025,61 | HE 1.592,64 |
| 1/1388/2 | 340302 | 2372 | 3.723,70 | 4.254,58 | HE 530,88 |

Detalle que confunde al leerlo en pantalla: el item 1 tenia `OprClasAgrup='HE'` **con el
importe de gastos** (4.432,97 es el `NPrValGto` del 340301), y la cabecera
`OrdTitularModular='HONORARIO ESPECIALISTA'`. La etiqueta miente; el importe no. El item 2
tenia `OprModulo='GA'` y ninguna clasificacion.

**Se verifico antes** que el honorario no existiera en otro lado: en todo el ingreso 335 hay
**solo esas 2 filas** de 340301/340302 contando las ordenes anuladas, y no hay orden
hermana de `DERECHOS`/`HONORARIO ESPECIALISTA` como si tienen otros pacientes cargados en
el mismo minuto (1386/1387, 1391/1392). O sea que los honorarios nunca se cargaron; no es
un vinculo roto ni una practica partida.

**Fix:** la misma forma canonica del lote 43 y del lote 66 — `OprImpTotal` al valor
completo, `OprClasAgrup='HE+GA'`, `OprModulo=NULL`,
`OprTitularModular='HONORARIO ESPECIALISTA + DERECHOS'`, `OprImprimirDuplicado=true`, y
`PraImpTotal` igual. Cabecera 1388: 8.156,67 -> 10.280,19.

**Sobre la cabecera:** el precedente del lote 43 dice no tocar `OrdTitularModular` en
ordenes multi-item, para no mal-etiquetar los otros codigos. Aca la 1388 tiene 2 items y
**los dos** pasan a HE+GA, asi que esa razon no aplica y el titular se actualizo. El script
lo decide solo: reetiqueta la cabecera unicamente si todos los items de la orden cambian.

**Antes de escribir se verifico** que ningun otro lote activo tome esas ordenes: el ingreso
335 aparece ademas en el lote 39, **ANU**.

**Importes:** lote 64 de 290.674,66 a **292.798,18** (+2.123,52). Guardado y calculado
coincidian antes del cambio y vuelven a coincidir despues. Sigue en PEN.

**Verificacion:** los 14 grupos quedan con honorario y gastos (0 incompletos, 0 mal
etiquetados, 0 fuera del resumen).

**Snapshot / reversion:** `docs/snapshot-lote64-340301-2026-09-04.json` (practicas, las 2
filas de `OrdenPrac`, la cabecera, los items del lote y el lote).
